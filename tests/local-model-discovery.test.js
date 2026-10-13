import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgent } from '../lib/agent.js';

function fixture(fetchImpl, env = {}) {
  return createAgent({ root: '/unused-model-discovery-root', env, fetchImpl });
}

test('local model discovery is explicit metadata-only GET and returns exact unique installed IDs', async () => {
  const calls = [];
  const agent = fixture(
    async (...args) => {
      calls.push(args);
      return Response.json({
        data: [
          { id: 'installed-example:4b' },
          { id: 'second-model/12b' },
          { id: 'installed-example:4b' },
          { id: 'invalid model name' },
          { id: 'example:cloud' },
          { id: 'example-cloud' },
          { id: 42 },
          {},
        ],
      });
    },
    { DEMO_API_KEY: 'example-secret', OTHER_TOKEN: 'other-secret' }
  );
  agent.providers();
  assert.equal(calls.length, 0);
  const result = await agent.listModels();
  assert.deepEqual(result, {
    models: ['installed-example:4b', 'second-model/12b'],
    endpoint: 'http://127.0.0.1:11434/v1/models',
  });
  assert.equal(calls.length, 1);
  const [url, options] = calls[0];
  assert.equal(url, result.endpoint);
  assert.equal(options.method, 'GET');
  assert.equal(options.redirect, 'error');
  assert.deepEqual(options.headers, { accept: 'application/json' });
  assert.equal(Object.hasOwn(options, 'body'), false);
  assert.ok(!JSON.stringify(options).includes('secret'));
});

test('discovery only accepts the existing literal-loopback chat endpoint shape', async () => {
  let calls = 0;
  const agent = fixture(async () => {
    calls++;
    return Response.json({ data: [] });
  });
  for (const endpoint of [
    'https://example.org/v1/chat/completions',
    'http://127.1/v1/chat/completions',
    'http://2130706433/v1/chat/completions',
    'http://localhost.evil/v1/chat/completions',
    'http://user:pass@localhost/v1/chat/completions',
    'http://localhost/v1/chat/completions?key=secret',
    'http://localhost/v1/chat/completions#fragment',
    'http://localhost/v1/models',
    'http://localhost:0/v1/chat/completions',
    'http://localhost:65536/v1/chat/completions',
  ])
    await assert.rejects(agent.listModels({ endpoint }), /unsafe/);
  await assert.rejects(
    agent.listModels({ endpoint: 'http://localhost/v1/chat/completions', notes: 'private' }),
    /Invalid agent request/
  );
  assert.equal(calls, 0);
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const endpoint = `http://${host}:11434/v1/chat/completions`;
    assert.deepEqual((await agent.listModels({ endpoint })).models, []);
  }
  assert.equal(calls, 3);
  const invalid = fixture(
    async () => {
      throw new Error('not called');
    },
    { PERSONAL_OS_LLM_URL: 'https://example.org/v1/chat/completions' }
  );
  await assert.rejects(invalid.listModels(), /unsafe/);
});

test('discovery rejects unsuccessful, invalid and oversized responses without provider details', async () => {
  for (const response of [
    new Response('private-server-response', { status: 302 }),
    Response.json({ models: ['wrong shape'] }),
    Response.json({ data: Array.from({ length: 501 }, () => ({ id: 'model' })) }),
    new Response('invalid JSON'),
  ]) {
    const agent = fixture(async () => response);
    await assert.rejects(agent.listModels(), (error) => {
      assert.ok(!error.message.includes('private-server-response'));
      return error.status === 502;
    });
  }
  const large = fixture(
    async () => new Response('{}', { headers: { 'content-length': String(1024 * 1024 + 1) } })
  );
  await assert.rejects(large.listModels(), /too large/);
  const broken = fixture(async () => {
    throw new Error('credential=DO-NOT-LEAK');
  });
  await assert.rejects(broken.listModels(), (error) => {
    assert.ok(!error.message.includes('DO-NOT-LEAK'));
    return /discover local models/.test(error.message);
  });
});

test('discovery has the existing bounded provider timeout and aborts the request', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal;
  const agent = fixture(async (_url, options) => {
    signal = options.signal;
    return new Promise(() => {});
  });
  const pending = assert.rejects(agent.listModels(), /discovery timed out/);
  t.mock.timers.tick(45000);
  await pending;
  assert.equal(signal.aborted, true);
});
