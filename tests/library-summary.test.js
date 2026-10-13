import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatLibrarySummary,
  generateLibrarySummary,
  librarySummaryPrompt,
} from '../lib/library-summary.js';

test('library overviews send only resource details to the local model', async () => {
  const calls = [];
  const item = {
    title: 'A resource',
    author: 'An author',
    description: 'Public description',
    notes: 'PRIVATE NOTE MUST NOT BE SENT',
    privateToken: 'SECRET',
  };
  const result = await generateLibrarySummary(item, 'qwen3.5:4b', async (path, body) => {
    calls.push({ path, body });
    return path.endsWith('context')
      ? { contextId: 'synthetic-context' }
      : {
          message: {
            content: JSON.stringify({
              overview: 'A brief overview.',
              topics: ['Logic'],
              limits: 'Description only.',
            }),
          },
        };
  });
  assert.deepEqual(calls[0].body.projectIds, []);
  assert.equal(calls[0].body.includeTasks, false);
  assert.equal(calls[0].body.includeReview, false);
  assert.equal(calls[1].body.provider, 'local');
  assert.equal(calls[1].body.consent, true);
  assert.equal(calls[1].body.model, 'qwen3.5:4b');
  assert.doesNotMatch(JSON.stringify(calls), /PRIVATE NOTE|SECRET/);
  assert.match(result.summary, /brief overview/);
  assert.equal(result.summaryModel, 'qwen3.5:4b');
  assert.equal(item.notes, 'PRIVATE NOTE MUST NOT BE SENT');
  assert.match(librarySummaryPrompt(item), /not a full-resource summary/);
});

test('invalid or cloud model IDs are refused before requests; empty replies are not stored', async () => {
  let calls = 0;
  for (const model of ['qwen:cloud', '', 'invalid model'])
    await assert.rejects(
      generateLibrarySummary({ title: 'Resource' }, model, async () => {
        calls++;
      }),
      /downloaded local/
    );
  assert.equal(calls, 0);
  await assert.rejects(
    generateLibrarySummary({ title: 'Resource' }, 'qwen3.5:4b', async (path) =>
      path.endsWith('context') ? { contextId: 'context' } : { message: { content: '' } }
    ),
    /empty or oversized/
  );
});

test('structured library output rejects reasoning prose, malformed fields and overlong answers', () => {
  assert.throws(() => formatLibrarySummary('Here is my thinking about this book'), /structured/);
  assert.throws(
    () =>
      formatLibrarySummary(
        JSON.stringify({ overview: 'x'.repeat(701), topics: [], limits: 'Metadata only.' })
      ),
    /too long/
  );
  assert.throws(
    () =>
      formatLibrarySummary(
        JSON.stringify({ overview: 'Overview.', topics: [null], limits: 'Metadata only.' })
      ),
    /malformed/
  );
  assert.match(
    formatLibrarySummary(
      JSON.stringify({
        overview: 'Reference description.',
        topics: ['Logic'],
        limits: 'Full text not supplied.',
      })
    ),
    /## Limits/
  );
});
