import assert from 'node:assert/strict';
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import yaml from 'js-yaml';
import { createActions } from '../lib/actions.js';
import {
  createProfileStore,
  defaultAreas,
  defaultProfile,
  validateProfile,
} from '../lib/profile.js';
import { readProjects, workspace } from '../lib/workspace.js';
import { atomicWrite } from '../lib/writer.js';

async function fixture(t, projects = false) {
  const temporary = await mkdtemp(join(tmpdir(), 'universal-workspace-'));
  const root = await realpath(temporary);
  t.after(() => rm(root, { recursive: true, force: true }));
  if (projects) await mkdir(join(root, 'Projects'));
  return { root, actions: createActions({ root, writable: true }) };
}
const create = {
  type: 'project-create',
  id: 'roadmap',
  title: 'A career roadmap',
  area: 'career',
  body: '# Practice\n\nChoose one useful skill.\n',
};

test('old profiles migrate areas while preserving preferences; booleans support agent opt-in', async (t) => {
  const { root } = await fixture(t);
  const old = defaultProfile();
  delete old.areas;
  old.firstOutcome = 'Learn a useful skill';
  old.locale = 'ru';
  old.lighting.manualPhase = 'night';
  await atomicWrite(join(root, 'profile.json'), JSON.stringify(old));
  const store = createProfileStore(join(root, 'profile.json'));
  const migrated = await store.read();
  assert.deepEqual(migrated.areas, defaultAreas());
  assert.equal(migrated.firstOutcome, old.firstOutcome);
  assert.equal(migrated.locale, 'ru');
  assert.equal(migrated.lighting.manualPhase, 'night');
  const saved = await store.update({ agent: { enabled: true, persistTranscript: false } });
  assert.deepEqual(saved.agent, { enabled: true, persistTranscript: false });
  assert.equal((await store.read()).agent.enabled, true);
  await assert.rejects(store.update({ agent: { persistTranscript: true } }), /Invalid profile/);
});

test('areas accept unicode labels, bounded unique slugs, and reject unknown fields', async () => {
  const valid = validateProfile({
    ...defaultProfile(),
    areas: [{ id: 'research-1', title: 'Исследования' }],
  });
  assert.equal(valid.areas[0].title, 'Исследования');
  for (const areas of [
    [],
    [{ id: '../bad', title: 'bad' }],
    [{ id: 'Work', title: 'Uppercase duplicate' }],
    [{ id: 'a'.repeat(65), title: 'bad' }],
    [{ id: 'ok', title: 'x'.repeat(81) }],
    [{ id: 'ok', title: 'x', extra: true }],
    [
      { id: 'ok', title: 'First' },
      { id: 'ok', title: 'Again' },
    ],
    Array.from({ length: 101 }, (_, i) => ({ id: `area-${i}`, title: 'Area' })),
  ]) {
    assert.throws(() => validateProfile({ ...defaultProfile(), areas }), /Invalid profile/);
  }
});

test('project create stays read-only until apply, creates only Projects, and undo restores absence', async (t) => {
  const { root, actions } = await fixture(t);
  const preview = await actions.preview(create);
  assert.equal(preview.path, 'Projects/roadmap.md');
  assert.equal(preview.before, '');
  await assert.rejects(lstat(join(root, 'Projects')), (error) => error.code === 'ENOENT');
  const action = await actions.apply({ previewId: preview.previewId });
  const projects = await readProjects(root);
  assert.equal(projects[0].title, create.title);
  assert.equal(projects[0].area, 'career');
  assert.equal(projects[0].status, 'active');
  assert.equal(projects[0].body, create.body);
  await assert.rejects(actions.preview(create), /already exists/);
  await actions.undo({ actionId: action.actionId });
  assert.deepEqual(await readProjects(root), []);
  await assert.rejects(
    readFile(join(root, 'Projects/roadmap.md')),
    (error) => error.code === 'ENOENT'
  );
});

test('project update/archive/restore preserves unknown YAML and exact undo snapshot', async (t) => {
  const { root, actions } = await fixture(t, true);
  const original =
    '---\r\n# Keep this editorial comment\r\ntitle: >\r\n  A previous\r\n  title\r\nstatus: active\r\narea: work\r\ncustom:\r\n  owner: fictional\r\n  tags: [one, two]\r\n# Keep this footer\r\n---\r\nOld body\r\n';
  await atomicWrite(join(root, 'Projects/roadmap.md'), original);
  const preview = await actions.preview({ ...create, type: 'project-update', status: 'archived' });
  assert.ok(preview.after.includes('# Keep this editorial comment\r\n'));
  assert.ok(
    preview.after.includes(
      'custom:\r\n  owner: fictional\r\n  tags: [one, two]\r\n# Keep this footer'
    )
  );
  const metadata = yaml.load(preview.after.match(/^---\r\n([\s\S]*?)\r\n---/)[1]);
  assert.deepEqual(metadata.custom, { owner: 'fictional', tags: ['one', 'two'] });
  assert.equal(metadata.title, create.title);
  const applied = await actions.apply({ previewId: preview.previewId });
  assert.equal((await readProjects(root))[0].status, 'archived');
  await actions.undo({ actionId: applied.actionId });
  assert.equal(await readFile(join(root, 'Projects/roadmap.md'), 'utf8'), original);
  const restore = await actions.preview({ ...create, type: 'project-update', status: 'active' });
  await actions.apply({ previewId: restore.previewId });
  assert.equal((await readProjects(root))[0].status, 'active');
});

test('stale project apply/undo and concurrent create never overwrite later edits', async (t) => {
  const { root, actions } = await fixture(t, true);
  const first = await actions.preview(create);
  const second = await actions.preview(create);
  const results = await Promise.allSettled([
    actions.apply({ previewId: first.previewId }),
    actions.apply({ previewId: second.previewId }),
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
  const action = results.find((result) => result.status === 'fulfilled').value;
  await atomicWrite(join(root, 'Projects/roadmap.md'), 'External edit');
  await assert.rejects(actions.undo({ actionId: action.actionId }), /File changed/);
  assert.equal(await readFile(join(root, 'Projects/roadmap.md'), 'utf8'), 'External edit');
  const update = await actions.preview({ ...create, type: 'project-update', status: 'paused' });
  await atomicWrite(join(root, 'Projects/roadmap.md'), 'Another external edit');
  await assert.rejects(actions.apply({ previewId: update.previewId }), /File changed/);
});

test('project creation rejects bad paths/empty titles/oversized bodies and unknown or removed areas', async (t) => {
  const { root } = await fixture(t);
  let areas = defaultAreas();
  const actions = createActions({ root, writable: true, getAreas: async () => areas });
  for (const patch of [
    { id: '' },
    { id: '../escape' },
    { id: 'nested/name' },
    { id: '.hidden' },
    { id: 'a'.repeat(65) },
    { title: ' ' },
    { title: 'x'.repeat(81) },
    { area: 'missing' },
    { body: 'x'.repeat(12001) },
    { body: 'bad\u0000data' },
  ]) {
    await assert.rejects(actions.preview({ ...create, ...patch }));
  }
  const preview = await actions.preview(create);
  areas = areas.filter((area) => area.id !== 'career');
  await assert.rejects(actions.apply({ previewId: preview.previewId }), /area changed/);
  await assert.rejects(lstat(join(root, 'Projects')), (error) => error.code === 'ENOENT');
  const readonly = createActions({ root, writable: false });
  await assert.rejects(readonly.preview(create), /read-only/);
  await assert.rejects(
    actions.preview({ ...create, type: 'project-update', status: 'active', area: 'home' }),
    /not found/
  );
});

test('symlink Projects root or project file is refused before any outside content changes', async (t) => {
  const { root, actions } = await fixture(t);
  const outside = join(root, 'outside');
  await mkdir(outside);
  await atomicWrite(join(outside, 'roadmap.md'), 'Synthetic outside content');
  const preview = await actions.preview(create);
  await symlink(outside, join(root, 'Projects'));
  await assert.rejects(actions.apply({ previewId: preview.previewId }), /Unsafe workspace path/);
  await assert.rejects(actions.preview(create), /Unsafe workspace path/);
  assert.equal(await readFile(join(outside, 'roadmap.md'), 'utf8'), 'Synthetic outside content');
  await rm(join(root, 'Projects'));
  await mkdir(join(root, 'Projects'));
  await symlink(join(outside, 'roadmap.md'), join(root, 'Projects/roadmap.md'));
  await assert.rejects(
    actions.preview({ ...create, type: 'project-update', status: 'active' }),
    /Unsafe workspace path/
  );
});

test('profile area deletion refuses assigned projects, including archived, until they move', async (t) => {
  const { root, actions } = await fixture(t);
  const store = createProfileStore(join(root, 'profile.json'), {
    getProjects: () => readProjects(root),
  });
  const created = await actions.preview(create);
  await actions.apply({ previewId: created.previewId });
  const areas = defaultAreas().filter((area) => area.id !== 'career');
  await assert.rejects(store.update({ areas }), /Move projects/);
  const archive = await actions.preview({ ...create, type: 'project-update', status: 'archived' });
  await actions.apply({ previewId: archive.previewId });
  await assert.rejects(store.update({ areas }), /Move projects/);
  const move = await actions.preview({
    ...create,
    type: 'project-update',
    area: 'learning',
    status: 'active',
  });
  await actions.apply({ previewId: move.previewId });
  assert.deepEqual((await store.update({ areas })).areas, areas);
});

test('workspace returns configured areas, project bodies and only known scoped graph links', async (t) => {
  const { root, actions } = await fixture(t);
  const created = await actions.preview({
    ...create,
    body: '[[Tasks]] [[Tasks|duplicate]] [[Weekly-review#Notice]] [[../outside]] [[Unknown]]\n',
  });
  await actions.apply({ previewId: created.previewId });
  await atomicWrite(
    join(root, 'Tasks.md'),
    '## Next\n- [ ] Practice [[Projects/roadmap]]\n\n[[Projects/roadmap.md|again]]\n'
  );
  await atomicWrite(join(root, 'Weekly-review.md'), '# Review\n[[Projects/roadmap]] [[Tasks]]\n');
  await atomicWrite(join(root, 'outside.md'), '[[Projects/roadmap]]');
  await mkdir(join(root, 'Unscoped'));
  await atomicWrite(join(root, 'Unscoped/hidden.md'), 'Do not scan this synthetic note');
  const areas = [
    { id: 'career', title: 'Карьера' },
    { id: 'work', title: 'Work' },
  ];
  const result = await workspace(root, 'demo', true, [], areas);
  assert.deepEqual(result.areas, areas);
  assert.equal(result.projects[0].area, 'career');
  assert.equal(result.tasks[0].projectId, 'roadmap');
  assert.equal(result.graph.nodes.length, 3);
  assert.equal(result.graph.edges.length, 3);
  assert.deepEqual(
    new Set(result.graph.nodes.map((node) => node.id)),
    new Set(['Projects/roadmap.md', 'Tasks.md', 'Weekly-review.md'])
  );
  assert.equal(result.graph.nodes.find((node) => node.type === 'project').projectId, 'roadmap');
  for (const edge of result.graph.edges) assert.ok(edge.source < edge.target);
  assert.equal(JSON.stringify(result.graph).includes('outside'), false);
  assert.equal(JSON.stringify(result).includes(root), false);
});

test('malformed or unsupported project YAML fails safely without altering source', async (t) => {
  const { root, actions } = await fixture(t, true);
  for (const original of [
    '---\ntitle: [broken\n---\nBody',
    '---\n[one, two]\n---\nBody',
    '---\ntitle: &shared Old\ncustom: *shared\n---\nBody',
    '---\ntitle: incomplete\nBody',
  ]) {
    await atomicWrite(join(root, 'Projects/roadmap.md'), original);
    await assert.rejects(
      actions.preview({ ...create, type: 'project-update', status: 'active' }),
      /metadata/
    );
    assert.equal(await readFile(join(root, 'Projects/roadmap.md'), 'utf8'), original);
  }
});

test('owned metadata inline comments and unrelated indented comments survive scalar edits', async (t) => {
  const { root, actions } = await fixture(t, true);
  const original =
    '---\ntitle: "An old # title"   # Keep title comment\n  # Keep indented editorial note\nstatus: active # Keep status comment\narea: \'work # literal value\'  # Keep area comment\ncustom: "untouched # custom" # Keep custom comment\n---\nOld body\n';
  await atomicWrite(join(root, 'Projects/roadmap.md'), original);
  const preview = await actions.preview({
    ...create,
    type: 'project-update',
    status: 'paused',
    title: 'New # title',
  });
  assert.ok(
    preview.after.includes(
      'title: "New # title"   # Keep title comment\n  # Keep indented editorial note\n'
    )
  );
  assert.ok(preview.after.includes('status: "paused" # Keep status comment\n'));
  assert.ok(preview.after.includes('area: "career"  # Keep area comment\n'));
  assert.ok(preview.after.includes('custom: "untouched # custom" # Keep custom comment\n'));
  const applied = await actions.apply({ previewId: preview.previewId });
  assert.equal((await readProjects(root))[0].title, 'New # title');
  await actions.undo({ actionId: applied.actionId });
  assert.equal(await readFile(join(root, 'Projects/roadmap.md'), 'utf8'), original);
});

test('uppercase area ids are rejected while existing uppercase project filenames remain editable', async (t) => {
  const { root, actions } = await fixture(t, true);
  await assert.rejects(actions.preview({ ...create, area: 'Career' }), /Invalid action/);
  await atomicWrite(
    join(root, 'Projects/UpperCase.md'),
    '---\ntitle: Existing project\nstatus: active\narea: work\n---\nBody\n'
  );
  const preview = await actions.preview({
    ...create,
    type: 'project-update',
    id: 'UpperCase',
    status: 'active',
  });
  await actions.apply({ previewId: preview.previewId });
  assert.equal((await readProjects(root))[0].id, 'UpperCase');
});

test('500th project is visible; a 501st create is denied both at preview and apply', async (t) => {
  const { root, actions } = await fixture(t, true);
  const body = '---\ntitle: Synthetic capacity fixture\nstatus: active\narea: work\n---\n';
  for (let batch = 0; batch < 499; batch += 32) {
    await Promise.all(
      Array.from({ length: Math.min(32, 499 - batch) }, (_, offset) =>
        atomicWrite(
          join(root, 'Projects', `project-${String(batch + offset).padStart(3, '0')}.md`),
          body
        )
      )
    );
  }
  // Unsafe/non-scoped entries must not hide valid projects or consume slots.
  await atomicWrite(join(root, 'outside.md'), 'Synthetic external fixture');
  await symlink(join(root, 'outside.md'), join(root, 'Projects/A-symlink.md'));
  await link(join(root, 'outside.md'), join(root, 'Projects/A-hardlink.md'));
  await atomicWrite(join(root, 'Projects/A-oversized.md'), 'x'.repeat(1024 * 1024 + 1));
  await atomicWrite(join(root, 'Projects/not a slug.md'), 'Ignored synthetic filename');
  await mkdir(join(root, 'Projects/Subfolder'));
  await atomicWrite(join(root, 'Projects/Subfolder/nested.md'), 'Ignored nested synthetic note');
  const finalPreview = await actions.preview({ ...create, id: 'Z-last-visible' });
  const excessPreview = await actions.preview({ ...create, id: 'Z-excess' });
  await actions.apply({ previewId: finalPreview.previewId });
  const projects = await readProjects(root);
  assert.equal(projects.length, 500);
  assert.ok(projects.some((project) => project.id === 'Z-last-visible'));
  await assert.rejects(actions.apply({ previewId: excessPreview.previewId }), /Project limit/);
  await assert.rejects(actions.preview({ ...create, id: 'Z-not-created' }), /Project limit/);
  await assert.rejects(
    lstat(join(root, 'Projects/Z-excess.md')),
    (error) => error.code === 'ENOENT'
  );
  await assert.rejects(
    lstat(join(root, 'Projects/Z-not-created.md')),
    (error) => error.code === 'ENOENT'
  );
});
