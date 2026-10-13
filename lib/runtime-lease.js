import { open, unlink } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { ApiError } from './config.js';
import { readSafe, safeRoot } from './safe-path.js';

// Hold one lease across migration and serving. Never expire a live owner's lease.
export async function acquireRuntimeLease(privateRoot, scopeId) {
  privateRoot = await safeRoot(privateRoot);
  if (!/^[a-f0-9]{16}$/.test(scopeId)) throw new Error('Invalid runtime scope');
  const name = `runtime-${scopeId}.lock`;
  const path = join(privateRoot, name);
  for (let attempt = 0; attempt < 3; attempt++) {
    let handle;
    try {
      handle = await open(path, 'wx', 0o600);
      await handle.writeFile(`${process.pid}\n`);
      return async () => {
        await handle.close();
        await unlink(path);
      };
    } catch (error) {
      await handle?.close();
      if (error.code !== 'EEXIST') throw error;
      const file = await readSafe(privateRoot, name);
      if (!file.exists) continue;
      const pid = Number(file.text.trim());
      if (!Number.isInteger(pid) || pid <= 0)
        throw new ApiError('Runtime lease needs reconciliation', 409);
      try {
        process.kill(pid, 0);
      } catch (reason) {
        if (reason.code === 'ESRCH') {
          await unlink(path);
          continue;
        }
        throw reason;
      }
      throw new ApiError('Another process owns this workspace; stop it before migration', 409);
    }
  }
  throw new ApiError('Workspace lease is busy', 409);
}
export async function requireFreePort(port) {
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(1500);
    socket.once('connect', () => {
      socket.destroy();
      reject(new ApiError('Demo port is already in use; stop its owner before migration', 409));
    });
    socket.once('error', (error) => {
      socket.destroy();
      if (error.code === 'ECONNREFUSED') resolve();
      else reject(error);
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new ApiError('Cannot establish the offline write barrier', 409));
    });
  });
}
