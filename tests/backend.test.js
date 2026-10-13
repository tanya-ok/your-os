import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createActions } from '../lib/actions.js';
import { createRecordStore } from '../lib/record-store.js';
import { safeRoot } from '../lib/safe-path.js';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';

async function fixture(t, writable = true) {
  const root = await mkdtemp(join(tmpdir(), 'personal-os-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = join(root, 'vault');
  await mkdir(join(vault, 'Projects'), { recursive: true });
  await atomicWrite(
    join(vault, 'Tasks.md'),
    '# Tasks\n\n## Next\n- [ ] Read a chapter [[Projects/reading]]\n\n## Waiting\n- [ ] Reply\n\n## Someday\n'
  );
  await atomicWrite(
    join(vault, 'Projects/reading.md'),
    '---\ntitle: Reading corner\nstatus: active\n---\n'
  );
  const app = createApp({
    vaultRoot: vault,
    profilePath: join(root, 'profile.json'),
    mode: writable ? 'demo' : 'vault',
    writable,
  });
  async function request(path, body, extra = {}) {
    const response = await app.request(
      `http://localhost:3104${path}`,
      body === undefined
        ? extra
        : {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              origin: 'http://localhost:3104',
              ...extra.headers,
            },
            body: JSON.stringify(body),
            ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'headers')),
          }
    );
    return { response, json: await response.json() };
  }
  return { app, root, vault, request };
}

test('workspace returns only scoped relative projects/tasks and defaults', async (t) => {
  const { request } = await fixture(t);
  const { json } = await request('/api/workspace');
  assert.deepEqual(json.projects, [
    {
      id: 'reading',
      path: 'Projects/reading.md',
      title: 'Reading corner',
      status: 'active',
      area: 'work',
      body: '',
    },
  ]);
  assert.equal(json.tasks[0].projectId, 'reading');
  assert.equal(json.tasks[0].lineNum, 3);
  assert.deepEqual(json.review, { path: 'Weekly-review.md', text: '' });
  assert.equal(JSON.stringify(json).includes(tmpdir()), false);
  const profile = (await request('/api/profile')).json;
  assert.equal(profile.agent.enabled, false);
  assert.equal(profile.lighting.timezone, 'UTC');
});

test('capture preview is read-only; apply is one use; undo restores exact body', async (t) => {
  const { vault, request } = await fixture(t);
  const original = await readFile(join(vault, 'Tasks.md'), 'utf8');
  const { json: preview } = await request('/api/actions/preview', {
    type: 'capture',
    text: 'Take a walk',
    status: 'waiting',
    projectId: 'reading',
  });
  assert.equal(await readFile(join(vault, 'Tasks.md'), 'utf8'), original);
  assert.match(
    preview.after,
    /## Waiting\n- \[ \] Reply\n- \[ \] Take a walk \[\[Projects\/reading\]\]/
  );
  const { json: action } = await request('/api/actions/apply', { previewId: preview.previewId });
  assert.equal(await readFile(join(vault, 'Tasks.md'), 'utf8'), preview.after);
  assert.equal(
    (await request('/api/actions/apply', { previewId: preview.previewId })).response.status,
    409
  );
  assert.equal((await request('/api/workspace')).json.recentActions[0].id, action.actionId);
  assert.deepEqual((await request('/api/actions/undo', { actionId: action.actionId })).json, {
    ok: true,
  });
  assert.equal(await readFile(join(vault, 'Tasks.md'), 'utf8'), original);
  assert.equal(
    (await request('/api/actions/undo', { actionId: action.actionId })).response.status,
    409
  );
});

test('toggle preserves neighboring lines and rejects stale task identifiers', async (t) => {
  const { vault, request } = await fixture(t);
  const original = await readFile(join(vault, 'Tasks.md'), 'utf8');
  const task = (await request('/api/workspace')).json.tasks[0];
  const { json: preview } = await request('/api/actions/preview', {
    type: 'toggle',
    taskId: task.id,
  });
  assert.equal(preview.after, original.replace('- [ ] Read', '- [x] Read'));
  await request('/api/actions/apply', { previewId: preview.previewId });
  assert.equal(
    (await request('/api/actions/preview', { type: 'toggle', taskId: task.id })).response.status,
    409
  );
});

test('stale apply and undo preserve external changes; concurrent apply has one winner', async (t) => {
  const { vault, request } = await fixture(t);
  const { json: preview } = await request('/api/actions/preview', {
    type: 'review',
    text: 'Review A',
  });
  await atomicWrite(join(vault, 'Weekly-review.md'), 'External');
  assert.equal(
    (await request('/api/actions/apply', { previewId: preview.previewId })).response.status,
    409
  );
  assert.equal(await readFile(join(vault, 'Weekly-review.md'), 'utf8'), 'External');
  const { json: fresh } = await request('/api/actions/preview', {
    type: 'review',
    text: 'Review B',
  });
  const results = await Promise.all([
    request('/api/actions/apply', { previewId: fresh.previewId }),
    request('/api/actions/apply', { previewId: fresh.previewId }),
  ]);
  assert.deepEqual(results.map((result) => result.response.status).sort(), [200, 409]);
  const action = results.find((result) => result.response.status === 200).json;
  await atomicWrite(join(vault, 'Weekly-review.md'), 'New external');
  assert.equal(
    (await request('/api/actions/undo', { actionId: action.actionId })).response.status,
    409
  );
  assert.equal(await readFile(join(vault, 'Weekly-review.md'), 'utf8'), 'New external');
});

test('expired and evicted previews cannot apply', async (t) => {
  const { vault } = await fixture(t);
  let now = 0;
  const actions = createActions({ root: await safeRoot(vault), writable: true, now: () => now });
  const expired = await actions.preview({ type: 'review', text: 'old' });
  now = 600000;
  await assert.rejects(actions.apply({ previewId: expired.previewId }), /expired/);
  const evicted = await actions.preview({ type: 'review', text: 'evicted' });
  for (let i = 0; i < 50; i++) await actions.preview({ type: 'review', text: String(i) });
  await assert.rejects(actions.apply({ previewId: evicted.previewId }), /expired/);
});

test('profile merges nested preferences strictly and cannot grant writes or persist secrets', async (t) => {
  const { root, vault, request } = await fixture(t);
  const { json: saved } = await request('/api/profile', {
    profile: {
      locale: 'ru',
      lighting: { manualPhase: 'night' },
      accessibility: { reduceMotion: true },
      onboardingComplete: true,
    },
  });
  assert.equal(saved.locale, 'ru');
  assert.equal(saved.lighting.manualPhase, 'night');
  assert.equal(saved.lighting.schedule.wake, '07:00');
  for (const patch of [
    { writable: true },
    { agent: { persistTranscript: true } },
    { lighting: { coordinates: { latitude: 91, longitude: 0 } } },
    { reviewTime: '25:00' },
    { firstOutcome: 'mail me@example.com' },
    { firstOutcome: 'secret=abcd' },
    { lighting: { timezone: 'Invalid/Zone' } },
    { accessibility: { mystery: false } },
    { lighting: { schedule: { wake: '23:00' } } },
  ]) {
    assert.equal((await request('/api/profile', { profile: patch })).response.status, 400);
  }
  const records = createRecordStore({ root: vault });
  assert.deepEqual((await records.read('settings-workspace')).data, saved);
  await records.close();
  const readOnly = await fixture(t, false);
  assert.equal(
    (await readOnly.request('/api/profile', { profile: { locale: 'en' } })).response.status,
    403
  );
  assert.equal(
    (await readOnly.request('/api/actions/preview', { type: 'review', text: 'denied' })).response
      .status,
    403
  );
});

test('foreign hosts/origins and cross-site metadata are denied; JSON and byte limits enforced', async (t) => {
  const { app, request } = await fixture(t);
  for (const headers of [
    { origin: 'https://evil.example' },
    { origin: 'http://localhost:9999' },
    { origin: 'null' },
    { host: 'evil.example' },
    { 'sec-fetch-site': 'cross-site' },
  ]) {
    assert.equal(
      (await request('/api/profile', { profile: {} }, { headers })).response.status,
      403
    );
  }
  assert.equal((await app.request('http://evil.example/api/status')).status, 403);
  assert.equal(
    (await request('/api/profile', { profile: {} }, { headers: { 'content-type': 'text/plain' } }))
      .response.status,
    415
  );
  assert.equal(
    (await request('/api/actions/preview', { type: 'review', text: 'x'.repeat(70000) })).response
      .status,
    413
  );
  assert.equal(
    (await request('/api/actions/preview', { type: 'review', text: 'x'.repeat(12001) })).response
      .status,
    400
  );
  assert.equal(
    (
      await request('/api/actions/preview', {
        type: 'capture',
        status: 'next',
        text: 'x'.repeat(501),
      })
    ).response.status,
    400
  );
  assert.equal(
    (
      await request('/api/actions/preview', {
        type: 'capture',
        status: 'next',
        text: 'One\n- [ ] injected',
      })
    ).response.status,
    400
  );
  assert.equal(
    (
      await app.request('http://localhost:3104/api/profile', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{broken',
      })
    ).status,
    400
  );
});

test('traversal, symlink root/files/directories, and hard links never expose external content', async (t) => {
  const { app, root, vault, request } = await fixture(t);
  await atomicWrite(join(root, 'outside.md'), 'Private outside');
  const { json: preview } = await request('/api/actions/preview', {
    type: 'review',
    text: 'replacement',
  });
  await symlink(join(root, 'outside.md'), join(vault, 'Weekly-review.md'));
  assert.equal(
    (await request('/api/actions/apply', { previewId: preview.previewId })).response.status,
    409
  );
  assert.equal(await readFile(join(root, 'outside.md'), 'utf8'), 'Private outside');
  assert.equal((await request('/api/workspace')).response.status, 409);
  await symlink(vault, join(root, 'linked-vault'));
  const unsafeApp = createApp({
    vaultRoot: join(root, 'linked-vault'),
    profilePath: join(root, 'other.json'),
  });
  assert.equal((await unsafeApp.request('http://localhost/api/status')).status, 503);
  assert.equal(
    (
      await request('/api/actions/preview', {
        type: 'capture',
        status: 'next',
        text: 'x',
        projectId: '../outside',
      })
    ).response.status,
    400
  );
  assert.equal((await app.request('http://localhost:3104/.env')).status, 404);
  assert.equal((await app.request('http://localhost:3104/lib/config.js')).status, 404);
  await rm(join(vault, 'Weekly-review.md'));
  await link(join(root, 'outside.md'), join(vault, 'Weekly-review.md'));
  assert.equal(
    (await request('/api/actions/preview', { type: 'review', text: 'x' })).response.status,
    409
  );
  await rm(join(vault, 'Projects'), { recursive: true });
  await symlink(root, join(vault, 'Projects'));
  assert.equal((await request('/api/workspace')).response.status, 409);
});

test('failed profile write cannot follow a symlink; successful atomic writes leave no temporary files', async (t) => {
  const { root, vault, request } = await fixture(t);
  await atomicWrite(join(root, 'outside.json'), 'Private');
  await mkdir(join(vault, 'Settings'));
  await symlink(join(root, 'outside.json'), join(vault, 'Settings/workspace.md'));
  assert.equal((await request('/api/profile', { profile: { locale: 'ru' } })).response.status, 409);
  assert.equal(await readFile(join(root, 'outside.json'), 'utf8'), 'Private');
  assert.equal(
    (await readdir(root)).some((name) => name.startsWith('.tmp-')),
    false
  );
});

test('weekly review exposes body only and saves preserve original frontmatter byte-for-byte', async (t) => {
  const { vault, request } = await fixture(t);
  const metadata = '---\r\ntitle: Weekly review\r\ncustom: "keep exact formatting"\r\n---\r\n';
  const original = `${metadata}Old review\r\n`;
  await atomicWrite(join(vault, 'Weekly-review.md'), original);
  assert.equal((await request('/api/workspace')).json.review.text, 'Old review\r\n');
  const { json: preview } = await request('/api/actions/preview', {
    type: 'review',
    text: 'New review\n',
  });
  assert.equal(preview.before, original);
  assert.equal(preview.after, `${metadata}New review\n`);
  const { json: applied } = await request('/api/actions/apply', { previewId: preview.previewId });
  assert.equal(await readFile(join(vault, 'Weekly-review.md'), 'utf8'), `${metadata}New review\n`);
  await request('/api/actions/undo', { actionId: applied.actionId });
  assert.equal(await readFile(join(vault, 'Weekly-review.md'), 'utf8'), original);
});

test('CRLF task capture and toggle preserve original line endings', async (t) => {
  const { vault, request } = await fixture(t);
  const original = '## Next\r\n- [ ] First\r\n\r\n## Waiting\r\n\r\n## Someday\r\n';
  await atomicWrite(join(vault, 'Tasks.md'), original);
  const task = (await request('/api/workspace')).json.tasks[0];
  const { json: toggle } = await request('/api/actions/preview', {
    type: 'toggle',
    taskId: task.id,
  });
  assert.equal(toggle.after, original.replace('[ ]', '[x]'));
  const { json: capture } = await request('/api/actions/preview', {
    type: 'capture',
    text: 'Second',
    status: 'next',
  });
  assert.equal(capture.after, original.replace('First\r\n', 'First\r\n- [ ] Second\r\n'));
});

test('corrupted or invalid stored profiles fall back to defaults without exposing storage content', async (t) => {
  const { root, request } = await fixture(t);
  for (const content of [
    '{broken',
    '{"version":1,"private":"hidden"}',
    '{"version":1,"agent":{"enabled":true}}',
  ]) {
    await atomicWrite(join(root, 'profile.json'), content);
    const { json: profile } = await request('/api/profile');
    assert.equal(profile.version, 1);
    assert.equal(profile.agent.enabled, false);
    assert.equal(profile.firstOutcome, '');
    assert.equal(JSON.stringify(profile).includes('hidden'), false);
  }
});

test('outcome accepts multiline English/Russian text but rejects unsafe control characters', async (t) => {
  const { request } = await fixture(t);
  for (const firstOutcome of [
    'Finish one project\nMake room for rest',
    'Закончить один проект\r\n\tОставить время для отдыха',
  ]) {
    const { response, json } = await request('/api/profile', { profile: { firstOutcome } });
    assert.equal(response.status, 200);
    assert.equal(json.firstOutcome, firstOutcome);
    assert.equal((await request('/api/profile')).json.firstOutcome, firstOutcome);
  }
  for (const firstOutcome of ['One\u0000goal', 'One\u0007goal', 'One\u007fgoal']) {
    assert.equal(
      (await request('/api/profile', { profile: { firstOutcome } })).response.status,
      400
    );
  }
});
