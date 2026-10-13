import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: {
    contents:
      "export {renderToStaticMarkup} from 'react-dom/server'; export {createElement} from 'react'; export {default as DemoPages, LIBRARY_REFERENCE} from './src/components/DemoPages.jsx';",
    resolveDir: root,
    sourcefile: 'library-reference-entry.jsx',
    loader: 'jsx',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  jsx: 'automatic',
  banner: {
    js: `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(`${root}package.json`)});`,
  },
});
const { renderToStaticMarkup, createElement, DemoPages, LIBRARY_REFERENCE } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

test('the reference identifies the requested Oxford book and its official record', () => {
  assert.equal(LIBRARY_REFERENCE.title, 'A Dictionary of Logic');
  assert.equal(LIBRARY_REFERENCE.authors, 'Thomas Macaulay Ferguson & Graham Priest');
  assert.equal(LIBRARY_REFERENCE.publisher, 'Oxford University Press');
  assert.equal(LIBRARY_REFERENCE.year, 2016);
  const source = new URL(LIBRARY_REFERENCE.source);
  assert.equal(source.protocol, 'https:');
  assert.equal(source.hostname, 'www.oxfordreference.com');
  assert.ok(source.pathname.includes('9780191816802'));
});

for (const locale of ['en', 'ru']) {
  test(`Library renders the same English Oxford title, authors and independent title card in ${locale}`, () => {
    const html = renderToStaticMarkup(createElement(DemoPages, { page: 'library', locale }));
    assert.match(html, /<strong>A Dictionary of Logic<\/strong>/);
    assert.match(html, /Thomas Macaulay Ferguson &amp; Graham Priest/);
    assert.equal(LIBRARY_REFERENCE.publisher, 'Oxford University Press');
    assert.equal(LIBRARY_REFERENCE.year, 2016);
    assert.doesNotMatch(html, /<dialog/);
    assert.match(
      html,
      /<img[^>]*src="\/library-dictionary-logic\.svg"[^>]*alt="A Dictionary of Logic"/
    );
    assert.doesNotMatch(html, /aria-label="Resource details"/);
    assert.doesNotMatch(html, /Kondakov|Кондаков|Логический словарь-справочник|Nauka|Наука/);
    assert.match(html, /aria-pressed="false" aria-label="Open resource: A Dictionary of Logic/);
    assert.match(html, /type="search"/);
    for (const label of ['Audiobook', 'Video', 'Film', 'Course', 'Genre'])
      assert.ok(html.includes(label));
  });
}

test('the bundled title card is original SVG, not the unlicensed publisher cover', async () => {
  const text = await readFile(
    new URL(`../static${LIBRARY_REFERENCE.cover}`, import.meta.url),
    'utf8'
  );
  assert.match(text, /<svg/);
  assert.match(text, /Independent title card/);
  assert.match(text, /A Dictionary/);
  assert.doesNotMatch(text, /<script|<image|https?:\/\/(?!www.w3.org)/);
});
