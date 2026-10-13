import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicWrite } from '../lib/writer.js';

// Explicit source policy. Never recurse through runtime roots or copy Git metadata.
const topLevel = new Set([
  '.env.tpl',
  '.gitignore',
  '.node-version',
  '.nvmrc',
  'AGENTS.md',
  'LICENSE',
  'NOTICE',
  'README.md',
  'biome.json',
  'build.js',
  'mcp-server.js',
  'package.json',
  'pnpm-lock.yaml',
  'requirements-docs.txt',
  'server.js',
  'start-with-secrets.sh',
  'zensical.toml',
]);
const documents = new Set([
  'agent-workflows.md',
  'architecture.md',
  'demo-pages.md',
  'dependency-audit.md',
  'human-approval-design.md',
  'interview.md',
  'library-local-summary.md',
  'profile.example.json',
  'provenance.md',
  'storage-contract.md',
]);

export function publicationPath(path) {
  if (typeof path !== 'string' || path.includes('\\') || path.startsWith('/')) return false;
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return false;
  if (topLevel.has(path)) return true;
  if (/^\.github\/workflows\/[a-z0-9-]+\.ya?ml$/.test(path)) return true;
  if (/^(lib|src|tests|scripts)\//.test(path)) return /\.(js|jsx|mjs|sh|swift)$/.test(path);
  if (/^(demo|templates)\//.test(path)) return path.endsWith('.md');
  if (/^prompts\//.test(path)) return path.endsWith('.md');
  if (path.startsWith('docs/site/')) {
    return (
      /\.(md|svg|css)$/.test(path) ||
      /^docs\/site\/assets\/screenshots\/(main|today|gtd|calendar|work|home|health|library|career|learning|future|agent|review|setup|library-detail|quick-capture)\.jpg$/.test(
        path
      )
    );
  }
  if (path === 'docs/articles/01-adaptive-lighting.md') return true;
  if (parts.length === 2 && parts[0] === 'docs') return documents.has(parts[1]);
  if (path.startsWith('static/')) {
    if (path === 'static/bundle.js' || path.endsWith('.map')) return false;
    return (
      /\.(css|html|svg)$/.test(path) ||
      /^static\/fonts\/(Manrope-Variable\.ttf|IBMPlexMono-Regular\.ttf|Manrope-OFL\.txt|IBMPlexMono-OFL\.txt|README\.md)$/.test(
        path
      )
    );
  }
  return false;
}

export async function copyPublicationFile(root, destination, path) {
  if (!publicationPath(path)) throw new Error(`Path is not in publication policy: ${path}`);
  // Reject links in both the file and its parents, even when a Git path is allowlisted.
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    if ((await lstat(current)).isSymbolicLink()) throw new Error(`Symbolic link refused: ${path}`);
  }
  const stat = await lstat(current);
  if (!stat.isFile()) throw new Error(`Not a regular file: ${path}`);
  const bytes = await readFile(current);
  const target = join(destination, path);
  await mkdir(dirname(target), { recursive: true });
  // The vault writer intentionally refuses dotfiles. Keep that restriction intact;
  // stage an atomic source copy in this fresh output directory before renaming it.
  const staged = join(dirname(target), `publication-copy-${randomUUID()}`);
  try {
    await atomicWrite(staged, bytes);
    await chmod(staged, stat.mode & 0o777);
    await rename(staged, target);
  } finally {
    await rm(staged, { force: true });
  }
  return { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}

async function prepare() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const parent = join(root, 'private/publication');
  await mkdir(parent, { recursive: true });
  const destination = await mkdtemp(join(parent, 'source-'));
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    }
  )
    .split('\0')
    .filter(Boolean);
  const files = [];
  for (const path of [...new Set(paths)].sort()) {
    if (!publicationPath(path)) continue;
    try {
      files.push(await copyPublicationFile(root, destination, path));
    } catch (error) {
      // Deleted paths in an uncommitted source tree are intentionally absent.
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  await atomicWrite(
    `${destination}.manifest.json`,
    `${JSON.stringify(
      {
        sourceCommit: head,
        includesWorkingTreeChanges: true,
        preparedAt: new Date().toISOString(),
        gitHistoryIncluded: false,
        validation:
          'Not yet validated. No claim of publication readiness or complete secret detection.',
        files,
      },
      null,
      2
    )}\n`
  );
  process.stdout.write(
    `${destination}\n${files.length} allowlisted source files copied. No Git history initialized.\n`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await prepare();
