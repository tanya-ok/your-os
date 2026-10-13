import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { ApiError } from './config.js';
import { prepareDatabasePath } from './retrieval.js';

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(+date) && date.toISOString().slice(0, 10) === value;
  });
const entrySchema = z.strictObject({ date: dateSchema, text: z.string().trim().min(1).max(1200) });
export function workDate(instant = Date.now(), timezone = 'UTC') {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(instant));
  } catch {
    return new Date(instant).toISOString().slice(0, 10);
  }
}
export function createWorkLog({ databasePath = ':memory:', now = Date.now } = {}) {
  let connection;
  async function db() {
    if (!connection)
      connection = (async () => {
        await prepareDatabasePath(databasePath);
        const value = new DatabaseSync(databasePath);
        value.exec(
          'PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS local_state (key TEXT PRIMARY KEY,json TEXT NOT NULL,revision INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS work_entries (id TEXT PRIMARY KEY,date TEXT NOT NULL,text TEXT NOT NULL,created_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS work_entries_date ON work_entries(date); CREATE TABLE IF NOT EXISTS work_sessions (id TEXT PRIMARY KEY,started_at INTEGER NOT NULL,ended_at INTEGER); CREATE UNIQUE INDEX IF NOT EXISTS one_active_session ON work_sessions((1)) WHERE ended_at IS NULL;'
        );
        return value;
      })().catch(() => {
        connection = null;
        throw new ApiError('Local work history is unavailable', 409);
      });
    return connection;
  }
  async function list({ date = workDate(now()), timezone = 'UTC' } = {}) {
    const parsed = dateSchema.safeParse(date);
    if (!parsed.success) throw new ApiError('Invalid work day');
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      throw new ApiError('Invalid timezone');
    }
    const store = await db();
    const entries = store
      .prepare(
        'SELECT id,text,created_at AS createdAt FROM work_entries WHERE date=? ORDER BY created_at DESC,id DESC LIMIT 100'
      )
      .all(date);
    const recent = store
      .prepare(
        'SELECT id,started_at AS startedAt,ended_at AS endedAt FROM work_sessions ORDER BY started_at DESC LIMIT 2000'
      )
      .all();
    const sessions = recent
      .filter(
        (session) =>
          session.endedAt !== null &&
          workDate(session.startedAt, timezone) <= date &&
          workDate(session.endedAt, timezone) >= date
      )
      .reverse();
    const active = recent.find((session) => session.endedAt === null) || null;
    return { date, entries, sessions, active };
  }
  async function add(input) {
    const parsed = entrySchema.safeParse(input);
    if (!parsed.success) throw new ApiError('Add a dated work note of 1-1200 characters');
    const store = await db();
    if (
      store.prepare('SELECT count(*) n FROM work_entries WHERE date=?').get(parsed.data.date).n >=
      100
    )
      throw new ApiError('This day already has 100 entries', 413);
    const entry = { id: randomUUID(), text: parsed.data.text, createdAt: now() };
    store
      .prepare('INSERT INTO work_entries VALUES (?,?,?,?)')
      .run(entry.id, parsed.data.date, entry.text, entry.createdAt);
    return entry;
  }
  async function remove(id) {
    if (!z.uuid().safeParse(id).success) throw new ApiError('Invalid work entry');
    const result = (await db()).prepare('DELETE FROM work_entries WHERE id=?').run(id);
    if (!result.changes) throw new ApiError('Work entry not found', 404);
    return { ok: true };
  }
  async function session(input) {
    const parsed = z.strictObject({ action: z.enum(['start', 'end']) }).safeParse(input);
    if (!parsed.success) throw new ApiError('Invalid session action');
    const store = await db();
    let active = store
      .prepare('SELECT id,started_at AS startedAt FROM work_sessions WHERE ended_at IS NULL')
      .get();
    if (parsed.data.action === 'start' && !active) {
      active = { id: randomUUID(), startedAt: now() };
      store.prepare('INSERT INTO work_sessions VALUES (?,?,NULL)').run(active.id, active.startedAt);
    } else if (parsed.data.action === 'end' && active) {
      store
        .prepare('UPDATE work_sessions SET ended_at=? WHERE id=? AND ended_at IS NULL')
        .run(Math.max(now(), active.startedAt), active.id);
    }
    return { ok: true };
  }
  async function close() {
    if (connection) {
      (await connection).close();
      connection = null;
    }
  }
  function stateKey(key) {
    if (
      typeof key !== 'string' ||
      !/^(?:home|career|learning|main|checkin|focus|library)-[a-zA-Z0-9_-]{1,58}$/.test(key)
    )
      throw new ApiError('Invalid state key');
  }
  async function getState(key) {
    stateKey(key);
    const row = (await db()).prepare('SELECT json,revision FROM local_state WHERE key=?').get(key);
    return row
      ? { data: JSON.parse(row.json), revision: row.revision }
      : { data: null, revision: 0 };
  }
  async function putState(key, input) {
    stateKey(key);
    if (
      !input ||
      !Object.hasOwn(input, 'data') ||
      !Number.isInteger(input.revision) ||
      input.revision < 0 ||
      Object.keys(input).some((k) => !['data', 'revision'].includes(k))
    )
      throw new ApiError('Invalid saved state');
    const json = JSON.stringify(input.data);
    if (typeof json !== 'string' || Buffer.byteLength(json) > 128 * 1024)
      throw new ApiError('Saved state exceeds 128 KiB', 413);
    const store = await db();
    store.exec('BEGIN IMMEDIATE');
    try {
      const current =
        store.prepare('SELECT revision FROM local_state WHERE key=?').get(key)?.revision || 0;
      if (current !== input.revision)
        throw new ApiError('State changed in another tab; reload before editing', 409);
      const revision = current + 1;
      store
        .prepare(
          'INSERT INTO local_state VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json,revision=excluded.revision'
        )
        .run(key, json, revision);
      store.exec('COMMIT');
      return { revision };
    } catch (error) {
      store.exec('ROLLBACK');
      throw error;
    }
  }
  return { list, add, remove, session, close, getState, putState };
}
