import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAgent } from '../lib/agent.js';
import { safeRoot } from '../lib/safe-path.js';

async function fixture(t, handler) {
  const root = await safeRoot(await mkdtemp(join(tmpdir(), 'personal-os-http-agent-')));
  const received = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received.push({
      url: request.url,
      method: request.method,
      headers: request.headers,
      text: Buffer.concat(chunks).toString('utf8'),
    });
    handler(request, response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  });
  const endpoint = `http://127.0.0.1:${server.address().port}/v1/chat/completions`;
  const agent = createAgent({ root, env: { PERSONAL_OS_LLM_URL: endpoint } });
  const context = await agent.context({
    projectIds: [],
    includeTasks: false,
    includeReview: false,
    instruction: 'Plan a small step',
  });
  const request = {
    provider: 'local',
    model: 'downloaded-example',
    contextId: context.contextId,
    messages: [{ role: 'user', content: 'What next?' }],
    consent: true,
  };
  return { agent, endpoint, received, request };
}

test('actual fetch sends the local chat-completions wire format over loopback HTTP', async (t) => {
  const { agent, endpoint, received, request } = await fixture(t, (_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Choose one step.' } }] })
    );
  });
  assert.equal(agent.providers().providers[0].endpoint, endpoint);
  assert.deepEqual(await agent.chat(request), {
    message: { role: 'assistant', content: 'Choose one step.' },
    provider: 'local',
    model: 'downloaded-example',
  });
  assert.equal(received.length, 1);
  const actual = received[0];
  assert.equal(actual.url, '/v1/chat/completions');
  assert.equal(actual.method, 'POST');
  assert.equal(actual.headers['content-type'], 'application/json');
  assert.equal(actual.headers.authorization, undefined);
  const body = JSON.parse(actual.text);
  assert.equal(body.model, request.model);
  assert.equal(body.stream, false);
  assert.equal(body.max_tokens, 2048);
  assert.equal(body.tools, undefined);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /untrusted data/);
  assert.match(body.messages[0].content, /Plan a small step/);
  assert.deepEqual(body.messages.slice(1), request.messages);
});

test('actual fetch rejects redirects without requesting their destination', async (t) => {
  const { agent, received, request } = await fixture(t, (_request, response) => {
    response.writeHead(302, { location: '/redirect-destination' });
    response.end('Provider redirect body is private');
  });
  await assert.rejects(
    agent.chat(request),
    (error) => error.status === 502 && !error.message.includes('private')
  );
  assert.deepEqual(
    received.map((item) => item.url),
    ['/v1/chat/completions']
  );
});

test('status, context previews and denied consent produce zero HTTP requests', async (t) => {
  const { agent, received, request } = await fixture(t, (_request, response) => {
    response.writeHead(500);
    response.end('Unexpected request');
  });
  agent.providers();
  await agent.context({
    projectIds: [],
    includeTasks: false,
    includeReview: false,
    instruction: 'Preview only',
  });
  for (const consent of [false, undefined])
    await assert.rejects(agent.chat({ ...request, consent }), /Invalid agent request/);
  await assert.rejects(agent.chat({ ...request, model: '' }), /model is required/);
  assert.equal(received.length, 0);
});
