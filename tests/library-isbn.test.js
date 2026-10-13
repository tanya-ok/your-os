import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lookupISBN, normalizeISBN } from '../lib/library-isbn.js';
import { lookupLibraryMetadata } from '../lib/library-metadata.js';

test('ISBN checksum validation rejects malformed identifiers before network requests', async () => {
  assert.equal(normalizeISBN('978-0-19-181680-2'), '9780191816802');
  assert.equal(normalizeISBN('0191816809'), '0191816809');
  for (const value of ['9780191816803', '0191816800', '9780191816802?secret=x', ''])
    assert.equal(normalizeISBN(value), '');
  let calls = 0;
  await assert.rejects(
    lookupISBN('9780191816803', {
      fetchJSON: async () => {
        calls++;
      },
    }),
    /valid ISBN/
  );
  assert.equal(calls, 0);
});

test('ISBN catalog lookup is scoped, attributed and preserves fallback bibliographic facts', async () => {
  const urls = [];
  const result = await lookupLibraryMetadata(
    { isbn: '9780191816802', format: 'book' },
    {
      fetchISBNJSON: async (url) => {
        urls.push(url);
        if (url.includes('openlibrary.org'))
          return {
            'ISBN:9780191816802': {
              title: 'A Dictionary of Logic',
              authors: [{ name: 'Public author' }],
              publish_date: '2016',
              subjects: [{ name: 'Logic' }],
            },
          };
        return {
          items: [
            {
              volumeInfo: {
                title: 'A Dictionary of Logic',
                authors: ['Public author'],
                description: 'Over 450 entries on logic.',
                industryIdentifiers: [{ identifier: '9780191816802' }],
                categories: ['Philosophy'],
              },
            },
          ],
        };
      },
    }
  );
  assert.equal(result.ok, true);
  assert.equal(result.metadata.isbn, '9780191816802');
  assert.equal(result.metadata.description, 'Over 450 entries on logic.');
  assert.deepEqual(result.metadata.genres, ['Philosophy']);
  assert.match(result.metadata.sourceUrl, /^https:\/\/www.googleapis.com/);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((url) => url.includes('9780191816802') && !url.includes('note')));
  await assert.rejects(
    lookupLibraryMetadata(
      { isbn: '9780191816802', notes: 'PRIVATE' },
      {
        fetchISBNJSON: async () => {
          throw new Error('Must not run');
        },
      }
    ),
    /Provide only/
  );
});

test('a mismatched ISBN result is ignored and catalog failures do not fabricate a book', async () => {
  assert.equal(
    await lookupISBN('9780191816802', {
      fetchJSON: async (url) =>
        url.includes('openlibrary')
          ? {}
          : {
              items: [
                {
                  volumeInfo: {
                    title: 'Wrong book',
                    industryIdentifiers: [{ identifier: '9780140328721' }],
                  },
                },
              ],
            },
    }),
    null
  );
  await assert.rejects(
    lookupISBN('9780191816802', {
      fetchJSON: async () => {
        throw new Error('Unavailable');
      },
    }),
    (error) => error.status === 503
  );
});
