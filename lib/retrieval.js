import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ApiError } from './config.js';
import { allowedVaultPath } from './safe-path.js';

// Accepted claims reach retrieval only after the agent has checked their human review.
const ACCEPTED_CLAIM = /^Accepted\/claim-\d{8}-[0-9a-f]{8}\.md$/;

const INPUT_BYTES = 2 * 1024 * 1024;
const RESULT_BYTES = 12 * 1024;
const CHUNK_CHARACTERS = 1000;
const MAX_FILES = 103;

function validate(files, query) {
  if (
    !Array.isArray(files) ||
    files.length > MAX_FILES ||
    typeof query !== 'string' ||
    query.length > 500
  )
    throw new ApiError('Invalid retrieval request');
  let bytes = 0;
  const seen = new Set();
  for (const file of files) {
    if (
      !file ||
      !(allowedVaultPath(file.path) || ACCEPTED_CLAIM.test(file.path)) ||
      file.path.length > 96 ||
      typeof file.text !== 'string' ||
      seen.has(file.path)
    )
      throw new ApiError('Invalid retrieval scope');
    seen.add(file.path);
    bytes += Buffer.byteLength(file.text);
    if (bytes > INPUT_BYTES) throw new ApiError('Selected retrieval scope is too large', 413);
  }
}

function chunks(text) {
  const result = [];
  let offset = 0;
  let line = 1;
  while (offset < text.length) {
    let end = Math.min(text.length, offset + CHUNK_CHARACTERS);
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end - 1);
      if (newline >= offset + CHUNK_CHARACTERS / 2) end = newline + 1;
      if (/[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    const part = text.slice(offset, end);
    const lineBreaks = (part.match(/\n/g) || []).length;
    if (part.trim())
      result.push({
        text: part,
        startLine: line,
        endLine: Math.max(line, line + lineBreaks - (part.endsWith('\n') ? 1 : 0)),
      });
    line += lineBreaks;
    offset = end;
  }
  return result;
}

function matchQuery(query) {
  const tokens = query.normalize('NFKC').match(/[\p{L}\p{N}][\p{L}\p{N}\p{M}]*/gu) || [];
  return [...new Set(tokens.map((token) => token.slice(0, 64).toLowerCase()))]
    .slice(0, 16)
    .map((token) => `"${token}"*`)
    .join(' OR ');
}

export async function prepareDatabasePath(databasePath) {
  if (databasePath === ':memory:') return;
  if (
    typeof databasePath !== 'string' ||
    !isAbsolute(databasePath) ||
    resolve(databasePath) !== databasePath
  )
    throw new Error('Unsafe database path');
  const parent = dirname(databasePath);
  const directory = await lstat(parent);
  if (!directory.isDirectory() || directory.isSymbolicLink() || (await realpath(parent)) !== parent)
    throw new Error('Unsafe database directory');
  let stat;
  try {
    stat = await lstat(databasePath);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    let handle;
    try {
      handle = await open(
        databasePath,
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600
      );
    } catch (failure) {
      if (failure.code !== 'EEXIST') throw failure;
    } finally {
      await handle?.close();
    }
    stat = await lstat(databasePath);
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (await realpath(databasePath)) !== databasePath
  )
    throw new Error('Unsafe database file');
  // SQLite opens its own journal; refuse pre-existing linked sidecar files too.
  for (const suffix of ['-journal', '-wal', '-shm']) {
    try {
      const sidecar = await lstat(`${databasePath}${suffix}`);
      if (!sidecar.isFile() || sidecar.isSymbolicLink() || sidecar.nlink !== 1)
        throw new Error('Unsafe database journal');
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

function clip(text, byteLimit) {
  if (Buffer.byteLength(text) <= byteLimit) return text;
  let result = '';
  let bytes = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character);
    if (bytes + size > byteLimit) break;
    result += character;
    bytes += size;
  }
  return result;
}

/** Local lexical retrieval over exactly the approved files. Markdown remains authoritative. */
export function createRetrieval({ databasePath = ':memory:' } = {}) {
  async function retrieve({ files, query }) {
    validate(files, query);
    let database;
    try {
      await prepareDatabasePath(databasePath);
      database = new DatabaseSync(databasePath);
      database.exec(`PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=3000;
        CREATE TABLE IF NOT EXISTS notes (path TEXT PRIMARY KEY, hash TEXT NOT NULL);
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks USING fts5(path UNINDEXED, start_line UNINDEXED, end_line UNINDEXED, text, tokenize='unicode61 remove_diacritics 2');`);
      const active = files.filter((file) => file.text.trim());
      const paths = active.map((file) => file.path);
      const placeholders = paths.map(() => '?').join(',');
      const deleteChunks = database.prepare('DELETE FROM chunks WHERE path = ?');
      const deleteNote = database.prepare('DELETE FROM notes WHERE path = ?');
      const getHash = database.prepare('SELECT hash FROM notes WHERE path = ?');
      const putNote = database.prepare(
        'INSERT INTO notes(path, hash) VALUES (?, ?) ON CONFLICT(path) DO UPDATE SET hash = excluded.hash'
      );
      const putChunk = database.prepare(
        'INSERT INTO chunks(path, start_line, end_line, text) VALUES (?, ?, ?, ?)'
      );
      database.exec('BEGIN IMMEDIATE');
      try {
        for (const stored of database.prepare('SELECT path FROM notes').all()) {
          if (!paths.includes(stored.path)) {
            deleteChunks.run(stored.path);
            deleteNote.run(stored.path);
          }
        }
        for (const file of active) {
          const hash = createHash('sha256').update(file.text).digest('hex');
          if (getHash.get(file.path)?.hash === hash) continue;
          deleteChunks.run(file.path);
          putNote.run(file.path, hash);
          for (const chunk of chunks(file.text))
            putChunk.run(file.path, chunk.startLine, chunk.endLine, chunk.text);
        }
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
      const indexedChunks = Number(
        database.prepare('SELECT count(*) AS count FROM chunks').get().count
      );
      const expression = matchQuery(query);
      const matches =
        expression && paths.length
          ? database
              .prepare(
                `SELECT path, text, start_line, end_line FROM chunks WHERE chunks MATCH ? AND path IN (${placeholders}) ORDER BY bm25(chunks), path, CAST(start_line AS INTEGER) LIMIT 6`
              )
              .all(expression, ...paths)
          : [];
      const notes = [];
      let remaining = RESULT_BYTES;
      for (const match of matches) {
        const text = clip(match.text, remaining);
        if (!text.trim()) continue;
        const startLine = Number(match.start_line);
        const endLine = Math.min(
          Number(match.end_line),
          Math.max(
            startLine,
            startLine + (text.match(/\n/g) || []).length - (text.endsWith('\n') ? 1 : 0)
          )
        );
        notes.push({ path: match.path, text, startLine, endLine });
        remaining -= Buffer.byteLength(text);
        if (!remaining) break;
      }
      return {
        notes,
        retrieval: {
          method: 'sqlite-fts5-bm25',
          query,
          indexedNotes: active.length,
          indexedChunks,
          sources: notes.map(({ path, startLine, endLine }) => ({ path, startLine, endLine })),
        },
      };
    } catch {
      throw new ApiError('Local retrieval database is unavailable or unsafe', 503);
    } finally {
      database?.close();
    }
  }
  return { retrieve };
}
