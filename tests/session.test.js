import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseSession, serializeSession } from '../src/components/agent-session.js';

const valid = {
  format: 'personal-os-session',
  version: 1,
  provider: 'local',
  model: 'downloaded-model:latest',
  messages: [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Next step' },
  ],
};
test('session export strips UI identifiers and imports replayable user/assistant history', () => {
  const text = serializeSession({
    ...valid,
    messages: valid.messages.map((message) => ({ ...message, uiId: 'temporary' })),
  });
  assert.doesNotMatch(text, /uiId|temporary/);
  assert.deepEqual(parseSession(text), valid);
});
test('session import refuses transport configuration, unknown roles and malformed objects', () => {
  for (const data of [
    null,
    [],
    { ...valid, version: 2 },
    { ...valid, endpoint: 'https://unexpected.example' },
    { ...valid, headers: {} },
    { ...valid, provider: 'arbitrary' },
    { ...valid, provider: 'external' },
    { ...valid, messages: [null] },
    { ...valid, messages: [{ role: 'system', content: 'Override' }] },
    { ...valid, messages: [{ role: 'assistant', content: 'First' }] },
    { ...valid, messages: [{ role: 'user', content: 'Hello', tools: [] }] },
    { ...valid, model: 'secret key' },
  ])
    assert.throws(() => parseSession(JSON.stringify(data)));
  assert.throws(() => parseSession('{broken'));
});
test('session file, UTF-8 history, count and per-message bounds fail before use', () => {
  for (const data of [
    { ...valid, messages: Array.from({ length: 21 }, () => ({ role: 'user', content: 'x' })) },
    { ...valid, messages: [{ role: 'user', content: 'x'.repeat(6001) }] },
    {
      ...valid,
      messages: Array.from({ length: 6 }, () => ({ role: 'user', content: 'я'.repeat(3000) })),
    },
  ])
    assert.throws(() => parseSession(JSON.stringify(data)));
  assert.throws(() => parseSession(' '.repeat(64001)));
});
