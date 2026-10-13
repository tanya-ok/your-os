import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import Note from './src/components/NoteContent.jsx'; import Vault from './src/components/VaultOverview.jsx'; export const note = props => renderToStaticMarkup(React.createElement(Note, props)); export const vault = props => renderToStaticMarkup(React.createElement(Vault, props));`,
    loader: 'jsx',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  write: false,
  banner: {
    js: `import {createRequire} from 'node:module'; const require = createRequire(${JSON.stringify(`${process.cwd()}/package.json`)});`,
  },
});
const render = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

test('model note tables render real column headers and rows instead of raw Markdown pipes', () => {
  const html = render.note({
    title: 'Working agreements',
    text: '# Working agreements\n\n## Boundaries\n\n| Permission | Default |\n| --- | --- |\n| Notes | Read only |\n| Cloud | Explicit consent |\n',
  });
  assert.ok(html.includes('<table>'));
  assert.ok(html.includes('<th scope="col">Permission</th>'));
  assert.ok(html.includes('<td>Read only</td>'));
  assert.ok(html.includes('<h4>Boundaries</h4>'));
  assert.equal(
    html.includes('Working agreements'),
    false,
    'first matching H1 is already the surrounding card title'
  );
  assert.equal(html.includes('|'), false);
  assert.equal(html.includes('---'), false);
});

test('note paragraphs, emphasis, lists and checkboxes remain readable without Markdown markers', () => {
  const html = render.note({
    title: 'Preferences',
    text: '# Preferences\n\nA **small step** and *enough room*.\n\n- Ask first\n- [x] Choose the scope\n\n1. Observe\n2. Review\n\n[[Projects/garden|Garden practice]]',
  });
  assert.ok(html.includes('<strong>small step</strong>'));
  assert.ok(html.includes('<em>enough room</em>'));
  assert.ok(html.includes('<ul>'));
  assert.ok(html.includes('<ol>'));
  assert.ok(html.includes('aria-label="Completed"'));
  assert.ok(html.includes('Garden practice'));
  for (const marker of ['**', '[x]', '[[', '# Preferences'])
    assert.equal(html.includes(marker), false);
});

test('raw HTML is escaped and unsafe links never become executable anchors', () => {
  const html = render.note({
    text: '<img src=x onerror=alert(1)>\n\n[Unsafe](javascript:alert(1)) and [Source](https://example.org/guide).',
  });
  assert.equal(html.includes('<img'), false);
  assert.ok(html.includes('&lt;img'));
  assert.equal(html.includes('href="javascript:'), false);
  assert.ok(html.includes('href="https://example.org/guide"'));
  assert.ok(html.includes('rel="noreferrer"'));
});

test('a different first heading remains visible and metadata stays outside the reading view', () => {
  const html = render.note({
    title: 'Other title',
    text: '---\nprivate-layout: example-value\n---\n# Distinct heading\n\nBody.',
  });
  assert.ok(html.includes('<h3>Distinct heading</h3>'));
  assert.ok(html.includes('<p>Body.</p>'));
  assert.equal(html.includes('private-layout'), false);
});

test('Setup vault overview shows compact roles, scoped counts, statuses and readable model notes', () => {
  const html = render.vault({
    initialVaults: [
      {
        id: 'main',
        title: 'Main Vault',
        configured: true,
        projects: [{ id: 'garden', title: 'Garden' }],
      },
      {
        id: 'self',
        title: 'Person-self-model',
        configured: true,
        projects: [
          {
            id: 'prefs',
            title: 'Preferences',
            body: '# Preferences\n\n## Attention\n\n- Keep one next step.',
          },
        ],
      },
      { id: 'ai', title: 'AI-Model', configured: false, projects: [] },
    ],
  });
  assert.ok(html.includes('Three spaces, one life'));
  assert.ok(html.includes('1 scoped notes'));
  assert.ok(html.includes('Not connected'));
  assert.ok(html.includes('<summary>Preferences</summary>'));
  assert.ok(html.includes('<h4>Attention</h4>'));
  assert.equal(html.includes('<pre'), false);
  assert.equal(html.includes('# Preferences'), false);
});
