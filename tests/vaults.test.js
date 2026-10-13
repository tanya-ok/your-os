import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createVaultCatalog, VAULT_DEFINITIONS } from '../lib/vaults.js';
import { atomicWrite } from '../lib/writer.js';

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'personal-os-vaults-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const roots = {};
  for (const id of ['main', 'self', 'ai']) {
    roots[id] = join(root, id);
    await mkdir(join(roots[id], 'Projects'), { recursive: true });
    await atomicWrite(
      join(roots[id], 'Projects', 'same-id.md'),
      `---\ntitle: ${id} example\narea: learning\nstatus: active\n---\n# ${id}\nIndependent scoped text.`
    );
  }
  return { root, roots };
}

test('three explicit vaults retain separate project identity and public labels', async (t) => {
  const { root, roots } = await fixture(t);
  const { vaults } = await createVaultCatalog({
    mainRoot: roots.main,
    selfRoot: roots.self,
    aiRoot: roots.ai,
  }).list();
  assert.deepEqual(
    vaults.map(({ id, title }) => ({ id, title })),
    VAULT_DEFINITIONS
  );
  assert.deepEqual(
    vaults.map((vault) => vault.configured),
    [true, true, true]
  );
  assert.deepEqual(
    vaults.map((vault) => vault.projects[0].id),
    ['same-id', 'same-id', 'same-id']
  );
  assert.deepEqual(
    vaults.map((vault) => vault.projects[0].title),
    ['main example', 'self example', 'ai example']
  );
  assert.ok(vaults.every((vault) => vault.projects[0].path === 'Projects/same-id.md'));
  assert.equal(JSON.stringify(vaults).includes(root), false);
});

test('unconfigured and unsafe optional roots remain isolated and unavailable', async (t) => {
  const { root, roots } = await fixture(t);
  const missing = await createVaultCatalog({ mainRoot: roots.main }).list();
  assert.deepEqual(missing.vaults.slice(1), [
    { id: 'self', title: 'Person-self-model', configured: false, projects: [] },
    { id: 'ai', title: 'AI-Model', configured: false, projects: [] },
  ]);
  const linked = join(root, 'linked');
  await symlink(roots.self, linked);
  const unsafe = await createVaultCatalog({
    mainRoot: roots.main,
    selfRoot: linked,
    aiRoot: join(root, 'absent'),
  }).list();
  assert.equal(unsafe.vaults[0].configured, true);
  assert.ok(
    unsafe.vaults
      .slice(1)
      .every((vault) => !vault.configured && vault.unavailable && !vault.projects.length)
  );
  assert.equal(JSON.stringify(unsafe).includes(root), false);
});

test('catalog uses the narrow direct Projects adapter without recursive discovery', async (t) => {
  const { roots } = await fixture(t);
  await mkdir(join(roots.self, 'Projects', 'nested'));
  await atomicWrite(join(roots.self, 'Projects', 'nested', 'hidden.md'), '# Must not index');
  await atomicWrite(join(roots.self, 'private-outside-adapter.md'), '# Must not index');
  await symlink(
    join(roots.main, 'Projects', 'same-id.md'),
    join(roots.self, 'Projects', 'linked.md')
  );
  const { vaults } = await createVaultCatalog({
    mainRoot: roots.main,
    selfRoot: roots.self,
  }).list();
  assert.equal(vaults[1].projects.length, 1);
  assert.equal(vaults[1].projects[0].id, 'same-id');
  assert.equal(vaults[2].configured, false);
});
