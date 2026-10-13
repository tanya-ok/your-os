import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import yaml from 'js-yaml';
import { ApiError, MAX_FILE_BYTES } from './config.js';
import { isRagRecordPath, RECORD_DIRECTORIES, recordDefinition } from './record-paths.js';
import { prepareDatabasePath } from './retrieval.js';
import { readSafe, safePath, safeRoot } from './safe-path.js';
import { atomicWrite } from './writer.js';

export const recordHash = (text) => createHash('sha256').update(text).digest('hex');
const clone = (value) => JSON.parse(JSON.stringify(value));
export async function ensureRecordParent(root, relative, create = true) {
  root = await safeRoot(root);
  const parts = relative.split('/').slice(0, -1);
  for (let i = 0; i < parts.length; i++) {
    const path = join(root, ...parts.slice(0, i + 1));
    try {
      if (create) await mkdir(path, { mode: 0o700 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    try {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink())
        throw new ApiError('Unsafe record directory', 409);
      await safeRoot(path);
    } catch (error) {
      if (!create && error.code === 'ENOENT') return false;
      throw error;
    }
  }
  return true;
}
export function parseRecordYaml(text) {
  if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new ApiError('Record is too large', 413);
  let depth = 0;
  try {
    const result = yaml.load(text, {
      schema: yaml.JSON_SCHEMA,
      listener(event, state) {
        if (state.anchor || Object.keys(state.anchorMap || {}).length)
          throw new Error('Anchors are not supported');
        depth += event === 'open' ? 1 : -1;
        if (depth > 40) throw new Error('Record nesting is too deep');
      },
    });
    if (result === undefined) throw new Error('Missing value');
    validateJsonValue(result);
    return clone(result);
  } catch {
    throw new ApiError('Invalid managed Markdown YAML; keep the draft and repair the file', 409);
  }
}
function validateJsonValue(value, depth = 0) {
  if (
    depth > 40 ||
    (typeof value === 'number' && !Number.isFinite(value)) ||
    !['object', 'string', 'boolean', 'number'].includes(typeof value)
  )
    throw new Error('Invalid JSON value');
  if (value && typeof value === 'object')
    for (const item of Object.values(value)) validateJsonValue(item, depth + 1);
}
const dump = (data) => {
  validateJsonValue(data);
  return yaml.dump(data, {
    schema: yaml.JSON_SCHEMA,
    noRefs: true,
    forceQuotes: true,
    quotingType: "'",
    lineWidth: 120,
    noCompatMode: true,
  });
};
export function decodeRecord(text, definition, key) {
  const head = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!head || Buffer.byteLength(head[1]) > 16 * 1024)
    throw new ApiError('Invalid managed record frontmatter', 409);
  const metadata = parseRecordYaml(head[1]);
  if (
    metadata.schema !== 'personal-os/record-v1' ||
    metadata.record_type !== definition.type ||
    metadata.record_id !== key
  )
    throw new ApiError('Managed record identity changed', 409);
  const body = text.slice(head[0].length);
  const matches = [...body.matchAll(/^## Data\r?\n[ \t]*\r?\n(~{3,}|`{3,})yaml[ \t]*\r?\n/gm)];
  if (matches.length !== 1) throw new ApiError('Managed record needs one Data section', 409);
  const match = matches[0];
  const start = head[0].length + match.index + match[0].length;
  const closing = new RegExp(`^${match[1]}[ \\t]*(?:\\r?\\n|$)`, 'm').exec(text.slice(start));
  if (!closing) throw new ApiError('Managed record Data fence is not closed', 409);
  return {
    data: parseRecordYaml(text.slice(start, start + closing.index)),
    metadata,
    start,
    end: start + closing.index,
    fence: match[1],
  };
}
export function encodeRecord(key, data, existing = '', migration) {
  const definition = recordDefinition(key);
  const payload = dump(data);
  if (existing) {
    const parsed = decodeRecord(existing, definition, key);
    if (new RegExp(`^${parsed.fence}[ \\t]*$`, 'm').test(payload))
      throw new ApiError('Data fence collision; repair the record before saving', 409);
    return existing.slice(0, parsed.start) + payload + existing.slice(parsed.end);
  }
  const fence = '~'.repeat(
    Math.max(3, ...[...payload.matchAll(/^~+/gm)].map((m) => m[0].length + 1))
  );
  const { path: _path, type, ...extra } = definition;
  const metadata = {
    schema: 'personal-os/record-v1',
    record_type: type,
    record_id: key,
    visibility: 'private',
    ...extra,
    ...(migration ? { migration } : {}),
  };
  const conversation =
    type === 'agent-session' && Array.isArray(data.messages)
      ? `\n## Conversation\n\n${data.messages
          .map(
            (message) =>
              `### ${message.role}\n\n${String(message.content)
                .split('\n')
                .map((line) => `> ${line}`)
                .join('\n')}`
          )
          .join('\n\n')}\n`
      : '';
  return `---\n${dump(metadata)}---\n# ${type.replaceAll('-', ' ')}\n\n## Data\n\n${fence}yaml\n${payload}${fence}\n${conversation}\n## Notes\n\n`;
}

export function createRecordStore({
  root,
  databasePath = ':memory:',
  lockRoot = join(root, 'record-locks'),
}) {
  let connection;
  async function db() {
    if (!connection)
      connection = (async () => {
        await prepareDatabasePath(databasePath);
        const value = new DatabaseSync(databasePath);
        value.exec(
          'PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS record_revisions(key TEXT PRIMARY KEY, hash TEXT NOT NULL, revision INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS native_snapshots(key TEXT PRIMARY KEY, json TEXT NOT NULL);'
        );
        return value;
      })();
    return connection;
  }
  async function lock(key, operation) {
    root = await safeRoot(root);
    lockRoot = join(await safeRoot(dirname(lockRoot)), lockRoot.split('/').at(-1));
    await ensureRecordParent(dirname(lockRoot), `${lockRoot.split('/').at(-1)}/lock`);
    const file = join(lockRoot, `${recordHash(key)}.lock`);
    let handle;
    for (let attempt = 0; attempt < 150; attempt++) {
      try {
        handle = await open(file, 'wx', 0o600);
        await handle.writeFile(`${process.pid}\n`);
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        // A lock owned by a live process is never expired by elapsed time.
        try {
          const saved = await readSafe(lockRoot, `${recordHash(key)}.lock`);
          const pid = Number(saved.text.trim());
          if (Number.isInteger(pid) && pid > 0) {
            try {
              process.kill(pid, 0);
            } catch (reason) {
              if (reason.code === 'ESRCH') await unlink(file);
            }
          }
        } catch {
          /* Another contender may already have removed the lock. */
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    if (!handle) throw new ApiError('Record is busy; keep the draft and retry', 409);
    try {
      return await operation();
    } finally {
      await handle.close();
      await unlink(file);
    }
  }
  async function read(key) {
    root = await safeRoot(root);
    const definition = recordDefinition(key);
    const file = (await ensureRecordParent(root, definition.path, false))
      ? await readSafe(root, definition.path)
      : { exists: false, text: '' };
    const parsed = file.exists ? decodeRecord(file.text, definition, key) : null;
    const hash = file.exists ? recordHash(file.text) : null;
    const store = await db();
    const old = store.prepare('SELECT hash,revision FROM record_revisions WHERE key=?').get(key);
    const revision = !file.exists
      ? 0
      : old?.hash === hash
        ? old.revision
        : Math.max(old?.revision || 0, parsed?.metadata.migration?.revision || 0) + 1;
    if (file.exists && old?.hash !== hash)
      store
        .prepare(
          'INSERT INTO record_revisions VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET hash=excluded.hash,revision=excluded.revision'
        )
        .run(key, hash, revision);
    return {
      data: parsed?.data ?? null,
      revision,
      hash,
      path: definition.path,
      exists: file.exists,
      text: file.text,
      metadata: parsed?.metadata,
    };
  }
  async function write(key, data, expected) {
    return lock(key, async () => {
      const current = await read(key);
      if (
        expected &&
        (expected.revision !== current.revision ||
          (current.exists && expected.hash !== current.hash))
      )
        throw new ApiError('Record changed; keep the draft and reload before editing', 409);
      return install(key, data, current);
    });
  }
  async function install(key, data, current) {
    const text = encodeRecord(key, data, current.text);
    if (Buffer.byteLength(text) > MAX_FILE_BYTES) throw new ApiError('Record is too large', 413);
    await ensureRecordParent(root, current.path);
    const latest = await readSafe(root, current.path);
    if ((latest.exists ? recordHash(latest.text) : null) !== current.hash)
      throw new ApiError('Record changed outside the dashboard; keep the draft', 409);
    await atomicWrite(await safePath(root, current.path), text);
    // The Markdown commit is complete even if a later technical index update fails.
    return { revision: current.revision + 1, hash: recordHash(text), path: current.path };
  }
  async function mutate(key, change) {
    return lock(key, async () => {
      const current = await read(key);
      const next = await change(clone(current.data), current);
      const result = await install(key, next, current);
      return { ...result, data: next };
    });
  }
  async function cached(key, data) {
    const store = await db();
    if (data === undefined) {
      const row = store.prepare('SELECT json FROM native_snapshots WHERE key=?').get(key);
      return row ? JSON.parse(row.json) : {};
    }
    store
      .prepare(
        'INSERT INTO native_snapshots VALUES(?,?) ON CONFLICT(key) DO UPDATE SET json=excluded.json'
      )
      .run(key, JSON.stringify(data));
  }
  async function close() {
    if (connection) {
      (await connection).close();
      connection = null;
    }
  }
  return { read, write, mutate, cached, close, root };
}

export async function listRecordFiles(root, { eligibleOnly = true } = {}) {
  root = await safeRoot(root);
  const result = [];
  for (const directory of RECORD_DIRECTORIES) {
    const relative = `Records/${directory}`;
    if (!(await ensureRecordParent(root, `${relative}/file.md`, false))) continue;
    for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (
        !entry.isFile() ||
        (eligibleOnly && !isRagRecordPath(path)) ||
        !entry.name.endsWith('.md')
      )
        continue;
      const file = await readSafe(root, path);
      if (!file.exists) continue;
      const head = file.text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
      if (!head) throw new ApiError('Invalid managed record', 409);
      const meta = parseRecordYaml(head[1]);
      if (recordDefinition(meta.record_id).path !== path)
        throw new ApiError('Managed record path changed', 409);
      decodeRecord(file.text, recordDefinition(meta.record_id), meta.record_id);
      if (eligibleOnly && meta.rag !== 'selected-only') continue;
      result.push({
        path,
        id: meta.record_id,
        title: meta.record_type.replaceAll('-', ' '),
        hash: recordHash(file.text),
      });
      if (result.length > 4000) throw new ApiError('Too many managed records', 413);
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
export async function readRagRecord(root, path) {
  if (!isRagRecordPath(path)) throw new ApiError('Record is not eligible for retrieval', 403);
  const file = await readSafe(root, path);
  if (!file.exists) throw new ApiError('Selected record is unavailable', 409);
  const head = file.text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!head) throw new ApiError('Invalid managed record', 409);
  const meta = parseRecordYaml(head[1]);
  if (meta.rag !== 'selected-only' || recordDefinition(meta.record_id).path !== path)
    throw new ApiError('Record is excluded from retrieval', 403);
  decodeRecord(file.text, recordDefinition(meta.record_id), meta.record_id);
  return file;
}
