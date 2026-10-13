import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { safeRoot } from '../lib/safe-path.js';
import { atomicWrite } from '../lib/writer.js';
import { createMcpDispatcher, createMcpRuntime, MCP_FRAME_BYTES, runStdio } from '../mcp-server.js';

const request = (id, method, params) => ({
  jsonrpc: '2.0',
  id,
  method,
  ...(params ? { params } : {}),
});
const initialize = (version = '2025-03-26') =>
  request(1, 'initialize', {
    protocolVersion: version,
    capabilities: {},
    clientInfo: { name: 'test', version: '1' },
  });
const notify = { jsonrpc: '2.0', method: 'notifications/initialized' };
const call = (name, args = {}) => request(3, 'tools/call', { name, arguments: args });
const content = (response) => JSON.parse(response.result.content[0].text);
async function ready(dispatch, version) {
  await dispatch(initialize(version));
  await dispatch(notify);
  return dispatch;
}
function fixtureDispatcher(callbacks = {}) {
  return createMcpDispatcher({
    getWorkspace: async () => ({
      mode: 'demo',
      writable: true,
      projects: [
        { id: 'selected', path: 'Projects/selected.md', body: 'SELECTED' },
        { id: 'hidden', path: 'Projects/hidden.md', body: 'DO NOT RETURN' },
      ],
      tasks: [{ text: 'Task' }],
      review: { text: 'Review' },
      inbox: { text: 'Inbox' },
      recentActions: ['PRIVATE'],
      graph: {
        nodes: [{ id: 'Projects/selected.md' }, { id: 'Projects/hidden.md' }, { id: 'Tasks.md' }],
        edges: [{ source: 'Projects/selected.md', target: 'Projects/hidden.md' }],
      },
    }),
    getVaults: async () => ({
      vaults: [
        {
          id: 'main',
          title: 'Main Vault',
          configured: true,
          projects: [{ id: 'selected', body: 'DO NOT RETURN', title: 'Selected' }],
        },
      ],
    }),
    prepareContext: async (selection) => ({
      contextId: 'PROCESS-LOCAL',
      expiresAt: 100,
      text: JSON.stringify(selection),
    }),
    ...callbacks,
  });
}

test('lifecycle negotiates supported legacy versions and advertises only read-only tools', async () => {
  const dispatch = fixtureDispatcher();
  assert.deepEqual((await dispatch(request(0, 'ping'))).result, {});
  assert.equal((await dispatch(request(0, 'tools/list'))).error.code, -32002);
  assert.equal((await dispatch(initialize('future'))).result.protocolVersion, '2025-03-26');
  assert.equal((await dispatch(initialize())).error.code, -32600);
  assert.equal(await dispatch(notify), null);
  const listed = (await dispatch(request(2, 'tools/list'))).result.tools;
  assert.deepEqual(
    listed.map((tool) => tool.name),
    ['workspace_snapshot', 'vault_catalog', 'prepare_agent_context']
  );
  for (const tool of listed) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.inputSchema.additionalProperties, false);
  }
  const old = fixtureDispatcher();
  assert.equal((await old(initialize('2024-11-05'))).result.protocolVersion, '2024-11-05');
});

test('workspace selection excludes unselected project bodies, optional notes and graph edges', async () => {
  const dispatch = await ready(fixtureDispatcher());
  const empty = content(await dispatch(call('workspace_snapshot')));
  assert.deepEqual(empty.projects, []);
  assert.deepEqual(empty.tasks, []);
  assert.equal(empty.review, null);
  const selected = content(
    await dispatch(call('workspace_snapshot', { projectIds: ['selected'], includeTasks: true }))
  );
  assert.equal(selected.writable, false);
  assert.equal(selected.projects[0].body, 'SELECTED');
  assert.equal(selected.tasks[0].text, 'Task');
  assert.equal(selected.inbox, null);
  assert.deepEqual(selected.graph.edges, []);
  assert.equal(JSON.stringify(selected).includes('DO NOT RETURN'), false);
  assert.equal('recentActions' in selected, false);
  assert.equal(
    (await dispatch(call('workspace_snapshot', { projectIds: ['missing'] }))).result.isError,
    true
  );
});

test('catalog exposes only metadata and context uses validated explicit scope', async () => {
  let received;
  const dispatch = await ready(
    fixtureDispatcher({
      prepareContext: async (selection) => {
        received = selection;
        return { text: 'selected notes', contextId: 'hidden' };
      },
    })
  );
  assert.equal(
    JSON.stringify(content(await dispatch(call('vault_catalog')))).includes('DO NOT RETURN'),
    false
  );
  assert.deepEqual(content(await dispatch(call('vault_catalog', { vaults: [] }))), { vaults: [] });
  const selected = {
    projectIds: ['selected'],
    query: '  garden  ',
    vaultProjects: [{ vault: 'self', id: 'model' }],
  };
  const prepared = content(await dispatch(call('prepare_agent_context', selected)));
  assert.equal(prepared.text, 'selected notes');
  assert.equal('contextId' in prepared, false);
  assert.equal(received.query, 'garden');
  assert.equal(received.includeTasks, false);
  assert.deepEqual(received.vaultProjects, selected.vaultProjects);
});

test('unknown methods, mutation tools, roots, duplicate selections and malformed requests fail closed', async () => {
  let calls = 0;
  const dispatch = await ready(
    fixtureDispatcher({
      prepareContext: async () => {
        calls++;
      },
    })
  );
  assert.equal((await dispatch(request(5, 'resources/read'))).error.code, -32601);
  assert.equal((await dispatch(call('write_note'))).error.code, -32602);
  assert.equal((await dispatch(call('__proto__'))).error.code, -32602);
  for (const args of [
    { root: '/private' },
    { projectIds: ['../private'] },
    { projectIds: ['a', 'a'] },
    { query: 'a'.repeat(501) },
    { vaultProjects: [{ vault: 'main', id: 'a' }] },
    {
      vaultProjects: [
        { vault: 'ai', id: 'a' },
        { vault: 'ai', id: 'a' },
      ],
    },
  ])
    assert.equal((await dispatch(call('prepare_agent_context', args))).error.code, -32602);
  assert.equal(calls, 0);
  assert.equal((await dispatch({ jsonrpc: '2.0', id: null, method: 'ping' })).error.code, -32600);
  assert.equal(await dispatch({ jsonrpc: '2.0', method: 'unknown' }), null);
  const failed = await ready(
    fixtureDispatcher({
      getWorkspace: async () => {
        throw new Error('/sensitive/secret: TOKEN');
      },
    })
  );
  const response = await failed(call('workspace_snapshot'));
  assert.equal(response.result.isError, true);
  assert.equal(JSON.stringify(response).includes('TOKEN'), false);
});

async function exchange(chunks, dispatch = fixtureDispatcher()) {
  const input = new PassThrough();
  const output = new PassThrough();
  const received = [];
  output.on('data', (chunk) => received.push(chunk));
  const pending = runStdio({ input, output, dispatch });
  for (const chunk of chunks) input.write(chunk);
  input.end();
  await pending;
  return Buffer.concat(received)
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

test('stdio preserves UTF8 and frames, suppresses notifications, supports legacy batches', async () => {
  const wire = [
    initialize(),
    notify,
    request('привет', 'ping'),
    [request(4, 'ping'), { jsonrpc: '2.0', method: 'notifications/cancelled' }],
  ]
    .map((item) => `${JSON.stringify(item)}\n`)
    .join('');
  const bytes = Buffer.from(wire);
  const split = bytes.indexOf(Buffer.from('привет')) + 1;
  const frames = await exchange([bytes.subarray(0, split), bytes.subarray(split)]);
  assert.equal(frames.length, 3);
  assert.equal(frames[1].id, 'привет');
  assert.equal(frames[2][0].id, 4);
  assert.equal((await exchange([`${JSON.stringify([initialize()])}\n`]))[0].error.code, -32600);
});

test('transport safely rejects parse errors, unterminated and oversized input and oversized output', async () => {
  assert.equal((await exchange(['{oops}\n']))[0].error.code, -32700);
  assert.equal((await exchange(['{}']))[0].error.code, -32700);
  assert.equal((await exchange([Buffer.from([0x22, 0xff, 0x22, 10])]))[0].error.code, -32700);
  const old = await ready(fixtureDispatcher(), '2024-11-05');
  assert.equal((await old([request(4, 'ping')])).error.code, -32600);
  assert.equal((await exchange(['x'.repeat(MCP_FRAME_BYTES + 1)]))[0].error.code, -32600);
  const dispatch = await ready(
    fixtureDispatcher({ prepareContext: async () => ({ text: 'x'.repeat(MCP_FRAME_BYTES) }) })
  );
  assert.equal((await dispatch(call('prepare_agent_context'))).result.isError, true);
});

async function diskSnapshot(root) {
  const snapshot = [];
  async function walk(path, relative = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      const name = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(full, name);
      else {
        const stat = await lstat(full);
        snapshot.push([
          name,
          stat.mtimeMs,
          stat.size,
          createHash('sha256')
            .update(await readFile(full))
            .digest('hex'),
        ]);
      }
    }
  }
  await walk(root);
  return snapshot;
}

test('real shared adapters retrieve only selected sources with citations and perform no network or disk writes', async (t) => {
  const root = await safeRoot(await mkdtemp(join(tmpdir(), 'personal-os-mcp-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'Projects'));
  await atomicWrite(join(root, 'Projects/selected.md'), '# Garden\nGarden seeds and soil.');
  await atomicWrite(join(root, 'Projects/hidden.md'), '# Garden\nSECRET UNSELECTED garden.');
  await atomicWrite(join(root, 'Tasks.md'), '# Next\n- [ ] Read seed instructions');
  await atomicWrite(join(root, 'Weekly-review.md'), '# Review\nSECRET REVIEW');
  await atomicWrite(join(root, 'unscoped.md'), 'SECRET OUTSIDE SCOPE');
  const before = await diskSnapshot(root);
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Unexpected network');
  };
  t.after(() => {
    globalThis.fetch = savedFetch;
  });
  const dispatch = await ready(await createMcpRuntime({ mainRoot: root }));
  const prepared = content(
    await dispatch(call('prepare_agent_context', { projectIds: ['selected'], query: 'garden' }))
  );
  const preview = JSON.parse(prepared.text);
  assert.equal(preview.notes.length, 1);
  assert.equal(preview.notes[0].path, 'Projects/selected.md');
  assert.ok(preview.notes[0].startLine >= 1);
  assert.equal(JSON.stringify(prepared).includes('SECRET'), false);
  assert.equal(JSON.stringify(prepared).includes(root), false);
  assert.equal(prepared.retrieval.method, 'sqlite-fts5-bm25');
  const snapshot = content(
    await dispatch(call('workspace_snapshot', { projectIds: ['selected'] }))
  );
  assert.equal(snapshot.projects.length, 1);
  assert.equal(JSON.stringify(snapshot).includes('SECRET'), false);
  assert.deepEqual(await diskSnapshot(root), before);
});

test('same project IDs in separate model vaults remain explicitly scoped', async (t) => {
  const parent = await safeRoot(await mkdtemp(join(tmpdir(), 'personal-os-mcp-vaults-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  for (const name of ['main', 'self', 'ai']) {
    await mkdir(join(parent, name));
    await mkdir(join(parent, name, 'Projects'));
    await atomicWrite(
      join(parent, name, 'Projects/shared.md'),
      `# Garden\nGarden ${name} selected content`
    );
  }
  const before = await diskSnapshot(parent);
  const dispatch = await ready(
    await createMcpRuntime({
      mainRoot: join(parent, 'main'),
      selfRoot: join(parent, 'self'),
      aiRoot: join(parent, 'ai'),
    })
  );
  const preview = JSON.parse(
    content(
      await dispatch(
        call('prepare_agent_context', {
          vaultProjects: [{ vault: 'self', id: 'shared' }],
          query: 'garden',
        })
      )
    ).text
  );
  assert.equal(preview.notes.length, 1);
  assert.equal(preview.notes[0].vault, 'Person-self-model');
  assert.match(preview.notes[0].text, /self selected content/);
  assert.doesNotMatch(JSON.stringify(preview), /main selected content|ai selected content/);
  assert.deepEqual(await diskSnapshot(parent), before);
});

test('CLI is a standalone stdio subprocess and unsafe configured roots never leak paths', async (t) => {
  const parent = await safeRoot(await mkdtemp(join(tmpdir(), 'personal-os-mcp-cli-')));
  t.after(() => rm(parent, { recursive: true, force: true }));
  await mkdir(join(parent, 'root'));
  await mkdir(join(parent, 'root', 'Projects'));
  await symlink(join(parent, 'root'), join(parent, 'link'));
  await assert.rejects(createMcpRuntime({ mainRoot: join(parent, 'link') }));
  const child = execFile(process.execPath, ['mcp-server.js', '--root', join(parent, 'root')], {
    cwd: process.cwd(),
    env: { ...process.env, VAULT_PATH: '', PERSON_SELF_MODEL_PATH: '', AI_MODEL_PATH: '' },
  });
  child.stdin.end(
    `${JSON.stringify(initialize())}\n${JSON.stringify(notify)}\n${JSON.stringify(request(7, 'tools/list'))}\n`
  );
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
  await new Promise((accept, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? accept() : reject(new Error('CLI failed'))));
  });
  const frames = Buffer.concat(stdout)
    .toString()
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(frames.length, 2);
  assert.equal(frames[1].result.tools.length, 3);
  assert.equal(Buffer.concat(stderr).toString().includes(parent), false);
  assert.deepEqual(await readdir(join(parent, 'root')), ['Projects']);
});
