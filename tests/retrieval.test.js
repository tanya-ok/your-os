import assert from 'node:assert/strict';
import { link, lstat, mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createRetrieval } from '../lib/retrieval.js';
import { atomicWrite } from '../lib/writer.js';

const file = (path, text) => ({ path: `Projects/${path}.md`, text });
async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'personal-os-retrieval-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, databasePath: join(root, 'retrieval.sqlite') };
}

test('retrieval ranks relevant selected passages with exact line citations', async () => {
  const retrieval = createRetrieval();
  const files = [
    file('garden', '# Garden\nComposting soil improves a garden.\nKeep leaves for compost.\n'),
    file(
      'human',
      '# Human\nAn unrelated glossary mentions compost once among many other words about conversation and listening.'
    ),
  ];
  const result = await retrieval.retrieve({ files, query: 'compost' });
  assert.equal(result.retrieval.method, 'sqlite-fts5-bm25');
  assert.equal(result.retrieval.indexedNotes, 2);
  assert.equal(result.notes[0].path, 'Projects/garden.md');
  assert.deepEqual(result.retrieval.sources[0], {
    path: 'Projects/garden.md',
    startLine: 1,
    endLine: 3,
  });
  assert.equal(result.notes[0].text, files[0].text);
});

test('Unicode prefixes retrieve Cyrillic text without a network or embedding service', async () => {
  const result = await createRetrieval().retrieve({
    files: [
      file('garden', 'Садоводство для начинающих\nПочва, компостирование и лес.'),
      file('other', 'Совсем другая тема'),
    ],
    query: 'садов компост',
  });
  assert.deepEqual(
    result.notes.map((note) => note.path),
    ['Projects/garden.md']
  );
});

test('database persists between instances, refreshes changed notes and removes stale selected scope', async (t) => {
  const { databasePath } = await fixture(t);
  const first = createRetrieval({ databasePath });
  await first.retrieve({
    files: [file('garden', 'compost old'), file('hidden', 'compost secret')],
    query: 'compost',
  });
  const reopened = createRetrieval({ databasePath });
  const scoped = await reopened.retrieve({
    files: [file('garden', 'compost updated')],
    query: 'compost',
  });
  assert.equal(scoped.notes.length, 1);
  assert.equal(scoped.notes[0].text, 'compost updated');
  assert.equal(scoped.retrieval.indexedNotes, 1);
  const database = new DatabaseSync(databasePath);
  assert.deepEqual(
    database
      .prepare('SELECT path FROM notes')
      .all()
      .map((row) => row.path),
    ['Projects/garden.md']
  );
  assert.equal(database.prepare('SELECT text FROM chunks').get().text, 'compost updated');
  database.close();
  const emptied = await reopened.retrieve({ files: [file('garden', '')], query: 'compost' });
  assert.deepEqual(emptied.notes, []);
  assert.equal(emptied.retrieval.indexedChunks, 0);
  assert.equal((await lstat(databasePath)).mode & 0o777, 0o600);
});

test('empty and nontext query yield no fabricated results; FTS operators and SQL remain data', async () => {
  const retrieval = createRetrieval();
  const files = [file('garden', 'garden compost'), file('other', 'unrelated private text')];
  for (const query of ['', '   ', '★ ; " ()', 'zzzz-no-such-word'])
    assert.deepEqual((await retrieval.retrieve({ files, query })).notes, []);
  const result = await retrieval.retrieve({
    files,
    query: '"garden"* OR path:*; DROP TABLE notes; --',
  });
  assert.equal(result.notes[0].path, 'Projects/garden.md');
  assert.equal((await retrieval.retrieve({ files, query: 'compost' })).notes.length, 1);
});

test('chunks preserve source line spans and bound returned bytes and result count', async () => {
  const content = Array.from(
    { length: 120 },
    (_, index) => `Line ${index + 1}: сад сад сад ${'я'.repeat(75)}`
  ).join('\n');
  const result = await createRetrieval().retrieve({ files: [file('long', content)], query: 'сад' });
  assert.ok(result.retrieval.indexedChunks > 6);
  assert.ok(result.notes.length <= 6);
  assert.ok(result.notes.reduce((sum, note) => sum + Buffer.byteLength(note.text), 0) <= 12 * 1024);
  for (const note of result.notes) {
    assert.ok(note.startLine >= 1 && note.endLine >= note.startLine);
    const quoted = content
      .split('\n')
      .slice(note.startLine - 1, note.endLine)
      .join('\n');
    assert.ok(quoted.includes(note.text.replace(/\n$/, '')));
  }
});

test('retrieval rejects oversized, duplicate and outside-adapter scope', async () => {
  const retrieval = createRetrieval();
  await assert.rejects(
    retrieval.retrieve({ files: [file('big', 'x'.repeat(2 * 1024 * 1024 + 1))], query: 'x' }),
    /too large/
  );
  await assert.rejects(
    retrieval.retrieve({ files: [file('one', 'a'), file('one', 'b')], query: 'a' }),
    /Invalid retrieval scope/
  );
  await assert.rejects(
    retrieval.retrieve({ files: [{ path: '../secret.md', text: 'a' }], query: 'a' }),
    /Invalid retrieval scope/
  );
  await assert.rejects(
    retrieval.retrieve({ files: [], query: 'x'.repeat(501) }),
    /Invalid retrieval request/
  );
  await assert.rejects(
    retrieval.retrieve({
      files: Array.from({ length: 104 }, (_, index) => file(`p${index}`, 'a')),
      query: 'a',
    }),
    /Invalid retrieval request/
  );
});

test('linked database, parent and journal paths are refused without disclosing filenames', async (t) => {
  const { root, databasePath } = await fixture(t);
  const outside = join(root, 'do-not-touch');
  await atomicWrite(outside, 'private-value');
  await symlink(outside, databasePath);
  await assert.rejects(createRetrieval({ databasePath }).retrieve({ files: [], query: 'a' }), {
    message: 'Local retrieval database is unavailable or unsafe',
  });
  await rm(databasePath);
  await link(outside, databasePath);
  await assert.rejects(
    createRetrieval({ databasePath }).retrieve({ files: [], query: 'a' }),
    /unavailable or unsafe/
  );
  await rm(databasePath);
  await mkdir(join(root, 'real'));
  await symlink(join(root, 'real'), join(root, 'linked'));
  await assert.rejects(
    createRetrieval({ databasePath: join(root, 'linked', 'index.sqlite') }).retrieve({
      files: [],
      query: 'a',
    }),
    /unavailable or unsafe/
  );
  await symlink(outside, `${databasePath}-journal`);
  await assert.rejects(
    createRetrieval({ databasePath }).retrieve({ files: [], query: 'a' }),
    /unavailable or unsafe/
  );
});
