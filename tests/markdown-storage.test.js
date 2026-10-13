import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createAgent } from '../lib/agent.js';
import { createDailySources } from '../lib/daily-sources.js';
import { createMarkdownDailySources } from '../lib/markdown-daily-sources.js';
import { createMarkdownWorkLog } from '../lib/markdown-work-log.js';
import { defaultProfile } from '../lib/profile.js';
import { recordDefinition } from '../lib/record-paths.js';
import {
  createRecordStore,
  decodeRecord,
  encodeRecord,
  parseRecordYaml,
  readRagRecord,
} from '../lib/record-store.js';
import { acquireRuntimeLease } from '../lib/runtime-lease.js';
import { migrateStorage, rollbackStorage } from '../lib/storage-migration.js';
import { createWorkLog } from '../lib/work-log.js';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';
import { createStoredStateClient } from '../src/hooks/stored-state-client.js';

async function fixture(t) {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'personal-os-md-')));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = join(directory, 'vault');
  const privateRoot = join(directory, 'private');
  await mkdir(root);
  await mkdir(privateRoot);
  await mkdir(join(root, 'Projects'));
  const options = {
    root,
    privateRoot,
    scopeId: '0123456789abcdef',
    offline: true,
    workLogPath: join(privateRoot, 'work.sqlite'),
    dailySourcesPath: join(privateRoot, 'sources.sqlite'),
    profilePath: join(privateRoot, 'profile.json'),
  };
  const records = createRecordStore({
    root,
    databasePath: options.workLogPath,
    lockRoot: join(privateRoot, 'record-locks'),
  });
  t.after(() => records.close());
  return { ...options, records, options };
}
async function legacyFixture(t) {
  const f = await fixture(t);
  const states = {
    'checkin-2026-10-07': {
      energy: 2,
      mood: 5,
      extra: { keep: false, zero: 0, empty: '', text: 'café' },
    },
    'library-resources': {
      items: [
        { id: 'one', title: 'A resource', notes: 'Local annotation', genres: ['Logic'], custom: 0 },
      ],
    },
    'home-weeks': { 1: { theme: 'A welcoming home', notes: 'A quiet corner' } },
    'focus-unknown': false,
    'main-native-connections': {
      calendar: {
        calendarIds: ['one'],
        calendars: [{ id: 'one' }],
        events: [{ title: 'Cached appointment' }],
        lastSync: '2026-10-07',
      },
      reminders: null,
      custom: 1,
    },
  };
  const work = createWorkLog({
    databasePath: f.workLogPath,
    now: () => Date.parse('2026-10-07T10:00Z'),
  });
  for (const [key, data] of Object.entries(states)) await work.putState(key, { data, revision: 0 });
  const entry = await work.add({ date: '2026-10-07', text: 'Finished a small step' });
  await work.session({ action: 'start' });
  await work.session({ action: 'end' });
  await work.close();
  const sources = createDailySources({ databasePath: f.dailySourcesPath, demo: false });
  const source = await sources.add({
    title: 'Reading',
    kind: 'rss',
    url: 'https://example.org/feed?token=fictional-secret',
  });
  const event = await sources.saveEvent({
    title: 'A field walk',
    start: '2026-10-07T12:00Z',
    end: '2026-10-07T13:00Z',
  });
  await sources.close();
  await atomicWrite(f.profilePath, JSON.stringify(defaultProfile()));
  return { ...f, states, entry, source, event };
}

test('Markdown preserves typed values, unknown fields, frontmatter and free Notes', async (t) => {
  const { records, root } = await fixture(t);
  const key = 'library-resources';
  const value = { items: [], unknown: { n: 0, b: false, s: '', unicode: 'café' } };
  await records.write(key, value, { revision: 0 });
  const path = join(root, recordDefinition(key).path);
  let text = await readFile(path, 'utf8');
  text = text
    .replace('visibility:', "custom_frontmatter: 'keep exact'\nvisibility:")
    .replace('## Notes\n\n', '## Notes\n\nMy own paragraphs.\n');
  await atomicWrite(path, text);
  const before = await records.read(key);
  assert.deepEqual(before.data, value);
  await records.write(key, { ...before.data, items: [{ id: 'one', notes: 'A note' }] }, before);
  const after = await readFile(path, 'utf8');
  assert.ok(after.startsWith(text.slice(0, before.start || text.indexOf('## Data'))));
  assert.match(after, /custom_frontmatter: 'keep exact'/);
  assert.match(after, /My own paragraphs/);
  assert.deepEqual((await records.read(key)).data.unknown, value.unknown);
});

test('YAML rejects aliases, tags, duplicates, infinite numbers and malformed managed files', async (t) => {
  for (const text of [
    'x: &a 1\ny: *a',
    'x: !!js/function function(){}',
    'x: 1\nx: 2',
    'x: .inf',
    'x: -.Inf',
    'x: .nan',
    'x: [',
  ])
    assert.throws(() => parseRecordYaml(text));
  // js-yaml 4.3 reads an overflowing literal as a string; no non-finite number may appear.
  assert.deepEqual(parseRecordYaml('x: 1e309'), { x: '1e309' });
  const { records, root } = await fixture(t);
  await records.write('main-decisions', ['Slow down'], { revision: 0 });
  const path = join(root, 'Records/Main/decisions.md');
  await atomicWrite(path, (await readFile(path, 'utf8')).replace('## Data', '## Missing'));
  await assert.rejects(records.read('main-decisions'), /Data section/);
  assert.match(await readFile(path, 'utf8'), /Slow down/);
});

test('External edits and simultaneous writers cannot silently replace a newer record', async (t) => {
  const { records, root, workLogPath, privateRoot } = await fixture(t);
  await records.write('main-decisions', ['Slow down'], { revision: 0 });
  const snapshot = await records.read('main-decisions');
  const other = createRecordStore({
    root,
    databasePath: workLogPath,
    lockRoot: join(privateRoot, 'record-locks'),
  });
  const results = await Promise.allSettled([
    records.write('main-decisions', ['One'], snapshot),
    other.write('main-decisions', ['Two'], snapshot),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const fresh = await records.read('main-decisions');
  const path = join(root, fresh.path);
  await atomicWrite(path, (await readFile(path, 'utf8')) + '\nAn external note.\n');
  await assert.rejects(records.write('main-decisions', ['Stale'], fresh), /changed/);
  assert.match(await readFile(path, 'utf8'), /external note/);
  await other.close();
});

test('Removing the technical SQLite index preserves canonical records and stale hashes still fail', async (t) => {
  const f = await fixture(t);
  const data = { energy: 1, mood: 3 };
  await f.records.write('checkin-2026-10-07', data, { revision: 0 });
  const before = await f.records.read('checkin-2026-10-07');
  await f.records.close();
  await unlink(f.workLogPath);
  const rebuilt = await f.records.read('checkin-2026-10-07');
  assert.deepEqual(rebuilt.data, data);
  assert.equal(rebuilt.hash, before.hash);
  await assert.rejects(
    f.records.write('checkin-2026-10-07', {}, { ...rebuilt, hash: 'wrong' }),
    /changed/
  );
});

test('Unsafe record symlinks never follow or replace their targets', async (t) => {
  const { records, root, privateRoot } = await fixture(t);
  await mkdir(join(root, 'Records'));
  await symlink(privateRoot, join(root, 'Records/Main'));
  await assert.rejects(records.write('main-decisions', [], { revision: 0 }), /Unsafe/);
});

test('Migration backs up closed SQLite snapshots and compares every canonical payload', async (t) => {
  const f = await legacyFixture(t);
  const result = await migrateStorage(f.options);
  assert.equal(result.localState, 5);
  assert.equal(result.workEntries, 1);
  assert.equal(result.workSessions, 1);
  assert.equal(result.localEvents, 1);
  assert.equal(result.sourceDefinitions, 1);
  assert.equal(result.failures, 0);
  assert.equal(result.comparisons, result.records);
  assert.deepEqual(result.backupIntegrity, [
    { role: 'work', result: 'ok' },
    { role: 'sources', result: 'ok' },
  ]);
  const state = createMarkdownWorkLog({ records: f.records });
  for (const [key, data] of Object.entries(f.states))
    assert.deepEqual((await state.getState(key)).data, data);
  const day = await state.list({ date: '2026-10-07' });
  assert.equal(day.entries[0].id, f.entry.id);
  assert.equal(day.sessions.length, 1);
  assert.deepEqual((await f.records.read('calendar-local-events')).data, [f.event]);
  const settings = await f.records.read('settings-sources');
  assert.ok(!settings.text.includes('fictional-secret'));
  assert.match(await readFile(join(f.privateRoot, 'connections.json'), 'utf8'), /fictional-secret/);
  const db = new DatabaseSync(f.workLogPath, { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) AS n FROM local_state').get().n, 5);
  db.close();
  await f.records.mutate('main-decisions', () => ['New user decision']);
  assert.equal((await migrateStorage(f.options)).repeated, true);
  assert.deepEqual((await f.records.read('main-decisions')).data, ['New user decision']);
});

test('Interrupted migration resumes without duplicate records or missing rows', async (t) => {
  const f = await legacyFixture(t);
  let count = 0;
  await assert.rejects(
    migrateStorage({
      ...f.options,
      afterInstall: async () => {
        if (++count === 2) throw new Error('Simulated interruption');
      },
    }),
    /interruption/
  );
  const result = await migrateStorage(f.options);
  assert.equal(result.comparisons, result.records);
  assert.equal(result.failures, 0);
  assert.deepEqual((await f.records.read('library-resources')).data, f.states['library-resources']);
});

test('Existing destinations, changed legacy data and damaged backups stop migration visibly', async (t) => {
  const f = await legacyFixture(t);
  await f.records.write('library-resources', { items: ['Do not overwrite'] }, { revision: 0 });
  await assert.rejects(migrateStorage(f.options), /already exists/);
  assert.deepEqual((await f.records.read('library-resources')).data, {
    items: ['Do not overwrite'],
  });
  const manifest = JSON.parse(
    await readFile(join(f.privateRoot, `storage-${f.scopeId}.json`), 'utf8')
  );
  const db = new DatabaseSync(f.workLogPath);
  db.prepare('UPDATE local_state SET revision=revision+1').run();
  db.close();
  await assert.rejects(migrateStorage(f.options), /Legacy data changed/);
  await atomicWrite(manifest.backups[0].backup, 'Damaged backup');
  await assert.rejects(migrateStorage(f.options), /checksum mismatch/);
});

test('Rollback restores untouched legacy storage and refuses subsequent user edits', async (t) => {
  const f = await legacyFixture(t);
  await migrateStorage(f.options);
  await f.records.close();
  assert.deepEqual(await rollbackStorage(f.options), { rolledBack: true });
  await assert.rejects(readFile(join(f.root, 'Records/Library/resources.md')), /ENOENT/);
  const db = new DatabaseSync(f.workLogPath, { readOnly: true });
  assert.equal(db.prepare('SELECT count(*) AS n FROM local_state').get().n, 5);
  db.close();
  const second = await legacyFixture(t);
  await migrateStorage(second.options);
  await second.records.mutate('library-resources', (value) => ({
    ...value,
    notes: 'After migration',
  }));
  await assert.rejects(rollbackStorage(second.options), /Post-migration edits/);
  assert.equal((await second.records.read('library-resources')).data.notes, 'After migration');
});

test('Source settings and local events rebuild from Markdown without external fetches', async (t) => {
  const f = await legacyFixture(t);
  await migrateStorage(f.options);
  let network = 0;
  const create = () =>
    createMarkdownDailySources({
      records: f.records,
      credentialsPath: join(f.privateRoot, 'connections.json'),
      databasePath: f.dailySourcesPath,
      fetchFeed: () => {
        network++;
        throw new Error('Unexpected fetch');
      },
    });
  let sources = create();
  const first = await sources.list({ date: '2026-10-07' });
  assert.equal(first.events.length, 1);
  assert.equal(first.sources[0].id, f.source.id);
  await sources.close();
  await unlink(f.dailySourcesPath);
  sources = create();
  const second = await sources.list({ date: '2026-10-07' });
  assert.deepEqual(second.events, first.events);
  assert.equal(second.sources[0].id, f.source.id);
  const event = await sources.saveEvent({ ...f.event, title: 'Edited canonical event' });
  assert.equal((await f.records.read('calendar-local-events')).data[0].title, event.title);
  await assert.rejects(
    sources.saveEvent({ title: 'Bad date', allDay: true, start: '2026-02-30' }),
    /date/
  );
  assert.equal(network, 0);
  await sources.close();
});

test('Selected records enter RAG with real source lines, while settings and unknown keys are excluded', async (t) => {
  const f = await fixture(t);
  await f.records.write('main-decisions', ['Slow down in the garden'], { revision: 0 });
  await f.records.write('focus-unknown', 'DO NOT RETRIEVE', { revision: 0 });
  await f.records.write('settings-workspace', defaultProfile(), { revision: 0 });
  const agent = createAgent({ root: f.root, env: {}, databasePath: ':memory:' });
  const request = {
    projectIds: [],
    recordPaths: ['Records/Main/decisions.md'],
    includeTasks: false,
    includeReview: false,
    instruction: '',
    query: 'garden',
  };
  const context = await agent.context(request);
  assert.match(context.text, /Slow down in the garden/);
  assert.ok(!context.text.includes('DO NOT RETRIEVE'));
  assert.ok(
    context.retrieval.sources.some(
      (hit) => hit.path === 'Records/Main/decisions.md' && hit.startLine > 0
    )
  );
  await assert.rejects(agent.context({ ...request, recordPaths: ['Settings/workspace.md'] }));
  await assert.rejects(
    readRagRecord(f.root, recordDefinition('focus-unknown').path),
    /not eligible/
  );
  await atomicWrite(
    join(f.root, 'Records/Main/decisions.md'),
    encodeRecord('main-decisions', ['Changed'])
  );
  await assert.rejects(
    agent.chat({
      provider: 'local',
      model: 'mock',
      contextId: context.contextId,
      consent: true,
      messages: [{ role: 'user', content: 'Help' }],
    }),
    /changed|not configured/
  );
});

test('Read-only mode rejects all canonical mutations without writing records', async (t) => {
  const f = await fixture(t);
  const app = createApp({
    vaultRoot: f.root,
    profilePath: f.profilePath,
    mode: 'vault',
    writable: false,
  });
  for (const [path, method, data] of [
    ['/api/profile', 'POST', { profile: { locale: 'en' } }],
    ['/api/state/library-resources', 'PUT', { data: {}, revision: 0 }],
    ['/api/work/log', 'POST', { date: '2026-10-07', text: 'No write' }],
    ['/api/work/session', 'POST', { action: 'start' }],
    ['/api/calendar/events', 'POST', {}],
    ['/api/today/sources', 'POST', {}],
  ]) {
    const response = await app.request(`http://localhost${path}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    assert.equal(response.status, 403);
  }
  await assert.rejects(readFile(join(f.root, 'Settings/workspace.md')), /ENOENT/);
});

test('Workspace leases reject a second live launcher and migration requires an offline barrier', async (t) => {
  const f = await fixture(t);
  const release = await acquireRuntimeLease(f.privateRoot, f.scopeId);
  await assert.rejects(acquireRuntimeLease(f.privateRoot, f.scopeId), /Another process/);
  await release();
  const next = await acquireRuntimeLease(f.privateRoot, f.scopeId);
  await next();
  await assert.rejects(migrateStorage({ ...f.options, offline: false }), /offline write barrier/);
});

test('Explicitly saved agent conversations are Markdown with roles and excluded from RAG', async (t) => {
  const { records, root } = await fixture(t);
  const key = `main-agent-session-${randomUUID()}`;
  const data = {
    messages: [
      { role: 'user', content: 'A thought\n## Data\n\n~~~yaml\nexample\n~~~' },
      { role: 'assistant', content: 'A suggestion' },
    ],
  };
  const saved = await records.write(key, data, { revision: 0 });
  const text = await readFile(join(root, saved.path), 'utf8');
  assert.deepEqual(decodeRecord(text, recordDefinition(key), key).data, data);
  assert.match(text, /### user/);
  assert.match(text, /### assistant/);
  await assert.rejects(readRagRecord(root, saved.path), /not eligible/);
});

test('Frontend navigation does not discard pending writes; conflicts retain a visible draft', async () => {
  const phases = [];
  const requests = [];
  const client = createStoredStateClient({
    delay: 1,
    report: (...args) => phases.push(args),
    fetchImpl: async (_url, input) => {
      if (!input) return Response.json({ data: null, revision: 0, hash: null });
      requests.push(JSON.parse(input.body));
      return Response.json({ revision: 1, hash: 'saved' });
    },
  });
  const unmount = client.observe('main-decisions', [], () => {});
  await new Promise((resolve) => setTimeout(resolve, 5));
  client.set('main-decisions', ['Slow down']);
  unmount();
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(requests[0].data, ['Slow down']);
  assert.equal(phases.at(-1)[1], 'saved');
  let draft;
  const conflict = createStoredStateClient({
    delay: 1,
    report: (...args) => phases.push(args),
    fetchImpl: async (_url, input) =>
      input
        ? Response.json({ error: 'Record changed' }, { status: 409 })
        : Response.json({ data: null, revision: 0, hash: null }),
  });
  const leave = conflict.observe('main-decisions', [], () => {});
  await new Promise((resolve) => setTimeout(resolve, 5));
  conflict.set('main-decisions', ['Keep my draft']);
  leave();
  await new Promise((resolve) => setTimeout(resolve, 10));
  conflict.observe('main-decisions', [], (snapshot) => {
    draft = snapshot.value;
  });
  assert.deepEqual(draft, ['Keep my draft']);
  assert.equal(phases.at(-1)[1], 'error');
});
