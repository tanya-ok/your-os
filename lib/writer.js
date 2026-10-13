import { randomUUID } from 'node:crypto';
import { open, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { safePath, safeRoot } from './safe-path.js';

export async function atomicWrite(filePath, content) {
  const directory = await safeRoot(dirname(filePath));
  const name = basename(filePath);
  const target = await safePath(directory, name);
  const temporary = join(directory, `.tmp-${randomUUID()}`);
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    await safePath(directory, name);
    await rename(temporary, target);
  } finally {
    await handle?.close();
    try {
      await unlink(temporary);
    } catch {
      /* Best-effort cleanup must not hide the original operation result. */
    }
  }
}
