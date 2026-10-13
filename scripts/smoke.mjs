import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serve } from '@hono/node-server';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';

const temporary = await mkdtemp(join(tmpdir(), 'personal-os-smoke-'));
const root = join(temporary, 'vault');
await mkdir(join(root, 'Projects'), { recursive: true });
for (const file of ['Tasks.md', 'Weekly-review.md']) {
  await atomicWrite(
    join(root, file),
    await readFile(new URL(`../demo/vault/${file}`, import.meta.url), 'utf8')
  );
}
for (const file of await readdir(new URL('../demo/vault/Projects/', import.meta.url))) {
  await atomicWrite(
    join(root, 'Projects', file),
    await readFile(new URL(`../demo/vault/Projects/${file}`, import.meta.url), 'utf8')
  );
}
const app = createApp({
  vaultRoot: root,
  profilePath: join(temporary, 'profile.json'),
  mode: 'demo',
  writable: true,
});
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
await new Promise((resolve) => (server.listening ? resolve() : server.once('listening', resolve)));
const base = `http://127.0.0.1:${server.address().port}`;
async function call(path, body) {
  const response = await fetch(
    base + path,
    body
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: base },
          body: JSON.stringify(body),
        }
      : undefined
  );
  assert.equal(response.ok, true, `${path}: ${response.status}`);
  return response.json();
}
try {
  assert.match(await (await fetch(base)).text(), /Personal OS/i);
  assert.equal((await fetch(`${base}/bundle.js`)).status, 200);
  assert.equal((await fetch(`${base}/app.css`)).status, 200);
  assert.equal((await fetch(`${base}/agent.css`)).status, 200);
  assert.equal((await fetch(`${base}/demo.css`)).status, 200);
  const titleCard = await fetch(`${base}/library-dictionary-logic.svg`);
  assert.equal(titleCard.status, 200);
  assert.match(titleCard.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await titleCard.text(), /Independent title card/);
  assert.equal((await call('/api/status')).mode, 'demo');
  const before = await call('/api/workspace');
  assert.equal(before.projects.length, 5);
  assert.ok(before.projects.some((project) => project.area === 'career'));
  assert.ok(before.graph.edges.length > 0);
  assert.ok(before.tasks.length >= 4);
  const preview = await call('/api/actions/preview', {
    type: 'capture',
    text: 'A synthetic smoke task',
    status: 'next',
    projectId: 'field-guide',
  });
  const applied = await call('/api/actions/apply', { previewId: preview.previewId });
  assert.ok(
    (await call('/api/workspace')).tasks.some((task) => task.text.includes('synthetic smoke'))
  );
  await call('/api/actions/undo', { actionId: applied.actionId });
  assert.equal((await call('/api/workspace')).tasks.length, before.tasks.length);
  const profile = await call('/api/profile', {
    profile: { firstOutcome: 'Test the demo', onboardingComplete: true },
  });
  assert.equal(profile.firstOutcome, 'Test the demo');
  assert.equal(profile.agent.enabled, false);
  const create = await call('/api/actions/preview', {
    type: 'project-create',
    id: 'smoke-project',
    title: 'Smoke project',
    area: 'future',
    body: '[[Projects/career-roadmap]]',
  });
  const createAction = await call('/api/actions/apply', { previewId: create.previewId });
  assert.ok(
    (await call('/api/workspace')).projects.some((project) => project.id === 'smoke-project')
  );
  await call('/api/actions/undo', { actionId: createAction.actionId });
  assert.equal((await call('/api/workspace')).projects.length, before.projects.length);
  const providers = await call('/api/agent/providers');
  assert.deepEqual(
    providers.providers.map((item) => item.id),
    ['local']
  );
  const context = await call('/api/agent/context', {
    projectIds: ['career-roadmap'],
    includeTasks: false,
    includeReview: false,
    instruction: 'Review this synthetic roadmap',
  });
  assert.match(context.text, /career-roadmap/);
  const denied = await fetch(`${base}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: base },
    body: JSON.stringify({
      provider: 'local',
      model: 'mock',
      messages: [{ role: 'user', content: 'Help' }],
      contextId: context.contextId,
      consent: true,
    }),
  });
  assert.equal(denied.status, 403);
  const rejected = await fetch(`${base}/api/actions/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://example.invalid' },
    body: JSON.stringify({ type: 'capture', text: 'Forbidden', status: 'next' }),
  });
  assert.equal(rejected.status, 403);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  console.log(
    'HTTP smoke passed: demo, static assets, tasks/projects/apply/undo, graph, context, disabled agent and origin denial.'
  );
} finally {
  await new Promise((resolve) => server.close(resolve));
  await rm(temporary, { recursive: true, force: true });
}
