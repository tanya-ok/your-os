import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  entryPoints: ['src/components/LivePreview.jsx'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  jsx: 'automatic',
});
const loaded = { exports: {} };
new Function('require', 'module', 'exports', bundle.outputFiles[0].text)(
  createRequire(`${process.cwd()}/package.json`),
  loaded,
  loaded.exports
);
const { previewMayReload } = loaded.exports;
test('live preview preserves drafts, pending requests, conversations and dialogs', () => {
  const ready = { page: 'main', edited: false, busy: false, preserved: false, dialog: false };
  assert.equal(previewMayReload(ready), true);
  for (const key of ['edited', 'busy', 'preserved', 'dialog'])
    assert.equal(previewMayReload({ ...ready, [key]: true }), false);
  for (const page of ['agent', 'work', 'setup', 'calendar', undefined])
    assert.equal(previewMayReload({ ...ready, page }), false);
});
