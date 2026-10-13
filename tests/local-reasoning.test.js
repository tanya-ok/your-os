import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAgent } from '../lib/agent.js';

async function fixture() {
  const calls = [];
  const agent = createAgent({
    root: '/unused-reasoning-test-root',
    env: {},
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return Response.json({ choices: [{ message: { content: 'Visible reply' } }] });
    },
  });
  const context = await agent.context({
    projectIds: [],
    includeTasks: false,
    includeReview: false,
    instruction: '',
  });
  return {
    agent,
    calls,
    request: {
      provider: 'local',
      model: 'example-model',
      contextId: context.contextId,
      messages: [{ role: 'user', content: 'Hello' }],
      consent: true,
    },
  };
}
test('local reasoning effort passes through only explicit supported values and Default omits it', async () => {
  const { agent, calls, request } = await fixture();
  for (const reasoningEffort of ['none', 'low', 'medium', 'high']) {
    assert.equal(
      (await agent.chat({ ...request, reasoningEffort })).message.content,
      'Visible reply'
    );
    assert.equal(calls.at(-1).body.reasoning_effort, reasoningEffort);
  }
  await agent.chat(request);
  assert.equal(Object.hasOwn(calls.at(-1).body, 'reasoning_effort'), false);
});
test('invalid reasoning controls are rejected before network', async () => {
  const { agent, calls, request } = await fixture();
  for (const reasoningEffort of ['', null, 'maximum', true, {}, 42])
    await assert.rejects(agent.chat({ ...request, reasoningEffort }), /Invalid agent request/);
  assert.equal(calls.length, 0);
});
