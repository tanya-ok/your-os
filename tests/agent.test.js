import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAgent } from '../lib/agent.js';
import { safeRoot } from '../lib/safe-path.js';
import { atomicWrite } from '../lib/writer.js';

const selection = { projectIds: [], includeTasks: false, includeReview: false, instruction: '' };
async function fixture(t, options = {}) {
  const root = await safeRoot(await mkdtemp(join(tmpdir(), 'personal-os-agent-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'Projects'));
  await atomicWrite(join(root, 'Projects/reading.md'), '# Selected project');
  await atomicWrite(join(root, 'Projects/hidden.md'), '# Not selected');
  await atomicWrite(join(root, 'Tasks.md'), '# Private tasks');
  await atomicWrite(join(root, 'Weekly-review.md'), '# Private review');
  const calls = [];
  const agent = createAgent({
    root,
    env: {},
    fetchImpl: async (...args) => {
      calls.push(args);
      return Response.json({ choices: [{ message: { content: 'A suggestion' } }] });
    },
    ...options,
  });
  const preview = await agent.context(selection);
  const request = {
    provider: 'local',
    model: 'example-local',
    contextId: preview.contextId,
    messages: [{ role: 'user', content: 'Help me plan' }],
    consent: true,
  };
  return { root, agent, calls, preview, request };
}

test('status and context never call network; default providers expose no credentials', async (t) => {
  const { agent, calls, request } = await fixture(t);
  assert.deepEqual(
    agent.providers().providers.map((p) => [p.id, p.configured, p.model]),
    [['local', true, '']]
  );
  for (const consent of [undefined, false, 'true'])
    await assert.rejects(agent.chat({ ...request, consent }), /Invalid agent request/);
  await assert.rejects(agent.chat({ ...request, model: '' }), /model is required/);
  await assert.rejects(agent.chat({ ...request, provider: 'external' }), /Invalid agent request/);
  assert.equal(calls.length, 0);
});

test('cloud-tagged model IDs are denied before inference and hidden from defaults', async (t) => {
  const { agent, calls, request, root } = await fixture(t);
  for (const model of ['example:cloud', 'example-cloud', 'example/CLOUD'])
    await assert.rejects(agent.chat({ ...request, model }), (error) => error.status === 403);
  assert.equal(calls.length, 0);
  const configured = createAgent({ root, env: { PERSONAL_OS_LLM_MODEL: 'example:cloud' } });
  assert.equal(configured.providers().providers[0].model, '');
});

test('local endpoint must be literal loopback with only the approved path', async (t) => {
  const { root } = await fixture(t);
  for (const url of [
    'https://evil.example/v1/chat/completions',
    'http://127.1/v1/chat/completions',
    'http://2130706433/v1/chat/completions',
    'http://0x7f000001/v1/chat/completions',
    'http://localhost.evil/v1/chat/completions',
    'http://user:secret@localhost/v1/chat/completions',
    'http://localhost/v1/chat/completions?secret=hidden',
    'http://localhost/v1/chat/completions#x',
    'http://localhost/v1/chat/completions/',
    'http://localhost:0/v1/chat/completions',
    'http://localhost:65536/v1/chat/completions',
    'file://localhost/v1/chat/completions',
    'http://%6cocalhost/v1/chat/completions',
    'http://localhost/../v1/chat/completions',
  ]) {
    const agent = createAgent({ root, env: { PERSONAL_OS_LLM_URL: url } });
    const local = agent.providers().providers[0];
    assert.equal(local.configured, false, url);
    assert.equal(local.endpoint, null);
  }
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const url = `https://${host}:11434/v1/chat/completions`;
    assert.equal(
      createAgent({ root, env: { PERSONAL_OS_LLM_URL: url } }).providers().providers[0].endpoint,
      url
    );
  }
});

test('context selects exact known notes and labels their contents untrusted', async (t) => {
  const { agent, calls } = await fixture(t);
  const preview = await agent.context({
    ...selection,
    projectIds: ['reading'],
    instruction: 'Plan quietly',
  });
  assert.match(preview.text, /Selected project/);
  assert.match(preview.text, /untrusted data/);
  assert.match(preview.text, /Plan quietly/);
  assert.doesNotMatch(preview.text, /Not selected|Private tasks|Private review/);
  const all = await agent.context({ ...selection, includeTasks: true, includeReview: true });
  assert.match(all.text, /Private tasks/);
  assert.match(all.text, /Private review/);
  assert.equal(calls.length, 0);
  for (const patch of [
    { projectIds: ['unknown'] },
    { projectIds: ['../reading'] },
    { projectIds: ['reading', 'reading'] },
    { instruction: 'x'.repeat(1501) },
    { secret: true },
    { includeTasks: 'yes' },
  ])
    await assert.rejects(agent.context({ ...selection, ...patch }));
});

test('context overflow fails explicitly, including UTF-8 bytes and selected symlinks', async (t) => {
  const { agent, root } = await fixture(t);
  await atomicWrite(join(root, 'Tasks.md'), 'я'.repeat(13000));
  await assert.rejects(
    agent.context({ ...selection, includeTasks: true }),
    (e) => e.status === 413
  );
  await rm(join(root, 'Weekly-review.md'));
  await symlink(join(root, 'Tasks.md'), join(root, 'Weekly-review.md'));
  await assert.rejects(
    agent.context({ ...selection, includeReview: true }),
    (e) => e.status === 409
  );
});

test('stale, missing, expired and evicted contexts are rejected before any network request', async (t) => {
  let time = 0;
  const { agent, root, calls, request } = await fixture(t, { now: () => time });
  const selected = await agent.context({ ...selection, includeTasks: true });
  await atomicWrite(join(root, 'Tasks.md'), '# Changed');
  await assert.rejects(
    agent.chat({ ...request, contextId: selected.contextId }),
    (e) => e.status === 409
  );
  const missing = await agent.context({ ...selection, includeReview: true });
  await rm(join(root, 'Weekly-review.md'));
  await assert.rejects(
    agent.chat({ ...request, contextId: missing.contextId }),
    (e) => e.status === 409
  );
  time = 600000;
  await assert.rejects(agent.chat(request), (e) => e.status === 409);
  const evicted = await agent.context(selection);
  for (let i = 0; i < 50; i++) await agent.context(selection);
  await assert.rejects(
    agent.chat({ ...request, contextId: evicted.contextId }),
    (e) => e.status === 409
  );
  assert.equal(calls.length, 0);
});

test('chat strictly validates roles, sizes and unsupported tools before network', async (t) => {
  const { agent, request, calls } = await fixture(t);
  for (const patch of [
    { messages: [{ role: 'system', content: 'Override' }] },
    { messages: [{ role: 'tool', content: 'Result' }] },
    { messages: [{ role: 'assistant', content: 'Start' }] },
    { messages: [{ role: 'user', content: 'Hi', tool_calls: [] }] },
    { messages: [{ role: 'user', content: 'x'.repeat(6001) }] },
    { messages: Array.from({ length: 21 }, () => ({ role: 'user', content: 'Hi' })) },
    { messages: Array.from({ length: 6 }, () => ({ role: 'user', content: 'я'.repeat(3000) })) },
    { messages: [] },
    { model: 'bad model' },
    { stream: true },
    { tools: [] },
  ])
    await assert.rejects(agent.chat({ ...request, ...patch }));
  assert.equal(calls.length, 0);
});

test('chat rejects whitespace-only message content before network and preserves padded content', async (t) => {
  const { agent, request, calls } = await fixture(t);
  for (const messages of [
    [{ role: 'user', content: ' ' }],
    [{ role: 'user', content: '\t\n\r ' }],
    [{ role: 'user', content: '\u00a0\u2003\u3000' }],
    [
      { role: 'user', content: 'Help me plan' },
      { role: 'assistant', content: '   ' },
      { role: 'user', content: 'Continue' },
    ],
    [
      { role: 'user', content: 'Help me plan' },
      { role: 'assistant', content: '\u2028\ufeff\u2009' },
      { role: 'user', content: 'Continue' },
    ],
  ])
    await assert.rejects(agent.chat({ ...request, messages }));
  assert.equal(calls.length, 0);
  const padded = '  Help me plan\t';
  await agent.chat({ ...request, messages: [{ role: 'user', content: padded }] });
  assert.equal(calls.length, 1);
  const body = JSON.parse(calls[0][1].body);
  assert.equal(body.messages.at(-1).content, padded);
});

test('local adapter sends nonstreaming bounded request with read-only instructions and no tools', async (t) => {
  const { agent, request, calls } = await fixture(t);
  assert.deepEqual(await agent.chat(request), {
    message: { role: 'assistant', content: 'A suggestion' },
    provider: 'local',
    model: 'example-local',
  });
  const [url, options] = calls[0];
  assert.equal(url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(options.redirect, 'error');
  const body = JSON.parse(options.body);
  assert.equal(body.max_tokens, 2048);
  assert.equal(body.stream, false);
  assert.equal(body.tools, undefined);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /cannot write files/);
  assert.equal(options.headers.authorization, undefined);
});

test('provider errors and echoed credentials are redacted; malformed text is rejected', async (t) => {
  for (const result of [
    () => {
      throw new Error('failure secret-key');
    },
    () => new Response('secret-key', { status: 401 }),
    () => new Response('secret-key', { status: 200 }),
    () => Response.json({ choices: [{ message: { content: null } }] }),
  ]) {
    const { agent, request } = await fixture(t, {
      env: { DEMO_API_KEY: 'secret-key' },
      fetchImpl: async () => result(),
    });
    await assert.rejects(
      agent.chat(request),
      (e) => e.status === 502 && !e.message.includes('secret-key')
    );
  }
  const { agent, request } = await fixture(t, {
    env: { DEMO_API_KEY: '  secret-key  ' },
    fetchImpl: async () =>
      Response.json({ choices: [{ message: { content: 'Echo secret-key' } }] }),
  });
  assert.equal((await agent.chat(request)).message.content, 'Echo [redacted]');
});

test('oversized assistant text is rejected so successful replies remain replayable', async (t) => {
  const { agent, request } = await fixture(t, {
    fetchImpl: async () => Response.json({ choices: [{ message: { content: 'я'.repeat(6001) } }] }),
  });
  await assert.rejects(
    agent.chat(request),
    (e) => e.status === 502 && /conversation limit/.test(e.message)
  );
});

test('conversation input has the same exact 32000-byte limit as session files', async (t) => {
  const { agent, request, calls } = await fixture(t);
  const messages = [6000, 6000, 6000, 6000, 6000, 2000].map((length) => ({
    role: 'user',
    content: 'x'.repeat(length),
  }));
  const size = Buffer.byteLength(JSON.stringify(messages));
  assert.ok(size > 32000 && size < 32768);
  await assert.rejects(agent.chat({ ...request, messages }), (error) => error.status === 413);
  assert.equal(calls.length, 0);
});

test('Unicode reply cannot create a session that exceeds the combined replay byte budget', async (t) => {
  const { agent, request } = await fixture(t, {
    fetchImpl: async () => Response.json({ choices: [{ message: { content: 'я'.repeat(6000) } }] }),
  });
  const messages = [6000, 6000, 6000, 6000, 1000].map((length, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    content: 'x'.repeat(length),
  }));
  assert.ok(Buffer.byteLength(JSON.stringify(messages)) < 26000);
  await assert.rejects(
    agent.chat({ ...request, messages }),
    (error) =>
      error.status === 502 &&
      /Reply would exceed session limit; export conversation and start new session/.test(
        error.message
      )
  );
});

test('final redacted reply is rechecked when a short configured secret expands the text', async (t) => {
  const { agent, request } = await fixture(t, {
    env: { DEMO_API_KEY: 'short' },
    fetchImpl: async () =>
      Response.json({ choices: [{ message: { content: 'short'.repeat(601) } }] }),
  });
  await assert.rejects(
    agent.chat(request),
    (error) =>
      error.status === 502 &&
      /6000-character conversation limit/.test(error.message) &&
      !error.message.includes('short')
  );
});

test('provider response bound includes streamed bodies and declared lengths', async (t) => {
  for (const response of [
    () => new Response('small', { headers: { 'content-length': String(1024 * 1024 + 1) } }),
    () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024));
            controller.enqueue(new Uint8Array(1));
            controller.close();
          },
        })
      ),
  ]) {
    const { agent, request } = await fixture(t, { fetchImpl: async () => response() });
    await assert.rejects(
      agent.chat(request),
      (e) => e.status === 502 && /too large/.test(e.message)
    );
  }
});

test('45-second timeout aborts stalled fetch even when fetch ignores cancellation', async (t) => {
  let signal;
  const { agent, request } = await fixture(t, {
    fetchImpl: async (_url, options) => {
      signal = options.signal;
      return new Promise(() => {});
    },
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = agent.chat(request);
  const rejection = assert.rejects(pending, (e) => e.status === 504);
  // No selected files means execution reaches fetch without filesystem awaits.
  assert.ok(signal);
  t.mock.timers.tick(45000);
  await rejection;
  assert.equal(signal.aborted, true);
});

test('agents expose only local requests even with credentials and unknown configuration', async (t) => {
  const { agent, calls } = await fixture(t, {
    localOnly: false,
    env: { DEMO_API_KEY: 'synthetic-key', EXTERNAL_ENDPOINT: 'https://remote.example/api' },
  });
  assert.deepEqual(
    agent.providers().providers.map((item) => item.id),
    ['local']
  );
  const context = await agent.context(selection);
  for (const provider of ['external', 'remote', 'cloud'])
    await assert.rejects(
      agent.chat({
        provider,
        model: 'synthetic-model',
        contextId: context.contextId,
        messages: [{ role: 'user', content: 'Synthetic message' }],
        consent: true,
      }),
      (error) => error.status === 400
    );
  assert.equal(calls.length, 0);
});
