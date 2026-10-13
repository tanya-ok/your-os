import { createHash } from 'node:crypto';
import { lstat, mkdir, readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
import { acquireRuntimeLease, requireFreePort } from '../lib/runtime-lease.js';
import { migrateStorage } from '../lib/storage-migration.js';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: join(root, '.env'), quiet: true });
const privateRoot = join(root, 'private');
await mkdir(privateRoot, { recursive: true, mode: 0o700 });
if ((await lstat(privateRoot)).isSymbolicLink()) throw new Error('private must not be a symlink');
async function seed(from, to) {
  await mkdir(to, { recursive: true, mode: 0o700 });
  if ((await lstat(to)).isSymbolicLink()) throw new Error('Demo directories must not be symlinks');
  for (const entry of await readdir(from, { withFileTypes: true })) {
    const target = join(to, entry.name);
    if (entry.isDirectory()) await seed(join(from, entry.name), target);
    else if (entry.isFile()) {
      try {
        await lstat(target);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
        await atomicWrite(target, await readFile(join(from, entry.name), 'utf8'));
      }
    }
  }
}
const mode = process.env.VAULT_PATH?.trim() ? 'vault' : 'demo';
const vaultRoot =
  mode === 'vault' ? resolve(process.env.VAULT_PATH) : join(privateRoot, 'demo-vault');
if (mode === 'demo') {
  let initialize = false;
  try {
    const stat = await lstat(vaultRoot);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe demo directory');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    initialize = true;
  }
  if (initialize) await seed(join(root, 'demo', 'vault'), vaultRoot);
}
const selfVaultRoot =
  mode === 'demo'
    ? join(privateRoot, 'vaults', 'Person-self-model')
    : process.env.PERSON_SELF_MODEL_PATH?.trim()
      ? resolve(process.env.PERSON_SELF_MODEL_PATH)
      : null;
const aiVaultRoot =
  mode === 'demo'
    ? join(privateRoot, 'vaults', 'AI-Model')
    : process.env.AI_MODEL_PATH?.trim()
      ? resolve(process.env.AI_MODEL_PATH)
      : null;
if (mode === 'demo') {
  await seed(join(root, 'demo', 'vaults', 'Person-self-model'), selfVaultRoot);
  await seed(join(root, 'demo', 'vaults', 'AI-Model'), aiVaultRoot);
}
const port = Number(process.env.PORT || 3104);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('PORT must be 1024..65535');
if (
  process.env.DASHBOARD_HOST &&
  !['127.0.0.1', 'localhost', '::1'].includes(process.env.DASHBOARD_HOST)
) {
  throw new Error('This release supports loopback access only');
}
try {
  await readFile(join(root, 'static', 'bundle.js'));
} catch {
  throw new Error('Frontend not built. Run pnpm run build first.');
}
const writable = mode === 'demo' || process.env.ALLOW_VAULT_WRITES === 'true';
const storageId = createHash('sha256')
  .update(JSON.stringify([vaultRoot, selfVaultRoot, aiVaultRoot]))
  .digest('hex')
  .slice(0, 16);
await requireFreePort(port);
const releaseLease = await acquireRuntimeLease(privateRoot, storageId);
let leaseReleased = false;
async function release() {
  if (!leaseReleased) {
    leaseReleased = true;
    await releaseLease();
  }
}
if (writable) {
  const result = await migrateStorage({
    root: vaultRoot,
    privateRoot,
    scopeId: storageId,
    offline: true,
    workLogPath: join(privateRoot, `work-${storageId}.sqlite`),
    dailySourcesPath: join(privateRoot, `sources-${storageId}.sqlite`),
    profilePath: join(privateRoot, 'profile.json'),
  });
  console.log(
    result.repeated
      ? `Markdown storage: migration already complete (${result.records} records)`
      : `Markdown storage: ${result.records} records migrated, ${result.comparisons} verified`
  );
}
const app = createApp({
  ownerOrigin: `http://localhost:${port}`,
  livePreview: process.env.PERSONAL_OS_DEV === '1',
  selfVaultRoot,
  aiVaultRoot,
  modelVaultsWritable: mode === 'demo' || process.env.ALLOW_MODEL_VAULT_WRITES === 'true',
  retrievalPath: join(privateRoot, `knowledge-${storageId}.sqlite`),
  workLogPath: join(privateRoot, `work-${storageId}.sqlite`),
  dailySourcesPath: join(privateRoot, `sources-${storageId}.sqlite`),
  vaultRoot,
  profilePath: join(privateRoot, 'profile.json'),
  mode,
  writable,
});
const server = serve({ fetch: app.fetch, hostname: '127.0.0.1', port }, () => {
  console.log(
    `Personal OS: http://127.0.0.1:${port} (${mode}, ${writable ? 'writes enabled' : 'read only'})`
  );
});
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () =>
    server.close(async () => {
      await release();
      process.exit(0);
    })
  );
