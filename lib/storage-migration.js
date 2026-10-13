import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import { isDeepStrictEqual } from 'node:util';
import { ApiError } from './config.js';
import { joinNative, splitNative } from './markdown-work-log.js';
import { recordDefinition } from './record-paths.js';
import {
  createRecordStore,
  decodeRecord,
  encodeRecord,
  ensureRecordParent,
  recordHash,
} from './record-store.js';
import { readSafe, safePath, safeRoot } from './safe-path.js';
import { atomicWrite } from './writer.js';

const payloadHash = (data) => recordHash(JSON.stringify(data));
async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (e) {
    if (e.code === 'ENOENT') return false;
    throw e;
  }
}
const rows = (db, table) =>
  db && db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)
    ? db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all()
    : [];
function legacyDigest(path, tables) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    return payloadHash(tables.map((table) => rows(db, table)));
  } finally {
    db.close();
  }
}
export async function migrateStorage({
  root,
  privateRoot,
  workLogPath,
  dailySourcesPath,
  profilePath,
  scopeId,
  offline = false,
  afterInstall = async () => {},
}) {
  if (!offline) throw new ApiError('Storage migration requires the offline write barrier', 409);
  root = await safeRoot(root);
  privateRoot = await safeRoot(privateRoot);
  if (!/^[a-f0-9]{16}$/.test(scopeId)) throw new Error('Invalid storage scope');
  const manifestPath = join(privateRoot, `storage-${scopeId}.json`);
  const oldManifest = await readSafe(privateRoot, basename(manifestPath));
  let manifest = oldManifest.exists ? JSON.parse(oldManifest.text) : null;
  if (manifest)
    validateManifest(manifest, privateRoot, scopeId, {
      work: workLogPath,
      sources: dailySourcesPath,
      profile: profilePath,
      credentials: join(privateRoot, 'connections.json'),
    });
  if (manifest?.phase === 'complete') return { ...manifest.summary, repeated: true, manifestPath };
  if (
    manifest &&
    (manifest.schema !== 1 || manifest.scopeId !== scopeId || manifest.phase === 'rolled-back')
  )
    throw new ApiError('Storage manifest needs explicit reconciliation', 409);
  if (!manifest) {
    const id = randomUUID();
    const directory = join(privateRoot, 'storage-backups', id);
    await ensureRecordParent(privateRoot, `storage-backups/${id}/file`);
    manifest = {
      schema: 1,
      id,
      scopeId,
      phase: 'backed-up',
      createdAt: new Date().toISOString(),
      directory,
      backups: [],
      files: [],
      summary: {},
    };
    for (const [role, path] of [
      ['work', workLogPath],
      ['sources', dailySourcesPath],
    ]) {
      if (path === ':memory:' || !(await exists(path))) continue;
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
        throw new ApiError('Unsafe storage database', 409);
      const source = new DatabaseSync(path, { readOnly: true });
      const destination = join(directory, `${role}.sqlite`);
      try {
        await backup(source, destination);
      } finally {
        source.close();
      }
      await chmod(destination, 0o600);
      const check = new DatabaseSync(destination, { readOnly: true });
      try {
        if (Object.values(check.prepare('PRAGMA integrity_check').get())[0] !== 'ok')
          throw new Error('Backup integrity check failed');
      } finally {
        check.close();
      }
      const tables =
        role === 'work'
          ? ['local_state', 'work_entries', 'work_sessions']
          : ['daily_sources', 'daily_events', 'daily_meta'];
      manifest.backups.push({
        role,
        path,
        backup: destination,
        hash: recordHash(await readFile(destination)),
        integrity: 'ok',
        tables,
        legacyHash: legacyDigest(destination, tables),
      });
    }
    for (const [role, path] of [
      ['profile', profilePath],
      ['credentials', join(privateRoot, 'connections.json')],
    ]) {
      if (!(await exists(path))) continue;
      const file = await readSafe(privateRoot, basename(path));
      const destination = join(directory, `${role}.json`);
      await atomicWrite(destination, file.text);
      manifest.backups.push({ role, path, backup: destination, hash: recordHash(file.text) });
    }
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  for (const item of manifest.backups)
    if (recordHash(await readFile(item.backup)) !== item.hash)
      throw new ApiError('Storage backup checksum mismatch', 409);
  for (const item of manifest.backups)
    if (item.tables && legacyDigest(item.path, item.tables) !== item.legacyHash)
      throw new ApiError('Legacy data changed after backup; reconcile before migration', 409);
  const dbFor = (role) => {
    const item = manifest.backups.find((b) => b.role === role);
    return item ? new DatabaseSync(item.backup, { readOnly: true }) : null;
  };
  const work = dbFor('work'),
    sources = dbFor('sources');
  const plan = [];
  let nativeCache = null;
  let secrets = {};
  try {
    const existingSecrets = manifest.backups.find((b) => b.role === 'credentials');
    if (existingSecrets) secrets = JSON.parse(await readFile(existingSecrets.backup, 'utf8'));
    const states = rows(work, 'local_state');
    const entries = rows(work, 'work_entries');
    const sessions = rows(work, 'work_sessions');
    const definitions = rows(sources, 'daily_sources');
    const events = rows(sources, 'daily_events');
    const meta = rows(sources, 'daily_meta');
    const add = (key, data, revision = 0) => plan.push({ key, data, revision });
    for (const state of states) {
      const data = JSON.parse(state.json);
      if (state.key === 'main-native-connections') {
        const split = splitNative(data);
        nativeCache = split.cache;
        if (!isDeepStrictEqual(joinNative(split.settings, split.cache), data))
          throw new Error('Native snapshot comparison failed');
        add(state.key, split.settings, state.revision);
      } else add(state.key, data, state.revision);
    }
    const days = new Map();
    for (const entry of entries) {
      if (!days.has(entry.date)) days.set(entry.date, []);
      days
        .get(entry.date)
        .push({ id: entry.id, text: entry.text, createdAt: entry.created_at, date: entry.date });
    }
    for (const [date, data] of days) add(`work-completed-${date}`, data);
    if (sessions.length)
      add(
        'work-sessions',
        sessions.map((s) => ({ id: s.id, startedAt: s.started_at, endedAt: s.ended_at }))
      );
    if (events.length)
      add(
        'calendar-local-events',
        events.map((e) => JSON.parse(e.body))
      );
    if (definitions.length) {
      add(
        'settings-sources',
        definitions.map((d) => {
          const credentialRef = `source-${d.id}`;
          if (Object.hasOwn(secrets, credentialRef) && secrets[credentialRef] !== d.url)
            throw new Error('Credential reference collision');
          secrets[credentialRef] = d.url;
          return { id: d.id, kind: d.kind, title: d.title, credentialRef };
        })
      );
    }
    const profile = manifest.backups.find((b) => b.role === 'profile');
    if (profile) add('settings-workspace', JSON.parse(await readFile(profile.backup, 'utf8')));
    manifest.summary = {
      localState: states.length,
      workEntries: entries.length,
      workSessions: sessions.length,
      localEvents: events.length,
      sourceDefinitions: definitions.length,
      sourceMeta: meta.length,
      records: plan.length,
      comparisons: 0,
      failures: 0,
      backupIntegrity: manifest.backups
        .filter((b) => b.integrity)
        .map((b) => ({ role: b.role, result: b.integrity })),
    };
  } finally {
    work?.close();
    sources?.close();
  }
  if (new Set(plan.map((p) => recordDefinition(p.key).path)).size !== plan.length)
    throw new Error('Storage destination collision');
  if (manifest.phase === 'backed-up') {
    await ensureRecordParent(manifest.directory, 'staged/file.md');
    for (const item of plan) {
      const definition = recordDefinition(item.key);
      if (await ensureRecordParent(root, definition.path, false)) {
        if ((await readSafe(root, definition.path)).exists)
          throw new ApiError(
            'Migration destination already exists; reconcile before continuing',
            409
          );
      }
      const text = encodeRecord(item.key, item.data, '', {
        key: item.key,
        scope: scopeId,
        revision: item.revision,
        backup: manifest.id,
      });
      if (!isDeepStrictEqual(decodeRecord(text, definition, item.key).data, item.data))
        throw new Error('Staged record comparison failed');
      const staged = join(manifest.directory, 'staged', `${recordHash(item.key)}.md`);
      await atomicWrite(staged, text);
      manifest.files.push({
        key: item.key,
        path: definition.path,
        staged,
        hash: recordHash(text),
        payloadHash: payloadHash(item.data),
        installed: false,
      });
    }
    manifest.nativeCache = nativeCache;
    if (Object.keys(secrets).length) {
      const staged = join(manifest.directory, 'staged', 'connections.json');
      const text = `${JSON.stringify(secrets, null, 2)}\n`;
      await atomicWrite(staged, text);
      manifest.credentials = {
        staged,
        hash: recordHash(text),
        path: join(privateRoot, 'connections.json'),
      };
    }
    manifest.phase = 'prepared';
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  for (const item of manifest.files) {
    const staged = await readFile(item.staged, 'utf8');
    if (recordHash(staged) !== item.hash) throw new Error('Staged record checksum mismatch');
    await ensureRecordParent(root, item.path);
    const current = await readSafe(root, item.path);
    if (current.exists && recordHash(current.text) !== item.hash)
      throw new ApiError('Migration record changed; keep all files and reconcile', 409);
    if (!current.exists) await atomicWrite(await safePath(root, item.path), staged);
    item.installed = true;
    await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    await afterInstall(item.path);
  }
  if (manifest.credentials) {
    const text = await readFile(manifest.credentials.staged, 'utf8');
    if (recordHash(text) !== manifest.credentials.hash)
      throw new Error('Credential staging checksum mismatch');
    const current = await readSafe(privateRoot, 'connections.json');
    const prior = manifest.backups.find((b) => b.role === 'credentials');
    if (
      current.exists &&
      recordHash(current.text) !== manifest.credentials.hash &&
      recordHash(current.text) !== prior?.hash
    )
      throw new ApiError('Credentials changed during migration', 409);
    await atomicWrite(manifest.credentials.path, text);
  }
  const records = createRecordStore({
    root,
    databasePath: workLogPath,
    lockRoot: join(privateRoot, 'record-locks'),
  });
  try {
    if (manifest.nativeCache) {
      await records.cached('main-native-connections', manifest.nativeCache);
      if (!isDeepStrictEqual(await records.cached('main-native-connections'), manifest.nativeCache))
        throw new Error('Installed native cache comparison failed');
    }
  } finally {
    await records.close();
  }
  for (const item of manifest.files) {
    const current = await readSafe(root, item.path);
    if (
      recordHash(current.text) !== item.hash ||
      payloadHash(decodeRecord(current.text, recordDefinition(item.key), item.key).data) !==
        item.payloadHash
    )
      throw new Error('Installed record comparison failed');
    manifest.summary.comparisons++;
  }
  manifest.phase = 'complete';
  manifest.completedAt = new Date().toISOString();
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { ...manifest.summary, manifestPath };
}

export async function rollbackStorage({ root, privateRoot, scopeId, offline = false }) {
  if (!offline) throw new ApiError('Rollback requires the offline write barrier', 409);
  const manifestPath = join(privateRoot, `storage-${scopeId}.json`);
  const manifest = JSON.parse((await readSafe(privateRoot, basename(manifestPath))).text);
  validateManifest(manifest, privateRoot, scopeId);
  if (!['prepared', 'complete'].includes(manifest.phase))
    throw new ApiError('No rollback is available', 409);
  for (const item of manifest.backups)
    if (recordHash(await readFile(item.backup)) !== item.hash)
      throw new Error('Backup checksum mismatch');
  for (const item of manifest.files) {
    const current = await readSafe(root, item.path);
    if (current.exists && recordHash(current.text) !== item.hash)
      throw new ApiError('Post-migration edits exist; rollback requires reconciliation', 409);
  }
  if (manifest.credentials) {
    const file = await readSafe(privateRoot, 'connections.json');
    if (file.exists && recordHash(file.text) !== manifest.credentials.hash)
      throw new ApiError('Post-migration credential edits exist', 409);
  }
  for (const item of manifest.backups) {
    if (
      !item.integrity &&
      item.role !== 'credentials' &&
      recordHash(await readFile(item.path)) !== item.hash
    )
      throw new ApiError('Legacy profile changed after migration; reconcile before rollback', 409);
    if (item.integrity) {
      for (const suffix of ['-wal', '-shm'])
        try {
          await unlink(item.path + suffix);
        } catch (e) {
          if (e.code !== 'ENOENT') throw e;
        }
    }
    await atomicWrite(item.path, await readFile(item.backup));
  }
  if (manifest.credentials && !manifest.backups.some((b) => b.role === 'credentials'))
    await unlink(manifest.credentials.path);
  for (const item of manifest.files)
    try {
      await unlink(await safePath(root, item.path));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  manifest.phase = 'rolled-back';
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { rolledBack: true };
}

function validateManifest(manifest, privateRoot, scopeId, paths) {
  if (manifest.schema !== 1 || manifest.scopeId !== scopeId || !/^[a-f0-9-]{36}$/.test(manifest.id))
    throw new ApiError('Invalid storage manifest', 409);
  const directory = join(privateRoot, 'storage-backups', manifest.id);
  if (
    manifest.directory !== directory ||
    !Array.isArray(manifest.backups) ||
    !Array.isArray(manifest.files)
  )
    throw new ApiError('Invalid storage manifest paths', 409);
  for (const item of manifest.backups) {
    if (
      !['work', 'sources', 'profile', 'credentials'].includes(item.role) ||
      item.backup !== join(directory, `${item.role}.${item.integrity ? 'sqlite' : 'json'}`) ||
      (paths && item.path !== paths[item.role])
    )
      throw new ApiError('Invalid backup path', 409);
    if (!paths && !item.path.startsWith(`${privateRoot}/`))
      throw new ApiError('Invalid rollback destination', 409);
  }
  for (const item of manifest.files)
    if (
      item.path !== recordDefinition(item.key).path ||
      item.staged !== join(directory, 'staged', `${recordHash(item.key)}.md`)
    )
      throw new ApiError('Invalid record staging path', 409);
  if (
    manifest.credentials &&
    (manifest.credentials.path !== join(privateRoot, 'connections.json') ||
      manifest.credentials.staged !== join(directory, 'staged', 'connections.json'))
  )
    throw new ApiError('Invalid credential path', 409);
}
