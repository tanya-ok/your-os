import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  initialLibraryState,
  libraryGenres,
  libraryStateFits,
  mergeResourceMetadata,
  resourceURL,
} from '../lib/library-records.js';

test('metadata fills gaps without overwriting personal notes or corrections', () => {
  const value = mergeResourceMetadata(
    {
      title: 'My corrected title',
      url: 'https://example.org/book',
      notes: 'My private reading note',
      genres: ['Logic'],
      author: '',
    },
    {
      title: 'Remote title',
      author: 'Public author',
      genres: ['logic', 'Philosophy'],
      categories: ['Reference'],
      description: 'Public description',
      sourceUrl: 'https://example.org/book',
      fetchedAt: '2026-10-08T08:00:00Z',
    }
  );
  assert.equal(value.title, 'My corrected title');
  assert.equal(value.notes, 'My private reading note');
  assert.equal(value.author, 'Public author');
  assert.deepEqual(value.genres, ['Logic', 'Philosophy', 'Reference']);
});
test('absent metadata does not invent genres or remove manually supplied fields', () => {
  const value = mergeResourceMetadata(
    { title: '', notes: 'Keep', genres: [], author: 'My author' },
    { title: 'Source title' }
  );
  assert.equal(value.title, 'Source title');
  assert.equal(value.author, 'My author');
  assert.deepEqual(value.genres, []);
  assert.equal(value.notes, 'Keep');
});
test('resource links do not render script, local files or credential URLs', () => {
  for (const url of [
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,x',
    'http://example.org',
    'https://name:password@example.org',
  ])
    assert.equal(resourceURL(url), '');
  assert.equal(resourceURL('https://example.org/book'), 'https://example.org/book');
});
test('genre normalization removes duplicates and bounds individual collections', () => {
  assert.deepEqual(libraryGenres('Logic, logic; Philosophy\n Nature'), [
    'Logic',
    'Philosophy',
    'Nature',
  ]);
  assert.equal(libraryGenres(Array.from({ length: 30 }, (_, i) => `genre${i}`)).length, 12);
});
test('the shelf respects database size and resource-count limits', () => {
  assert.equal(libraryStateFits(initialLibraryState().items), true);
  assert.equal(libraryStateFits(Array(101).fill({ title: 'X' })), false);
  assert.equal(libraryStateFits([{ notes: 'x'.repeat(61 * 1024) }]), false);
});
