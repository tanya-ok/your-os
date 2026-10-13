import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { transform } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const source = await readFile(
  new URL('../src/components/MarkdownView.jsx', import.meta.url),
  'utf8'
);
const { code } = await transform(source, { loader: 'jsx', jsx: 'automatic', format: 'esm' });
const compiled = code.replaceAll(
  '"react/jsx-runtime"',
  JSON.stringify(import.meta.resolve('react/jsx-runtime'))
);
const { default: MarkdownView } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

test('project reading renders headings, lists and tables without duplicating the title', () => {
  const output = renderToStaticMarkup(
    React.createElement(MarkdownView, {
      title: 'Example',
      text: '# Example\n\n## Options\n\n- First **option**\n- Second\n\n| Name | State |\n| --- | --- |\n| Item | Ready |',
    })
  );
  assert.match(output, /<h3>Options<\/h3>/);
  assert.match(output, /<ul>/);
  assert.match(output, /<strong>option<\/strong>/);
  assert.match(output, /<table>/);
  assert.doesNotMatch(output, />Example</);
});

test('note and model content never renders active HTML or unsafe links', () => {
  const output = renderToStaticMarkup(
    React.createElement(MarkdownView, {
      text: '<script>alert(1)</script>\n\n[unsafe](javascript:alert) [safe](https://example.org) [[Projects/example|A project]]',
      onProject: () => {},
    })
  );
  assert.doesNotMatch(output, /<script>|href="javascript:/);
  assert.match(output, /&lt;script&gt;/);
  assert.match(output, /href="https:\/\/example.org\/"/);
  assert.match(output, /<button.*A project<\/button>/);
});

test('project reading preserves completed and open task states without permitting direct writes', () => {
  const output = renderToStaticMarkup(
    React.createElement(MarkdownView, { text: '- [x] Completed step\n- [ ] Open step' })
  );
  assert.match(output, /aria-label="Completed task" checked/);
  assert.match(output, /aria-label="Open task"/);
  assert.equal((output.match(/disabled=""/g) || []).length, 2);
});
