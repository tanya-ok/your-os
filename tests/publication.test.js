import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { atomicWrite } from '../lib/writer.js';
import { copyPublicationFile, publicationPath } from '../scripts/prepare-publication.mjs';

test('publication policy excludes runtime, old artwork and private development evidence', () => {
  for (const path of [
    '.git/config',
    '.env',
    'private/vault/Tasks.md',
    'data/state.sqlite',
    'logs/server.log',
    'docs/screenshots/desktop.jpg',
    'docs/quorum-universal.md',
    'SESSION.md',
    'static/library-dictionary-logic.webp',
    'static/bundle.js',
    'static/bundle.js.map',
    '../lib/config.js',
    'lib/../private/secret.js',
    '/lib/config.js',
    'lib\\config.js',
  ])
    assert.equal(publicationPath(path), false, path);
  for (const path of [
    '.env.tpl',
    'NOTICE',
    'lib/config.js',
    'src/main.jsx',
    'demo/vault/Tasks.md',
    'static/library-dictionary-logic.svg',
    'static/fonts/Manrope-OFL.txt',
    'docs/site/index.md',
    'scripts/prepare-publication.mjs',
  ])
    assert.equal(publicationPath(path), true, path);
});

test('publication copying refuses an allowlisted link to an unrelated file', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'publication-policy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'lib'));
  await atomicWrite(join(root, 'secret'), 'Must not be copied');
  await symlink(join(root, 'secret'), join(root, 'lib', 'config.js'));
  await assert.rejects(
    copyPublicationFile(root, join(root, 'output'), 'lib/config.js'),
    /link refused/
  );
});

test('publication copying rejects a symlinked parent and preserves ordinary source bytes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'publication-parent-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'unrelated'));
  await atomicWrite(join(root, 'unrelated', 'config.js'), 'Private material');
  await symlink(join(root, 'unrelated'), join(root, 'lib'));
  await assert.rejects(
    copyPublicationFile(root, join(root, 'output'), 'lib/config.js'),
    /link refused/
  );
  await atomicWrite(join(root, 'README.md'), 'Public source\n');
  const result = await copyPublicationFile(root, join(root, 'output'), 'README.md');
  assert.equal(await readFile(join(root, 'output', 'README.md'), 'utf8'), 'Public source\n');
  assert.equal(result.bytes, 14);
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  await atomicWrite(join(root, 'environment-template'), 'DEMO_ONLY=true\n');
  const { rename } = await import('node:fs/promises');
  await rename(join(root, 'environment-template'), join(root, '.env.tpl'));
  await copyPublicationFile(root, join(root, 'output'), '.env.tpl');
  assert.equal(await readFile(join(root, 'output', '.env.tpl'), 'utf8'), 'DEMO_ONLY=true\n');
});
