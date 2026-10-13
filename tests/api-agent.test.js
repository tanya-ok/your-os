import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { defaultProfile } from '../lib/profile.js';
import { createRecordStore } from '../lib/record-store.js';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';

test('HTTP API requires enabled preference and per-call consent, with no vault-write grant', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'personal-os-agent-api-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'vault'));
  await mkdir(join(root, 'vault', 'Projects'));
  await atomicWrite(
    join(root, 'vault', 'Projects', 'career.md'),
    '---\ntitle: Career\narea: career\nstatus: active\n---\nSynthetic roadmap'
  );
  let calls = 0;
  const records = createRecordStore({ root: join(root, 'vault') });
  const enablePreference = async (enabled) => {
    await records.mutate('settings-workspace', (old) => ({
      ...(old || defaultProfile()),
      agent: { enabled, persistTranscript: false },
    }));
  };
  const app = createApp({
    vaultRoot: join(root, 'vault'),
    profilePath: join(root, 'profile.json'),
    mode: 'vault',
    writable: false,
    agentEnv: {},
    agentFetch: async () => {
      calls++;
      return Response.json({ choices: [{ message: { content: 'A suggestion' } }] });
    },
  });
  async function post(path, body) {
    const response = await app.request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost' },
      body: JSON.stringify(body),
    });
    return { status: response.status, data: await response.json() };
  }
  const context = await post('/api/agent/context', {
    projectIds: ['career'],
    includeTasks: false,
    includeReview: false,
    instruction: 'Plan',
  });
  assert.equal(context.status, 200);
  const request = {
    provider: 'local',
    model: 'mock-local',
    messages: [{ role: 'user', content: 'Help' }],
    contextId: context.data.contextId,
    consent: true,
  };
  assert.equal((await post('/api/agent/chat', request)).status, 403);
  assert.equal(calls, 0);
  assert.equal((await post('/api/profile', { profile: { agent: { enabled: true } } })).status, 403);
  await enablePreference(true);
  assert.equal((await post('/api/agent/chat', { ...request, consent: false })).status, 400);
  assert.equal(calls, 0);
  const reply = await post('/api/agent/chat', request);
  assert.equal(reply.status, 200);
  assert.equal(reply.data.message.content, 'A suggestion');
  assert.equal(calls, 1);
  assert.equal(
    (
      await post('/api/actions/preview', {
        type: 'project-create',
        id: 'denied',
        title: 'Denied',
        area: 'career',
      })
    ).status,
    403
  );
  assert.equal(
    (await post('/api/profile', { profile: { areas: [{ id: 'home', title: 'Home' }] } })).status,
    403
  );
  assert.equal(
    (await post('/api/profile', { profile: { agent: { persistTranscript: true } } })).status,
    403
  );
  await records.close();
  assert.equal(
    (await app.request('http://localhost/api/status').then((r) => r.json())).writable,
    false
  );
});
