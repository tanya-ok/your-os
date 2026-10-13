import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { safeRoot } from '../lib/safe-path.js';
import { readProjects } from '../lib/workspace.js';

test('distributed demo includes the synthetic Career example and configured area metadata', async () => {
  const root = await safeRoot(fileURLToPath(new URL('../demo/vault', import.meta.url)));
  const projects = await readProjects(root);
  assert.ok(projects.length >= 4);
  const career = projects.find((project) => project.id === 'career-roadmap');
  assert.equal(career?.area, 'career');
  assert.equal(career.status, 'active');
  assert.match(career.body, /fictional example/);
  assert.ok(
    projects.every((project) =>
      ['home', 'work', 'learning', 'career', 'future'].includes(project.area)
    )
  );
});
