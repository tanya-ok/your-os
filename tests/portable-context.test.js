import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';

async function fixture(t, overrides = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'personal-os-portable-context-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const roots = Object.fromEntries(['main', 'self', 'ai'].map((id) => [id, join(root, id)]));
  for (const [id, vault] of Object.entries(roots)) {
    await mkdir(join(vault, 'Projects'), { recursive: true });
    await atomicWrite(
      join(vault, 'Projects/shared.md'),
      `---\ntitle: ${id} selected example\narea: career\nstatus: active\n---\n# ${id} selected example\nCompost ${id}-approved-example for the garden.\n`
    );
    await atomicWrite(
      join(vault, 'Projects/hidden.md'),
      `# Unselected example\nCompost compost compost synthetic-${id}-unselected-secret.\n`
    );
  }
  const inbox =
    '---\ntitle: Inbox\ncustom: keep-this-metadata\n---\n# Inbox\n\nAn existing observation: почва.\n';
  await atomicWrite(join(roots.main, 'Inbox.md'), inbox);
  await atomicWrite(
    join(roots.main, 'Tasks.md'),
    '# Tasks\n\n## Next\n- [ ] Compost synthetic-task-unselected-secret\n'
  );
  await atomicWrite(
    join(roots.main, 'Weekly-review.md'),
    '# Review\nCompost synthetic-review-unselected-secret\n'
  );
  const calls = [];
  const app = createApp({
    vaultRoot: roots.main,
    selfVaultRoot: roots.self,
    aiVaultRoot: roots.ai,
    profilePath: join(root, 'profile.json'),
    retrievalPath: join(root, 'retrieval.sqlite'),
    mode: 'demo',
    agentEnv: {},
    agentFetch: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ choices: [{ message: { content: 'A bounded suggestion.' } }] });
    },
    ...overrides,
  });
  async function request(path, body, method = body === undefined ? 'GET' : 'POST') {
    const response = await app.request(`http://localhost:3104${path}`, {
      method,
      headers: {
        origin: 'http://localhost:3104',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, json: await response.json() };
  }
  return { roots, inbox, request, calls };
}

const selected = {
  projectIds: ['shared'],
  includeTasks: false,
  includeReview: false,
  instruction: '',
  query: 'compost',
  vaultProjects: [
    { vault: 'self', id: 'shared' },
    { vault: 'ai', id: 'shared' },
  ],
};

async function enableAgent(request) {
  const profile = (await request('/api/profile')).json;
  const updated = await request('/api/profile', {
    profile: { ...profile, agent: { ...profile.agent, enabled: true } },
  });
  assert.equal(updated.status, 200);
}
function chat(contextId) {
  return {
    provider: 'local',
    model: 'synthetic-local',
    consent: true,
    contextId,
    messages: [{ role: 'user', content: 'Compare the approved observations.' }],
  };
}

test('inbox note append has a concrete preview, preserves metadata and existing prose, and undoes exactly', async (t) => {
  const { roots, inbox, request } = await fixture(t);
  const note = '## A useful observation\n\nPlants have no pager.\n- Keep the field note.';
  const preview = await request('/api/actions/preview', { type: 'note-append', text: note });
  assert.equal(preview.status, 200);
  assert.equal(preview.json.path, 'Inbox.md');
  assert.equal(preview.json.before, inbox);
  assert.equal(
    await readFile(join(roots.main, 'Inbox.md'), 'utf8'),
    inbox,
    'preview must not write'
  );
  assert.ok(preview.json.after.startsWith(inbox.trimEnd()));
  assert.ok(preview.json.after.includes(note));
  assert.match(preview.json.after, /## \d{4}-\d{2}-\d{2}T/);
  const applied = await request('/api/actions/apply', { previewId: preview.json.previewId });
  assert.equal(applied.status, 200);
  assert.equal(await readFile(join(roots.main, 'Inbox.md'), 'utf8'), preview.json.after);
  assert.equal(
    (await request('/api/actions/apply', { previewId: preview.json.previewId })).status,
    409,
    'a preview can apply only once'
  );
  assert.equal(
    (await request('/api/actions/undo', { actionId: applied.json.actionId })).status,
    200
  );
  assert.equal(await readFile(join(roots.main, 'Inbox.md'), 'utf8'), inbox);
});

test('inbox append refuses a stale preview and refuses undo after a later external edit', async (t) => {
  const { roots, inbox, request } = await fixture(t);
  const path = join(roots.main, 'Inbox.md');
  const preview = await request('/api/actions/preview', {
    type: 'note-append',
    text: 'An observation.',
  });
  const external = `${inbox}\nAn external change.\n`;
  await atomicWrite(path, external);
  assert.equal(
    (await request('/api/actions/apply', { previewId: preview.json.previewId })).status,
    409
  );
  assert.equal(await readFile(path, 'utf8'), external);
  const fresh = await request('/api/actions/preview', {
    type: 'note-append',
    text: 'A fresh observation.',
  });
  const applied = await request('/api/actions/apply', { previewId: fresh.json.previewId });
  assert.equal(applied.status, 200);
  const later = `${fresh.json.after}\nA later external observation.\n`;
  await atomicWrite(path, later);
  assert.equal(
    (await request('/api/actions/undo', { actionId: applied.json.actionId })).status,
    409
  );
  assert.equal(await readFile(path, 'utf8'), later);
});

test('inbox append cannot target another vault and respects read-only workspaces', async (t) => {
  const { roots, request } = await fixture(t);
  const before = await readFile(join(roots.self, 'Projects/shared.md'), 'utf8');
  assert.equal(
    (
      await request('/api/actions/preview', {
        type: 'note-append',
        text: 'Must not write',
        vault: 'self',
        path: 'Projects/shared.md',
      })
    ).status,
    400
  );
  assert.equal(await readFile(join(roots.self, 'Projects/shared.md'), 'utf8'), before);
  const readOnly = await fixture(t, { writable: false });
  assert.equal(
    (
      await readOnly.request('/api/actions/preview', {
        type: 'note-append',
        text: 'Must not write',
      })
    ).status,
    403
  );
});

test('cross-vault RAG labels selected snippets with source lines and isolates same-path notes and unselected data', async (t) => {
  const { request, calls, roots } = await fixture(t);
  const context = await request('/api/agent/context', selected);
  assert.equal(context.status, 200);
  assert.equal(context.json.retrieval.method, 'sqlite-fts5-bm25');
  const parsed = JSON.parse(context.json.text);
  assert.deepEqual(
    parsed.notes.map((note) => note.vault).sort(),
    ['Main Vault', 'Person-self-model', 'AI-Model'].sort()
  );
  assert.equal(
    parsed.notes.length,
    3,
    'same relative paths from different selected vaults stay distinct'
  );
  const labelToId = { 'Main Vault': 'main', 'Person-self-model': 'self', 'AI-Model': 'ai' };
  for (const note of parsed.notes) {
    assert.equal(note.path, 'Projects/shared.md');
    assert.ok(Number.isInteger(note.startLine) && note.startLine > 0);
    assert.ok(Number.isInteger(note.endLine) && note.endLine >= note.startLine);
    assert.ok(note.text.includes(`${labelToId[note.vault]}-approved-example`));
    const actual = (await readFile(join(roots[labelToId[note.vault]], note.path), 'utf8'))
      .split('\n')
      .slice(note.startLine - 1, note.endLine)
      .join('\n');
    assert.equal(
      note.text.trimEnd(),
      actual.trimEnd(),
      'source line range matches the selected Markdown'
    );
    assert.ok(
      parsed.retrieval.sources.some(
        (source) =>
          source.vault === note.vault &&
          source.path === note.path &&
          source.startLine === note.startLine &&
          source.endLine === note.endLine
      )
    );
  }
  assert.equal(context.json.text.includes('unselected-secret'), false);
  assert.equal(calls.length, 0);
  const mainOnly = await request('/api/agent/context', { ...selected, vaultProjects: [] });
  const reduced = JSON.parse(mainOnly.json.text);
  assert.deepEqual(
    reduced.notes.map((note) => note.vault),
    ['Main Vault']
  );
  assert.equal(mainOnly.json.text.includes('self-approved-example'), false);
  assert.equal(mainOnly.json.text.includes('ai-approved-example'), false);
  assert.equal(mainOnly.json.text.includes('unselected-secret'), false);
});

for (const changedVault of ['self', 'ai']) {
  test(`changing a selected ${changedVault} model note rejects chat before fetch; a fresh preview sends only current approved data`, async (t) => {
    const { roots, request, calls } = await fixture(t);
    await enableAgent(request);
    const context = await request('/api/agent/context', selected);
    assert.equal(context.status, 200);
    await atomicWrite(
      join(roots[changedVault], 'Projects/shared.md'),
      `# Updated selected model\nCompost ${changedVault}-approved-current.\n`
    );
    const stale = await request('/api/agent/chat', chat(context.json.contextId));
    assert.equal(stale.status, 409);
    assert.match(stale.json.error, /Selected notes changed/);
    assert.equal(calls.length, 0, 'freshness rejection happens before contacting a provider');
    const fresh = await request('/api/agent/context', selected);
    assert.equal(fresh.status, 200);
    assert.ok(fresh.json.text.includes(`${changedVault}-approved-current`));
    assert.equal(fresh.json.text.includes(`${changedVault}-approved-example`), false);
    assert.equal(fresh.json.text.includes('unselected-secret'), false);
    assert.equal((await request('/api/agent/chat', chat(fresh.json.contextId))).status, 200);
    assert.equal(calls.length, 1);
    const sent = JSON.parse(calls[0].options.body);
    assert.ok(sent.messages[0].content.includes(`${changedVault}-approved-current`));
    assert.equal(sent.messages[0].content.includes('unselected-secret'), false);
  });
}
