import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { ApiError, MAX_FILE_BYTES } from './config.js';
import { isRagRecordPath } from './record-paths.js';

export function allowedVaultPath(value) {
  return (
    typeof value === 'string' &&
    (value === 'Inbox.md' ||
      value === 'Tasks.md' ||
      value === 'Weekly-review.md' ||
      /^Projects\/[a-zA-Z0-9][a-zA-Z0-9_-]*\.md$/.test(value) ||
      isRagRecordPath(value))
  );
}
export async function safeRoot(value) {
  if (typeof value !== 'string' || !value) throw new ApiError('Workspace is not configured', 503);
  try {
    const stat = await lstat(value);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe root');
    return await realpath(value);
  } catch {
    throw new ApiError('Workspace directory is unavailable or unsafe', 503);
  }
}
export async function safePath(root, name, { allowMissing = true } = {}) {
  if (
    typeof name !== 'string' ||
    !name ||
    name.includes('\\') ||
    name.split('/').some((part) => !part || part.startsWith('.'))
  )
    throw new ApiError('Invalid file path');
  const target = resolve(root, name);
  const rel = relative(root, target);
  if (rel.startsWith(`..${sep}`) || rel === '..' || rel === '' || rel.startsWith(sep))
    throw new ApiError('Invalid file path');
  let current = root;
  try {
    const rootStat = await lstat(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory() || (await realpath(root)) !== root)
      throw new ApiError('Unsafe workspace path', 409);
    const parts = name.split('/');
    for (let i = 0; i < parts.length; i++) {
      current = join(current, parts[i]);
      try {
        const stat = await lstat(current);
        if (stat.isSymbolicLink() || (i < parts.length - 1 ? !stat.isDirectory() : !stat.isFile()))
          throw new ApiError('Unsafe workspace path', 409);
        if (i === parts.length - 1 && stat.nlink > 1)
          throw new ApiError('Linked files are not supported', 409);
      } catch (error) {
        if (allowMissing && error.code === 'ENOENT' && i === parts.length - 1) return target;
        throw error;
      }
    }
    return target;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('Workspace file is unavailable', 409);
  }
}
export async function readSafe(root, name) {
  const path = await safePath(root, name);
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink > 1 || stat.size > MAX_FILE_BYTES)
      throw new ApiError('Workspace file is unsafe or too large', 413);
    // Limit the read even if another process grows the file after stat.
    const buffer = Buffer.alloc(MAX_FILE_BYTES + 1);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    if (bytesRead > MAX_FILE_BYTES) throw new ApiError('Workspace file is too large', 413);
    await safePath(root, name, { allowMissing: false });
    return { exists: true, text: buffer.subarray(0, bytesRead).toString('utf8') };
  } catch (error) {
    if (error.code === 'ENOENT') return { exists: false, text: '' };
    if (error instanceof ApiError) throw error;
    throw new ApiError('Workspace file could not be read', 409);
  } finally {
    await handle?.close();
  }
}
