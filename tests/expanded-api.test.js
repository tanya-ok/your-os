import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { recordDefinition } from '../lib/record-paths.js';
import { createRecordStore } from '../lib/record-store.js';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'personal-os-expanded-api-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = join(root, 'vault');
  await mkdir(join(vault, 'Projects'), { recursive: true });
  await atomicWrite(
    join(vault, 'Projects/garden.md'),
    '---\ntitle: Garden\narea: career\nstatus: active\n---\n# Garden\nCompost and soil are a useful beginning.'
  );
  await atomicWrite(
    join(vault, 'Projects/hidden.md'),
    '# NOT APPROVED\nCompost and private-unselected-example.'
  );
  await atomicWrite(
    join(vault, 'Tasks.md'),
    '# Tasks\n\n## Next\n- [ ] Observe the light [[Projects/garden]]\n'
  );
  let networkCalls = 0;
  const options = {
    vaultRoot: vault,
    profilePath: join(root, 'profile.json'),
    retrievalPath: join(root, 'retrieval.sqlite'),
    workLogPath: join(root, 'work.sqlite'),
    dailySourcesPath: join(root, 'sources.sqlite'),
    mode: 'demo',
    agentEnv: {},
    agentFetch: async () => {
      networkCalls++;
      throw new Error('Unexpected provider call');
    },
    feedFetch: async () => {
      networkCalls++;
      throw new Error('Unexpected feed call');
    },
  };
  let app = createApp(options);
  async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const response = await app.request(`http://localhost:3104${path}`, {
      method,
      headers: {
        origin: 'http://localhost:3104',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, json: await response.json() };
  }
  return {
    root,
    vault,
    options,
    request,
    reopen: () => {
      app = createApp(options);
    },
    networkCalls: () => networkCalls,
  };
}

const json = (body, method = 'POST') => ({ method, body });

test('HTTP Work entries persist by day and survive reopening the application', async (t) => {
  const { request, reopen } = await fixture(t);
  const first = await request(
    '/api/work/log',
    json({ date: '2026-12-31', text: 'Closed a useful loop.' })
  );
  const second = await request(
    '/api/work/log',
    json({ date: '2027-01-01', text: 'A fresh beginning.' })
  );
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  reopen();
  const lastDay = await request('/api/work/log?date=2026-12-31&timezone=UTC');
  const nextDay = await request('/api/work/log?date=2027-01-01&timezone=UTC');
  assert.deepEqual(
    lastDay.json.entries.map((entry) => entry.text),
    ['Closed a useful loop.']
  );
  assert.deepEqual(
    nextDay.json.entries.map((entry) => entry.text),
    ['A fresh beginning.']
  );
  assert.equal((await request('/api/work/log?date=2026-02-30')).status, 400);
  assert.equal(
    (await request('/api/work/log', json({ date: '2026-12-31', text: '' }))).status,
    400
  );
  assert.equal((await request(`/api/work/log/${first.json.id}`, { method: 'DELETE' })).status, 200);
  assert.deepEqual((await request('/api/work/log?date=2026-12-31')).json.entries, []);
});

test('HTTP Work Start/End are idempotent, persisted and include a session across midnight', async (t) => {
  const { request, reopen, options } = await fixture(t);
  assert.equal((await request('/api/work/session', json({ action: 'end' }))).status, 200);
  await request('/api/work/session', json({ action: 'start' }));
  const started = (await request('/api/work/log')).json.active;
  assert.ok(started?.id);
  await request('/api/work/session', json({ action: 'start' }));
  assert.equal((await request('/api/work/log')).json.active.id, started.id);
  reopen();
  assert.equal((await request('/api/work/log')).json.active.id, started.id);
  await request('/api/work/session', json({ action: 'end' }));
  await request('/api/work/session', json({ action: 'end' }));
  assert.equal((await request('/api/work/log')).json.active, null);
  const stored = createRecordStore({ root: options.vaultRoot, databasePath: options.workLogPath });
  assert.equal((await stored.read('work-sessions')).data.length, 1);
  const id = randomUUID();
  await stored.mutate('work-sessions', (rows) => [
    ...rows,
    {
      id,
      startedAt: Date.parse('2026-12-31T23:55:00Z'),
      endedAt: Date.parse('2027-01-01T00:05:00Z'),
    },
  ]);
  await stored.close();
  for (const date of ['2026-12-31', '2027-01-01'])
    assert.ok(
      (await request(`/api/work/log?date=${date}&timezone=UTC`)).json.sessions.some(
        (session) => session.id === id
      )
    );
  assert.equal(
    (await request('/api/work/log?date=2027-01-02&timezone=UTC')).json.sessions.some(
      (session) => session.id === id
    ),
    false
  );
});

test('HTTP state uses revisions and preserves accepted data after stale or oversized writes', async (t) => {
  const { request, reopen } = await fixture(t);
  const endpoint = '/api/state/home-week3';
  const path = recordDefinition('home-week3').path;
  assert.deepEqual((await request(endpoint)).json, { data: null, revision: 0, hash: null, path });
  const saved = (
    await request(endpoint, json({ data: { theme: 'Keep room' }, revision: 0 }, 'PUT'))
  ).json;
  assert.equal(saved.revision, 1);
  assert.match(saved.hash, /^[a-f0-9]{64}$/);
  assert.equal(saved.path, path);
  const stale = await request(
    '/api/state/home-week3',
    json({ data: { theme: 'stale' }, revision: 0 }, 'PUT')
  );
  assert.equal(stale.status, 409);
  assert.equal(
    (await request('/api/state/home-week3', json({ data: 'я'.repeat(40000), revision: 1 }, 'PUT')))
      .status,
    413
  );
  assert.equal((await request('/api/state/unknown-secret')).status, 400);
  reopen();
  assert.deepEqual((await request('/api/state/home-week3')).json, {
    data: { theme: 'Keep room' },
    ...saved,
  });
});

test('HTTP Calendar adds, updates and removes canonical local events durably without fetching feeds', async (t) => {
  const { request, reopen, networkCalls } = await fixture(t);
  const added = await request(
    '/api/calendar/events',
    json({ title: 'A field walk', start: '2026-10-07T10:00Z', end: '2026-10-07T11:00Z' })
  );
  assert.equal(added.status, 200);
  const event = added.json;
  assert.equal(event.editable, true);
  const updated = await request(
    '/api/calendar/events',
    json({ ...event, title: 'An updated field walk' })
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.json.id, event.id);
  reopen();
  const after = await request('/api/today/sources?date=2026-10-07&days=7&timezone=UTC');
  assert.equal(
    after.json.events.find((entry) => entry.id === event.id).title,
    'An updated field walk'
  );
  assert.ok(
    (
      await request(
        '/api/calendar/events',
        json({ title: 'Invalid range', start: '2026-10-07T12:00:00Z', end: '2026-10-07T11:00:00Z' })
      )
    ).status >= 400
  );
  assert.equal(
    (await request(`/api/calendar/events/${event.id}`, { method: 'DELETE' })).status,
    200
  );
  reopen();
  assert.equal(
    (await request('/api/today/sources?date=2026-10-07&days=7&timezone=UTC')).json.events.some(
      (entry) => entry.id === event.id
    ),
    false
  );
  assert.equal(networkCalls(), 0);
});

test('HTTP source registration, listing and deletion never initiate external requests', async (t) => {
  const { request, reopen, networkCalls } = await fixture(t);
  const added = await request(
    '/api/today/sources',
    json({ kind: 'rss', title: 'A public reading feed', url: 'https://example.org/feed.xml' })
  );
  assert.equal(added.status, 200);
  reopen();
  const listed = await request('/api/today/sources?date=2026-10-07');
  assert.equal(
    listed.json.sources.find((source) => source.id === added.json.id).title,
    'A public reading feed'
  );
  assert.equal(networkCalls(), 0);
  assert.equal(
    (await request(`/api/today/sources/${added.json.id}`, { method: 'DELETE' })).status,
    200
  );
  assert.equal(
    (await request('/api/today/sources?date=2026-10-07')).json.sources.some(
      (source) => source.id === added.json.id
    ),
    false
  );
  assert.equal(networkCalls(), 0);
});

test('HTTP retrieval respects selected context and remains local with agent requests disabled', async (t) => {
  const { request, networkCalls, vault } = await fixture(t);
  const original = await readFile(join(vault, 'Projects/garden.md'), 'utf8');
  const context = await request(
    '/api/agent/context',
    json({
      projectIds: ['garden'],
      includeTasks: false,
      includeReview: false,
      instruction: '',
      query: 'compost',
    })
  );
  assert.equal(context.status, 200);
  assert.equal(context.json.retrieval.method, 'sqlite-fts5-bm25');
  const parsed = JSON.parse(context.json.text);
  assert.deepEqual(
    parsed.notes.map((note) => note.path),
    ['Projects/garden.md']
  );
  assert.ok(
    parsed.notes.every((note) => Number.isInteger(note.startLine) && note.endLine >= note.startLine)
  );
  assert.equal(context.json.text.includes('private-unselected-example'), false);
  assert.equal(
    (
      await request(
        '/api/agent/chat',
        json({
          provider: 'local',
          model: 'example',
          contextId: context.json.contextId,
          consent: true,
          messages: [{ role: 'user', content: 'Help' }],
        })
      )
    ).status,
    403
  );
  assert.equal(networkCalls(), 0);
  assert.equal(await readFile(join(vault, 'Projects/garden.md'), 'utf8'), original);
});

test('expanded mutation routes reject a foreign Origin before changing local data', async (t) => {
  const { request, networkCalls } = await fixture(t);
  for (const [path, method, body] of [
    ['/api/work/log', 'POST', { date: '2026-10-07', text: 'Must not save' }],
    ['/api/work/session', 'POST', { action: 'start' }],
    ['/api/state/home-week3', 'PUT', { revision: 0, data: 'Must not save' }],
    [
      '/api/calendar/events',
      'POST',
      { title: 'Must not save', start: '2026-10-07T10:00Z', end: '2026-10-07T11:00Z' },
    ],
    [
      '/api/today/sources',
      'POST',
      { kind: 'rss', title: 'Must not add', url: 'https://example.org/feed' },
    ],
  ])
    assert.equal(
      (await request(path, { method, body, headers: { origin: 'https://untrusted.example' } }))
        .status,
      403
    );
  assert.equal((await request('/api/work/log?date=2026-10-07')).json.entries.length, 0);
  assert.equal((await request('/api/work/log')).json.active, null);
  assert.deepEqual((await request('/api/state/home-week3')).json, {
    revision: 0,
    data: null,
    hash: null,
    path: recordDefinition('home-week3').path,
  });
  assert.equal(
    (await request('/api/work/log', { headers: { host: 'untrusted.example' } })).status,
    403
  );
  assert.equal(networkCalls(), 0);
});
