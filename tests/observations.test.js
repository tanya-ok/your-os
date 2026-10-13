import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAgent } from '../lib/agent.js';
import { createObservations, listEligibleClaims } from '../lib/observations.js';
import { recordHash } from '../lib/record-store.js';
import { createVaultCatalog } from '../lib/vaults.js';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';

async function fixture(t, { writable = true } = {}) {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'personal-os-observations-')));
  t.after(() => rm(base, { recursive: true, force: true }));
  const roots = {};
  for (const id of ['main', 'self', 'ai']) {
    roots[id] = join(base, id);
    await mkdir(join(roots[id], 'Projects'), { recursive: true });
  }
  await atomicWrite(
    join(roots.main, 'Projects', 'garden.md'),
    '---\ntitle: Garden\n---\n# Garden\nWalked slowly before work.\nFelt calmer afterwards.\n'
  );
  await atomicWrite(join(roots.ai, 'Projects', 'rules.md'), '# Rules\nAsk before writing.\n');
  const opsRoot = join(base, 'private', 'observation-ops');
  await mkdir(join(base, 'private'));
  // Storage lifecycle tests use an explicit synthetic authorizer, not a real passkey ceremony.
  const observations = createObservations({
    roots,
    opsRoot,
    writable,
    authorizeAcceptance: async (bindingHash) => ({
      method: 'webauthn',
      bindingHash,
      credentialHash: 'a'.repeat(64),
    }),
  });
  return { base, roots, opsRoot, observations };
}
const personClaim = {
  claim: 'A slow walk before work helps the day start calmer.',
  uncertainty: 'Two mornings only.',
  confidence: 'low',
  sources: [{ vault: 'main', path: 'Projects/garden.md', startLine: 5, endLine: 6 }],
};

test('a candidate stays out of RAG until a human accepts it', async (t) => {
  const { roots, observations } = await fixture(t);
  const created = await observations.create('self', personClaim);
  const file = await readFile(join(roots.self, created.path), 'utf8');
  assert.match(file, /status: 'candidate'/);
  assert.match(file, /rag: 'excluded'/);
  assert.match(file, /author_kind: 'human'/);
  assert.deepEqual(await listEligibleClaims(roots.self), []);

  const detail = await observations.get('self', created.id);
  assert.equal(detail.label, 'UNREVIEWED CANDIDATE');
  assert.equal(detail.sources[0].state, 'unchanged');
  assert.equal(detail.sources[0].excerpt, 'Walked slowly before work.\nFelt calmer afterwards.');

  const result = await observations.review('self', created.id, {
    decision: 'accept',
    expectedHash: detail.hash,
    wording: 'A slow morning walk tends to make the start of the day calmer.',
    note: 'Keep watching.',
  });
  assert.equal(result.status, 'accepted');
  const claims = await listEligibleClaims(roots.self);
  assert.equal(claims.length, 1);
  assert.equal(claims[0].id, result.claimId);
  const claim = await readFile(join(roots.self, 'Accepted', `${result.claimId}.md`), 'utf8');
  assert.match(claim, /rag: 'selected-only'/);
  assert.match(claim, /A slow morning walk tends/);
  assert.match(claim, new RegExp(`review_id: '${result.reviewId}'`));
  const review = await readFile(join(roots.self, 'Reviews', `${result.reviewId}.md`), 'utf8');
  assert.match(review, /reviewer: 'human'/);
  assert.match(review, /Keep watching\./);

  const after = await observations.get('self', created.id);
  assert.equal(after.status, 'accepted');
  assert.equal(after.outcome.claim_id, result.claimId);
  assert.equal(after.reviews.length, 1);
  await assert.rejects(
    observations.review('self', created.id, { decision: 'reject', expectedHash: after.hash }),
    /already decided/
  );
});

test('evidence rules: real sources only, person claims need non-agent evidence', async (t) => {
  const { observations } = await fixture(t);
  await assert.rejects(
    observations.create('self', {
      ...personClaim,
      sources: [{ vault: 'ai', path: 'Projects/rules.md' }],
    }),
    /source outside the AI-Model vault/
  );
  await assert.rejects(
    observations.create('self', { ...personClaim, sources: [] }),
    /Too small|at least|>=1|expected array to have >=1/i
  );
  await assert.rejects(
    observations.create('self', {
      ...personClaim,
      sources: [{ vault: 'main', path: 'Records/Agent/Sessions/x.md' }],
    }),
    /not candidates, settings or agent sessions/
  );
  await assert.rejects(
    observations.create('self', {
      ...personClaim,
      sources: [{ vault: 'main', path: 'Projects/garden.md', startLine: 90 }],
    }),
    /outside the note/
  );
  await assert.rejects(
    observations.create('self', { ...personClaim, claim: 'Text\n## Injected heading' }),
    /headings/
  );
  await assert.rejects(
    observations.create('self', personClaim, { authorKind: 'agent' }),
    /separately granted permission/
  );
  const agentClaim = await observations.create('ai', {
    claim: 'The agent asks before writing.',
    confidence: 'medium',
    sources: [{ vault: 'ai', path: 'Projects/rules.md' }],
  });
  assert.ok(agentClaim.id.startsWith('obs-'));
});

test('changed sources, stale reviews, deferral and rejection are explicit', async (t) => {
  const { roots, observations } = await fixture(t);
  const created = await observations.create('self', personClaim);
  const detail = await observations.get('self', created.id);
  await atomicWrite(join(roots.main, 'Projects', 'garden.md'), '# Garden\nRewritten.\n');
  const changed = await observations.get('self', created.id);
  assert.equal(changed.sources[0].state, 'changed');
  await assert.rejects(
    observations.review('self', created.id, { decision: 'accept', expectedHash: detail.hash }),
    /acknowledge/
  );
  await assert.rejects(
    observations.review('self', created.id, { decision: 'defer', expectedHash: detail.hash }),
    /next review date/
  );
  const deferred = await observations.review('self', created.id, {
    decision: 'defer',
    expectedHash: detail.hash,
    nextReview: '2030-01-15',
  });
  assert.equal(deferred.status, 'deferred');
  await assert.rejects(
    observations.review('self', created.id, { decision: 'reject', expectedHash: detail.hash }),
    /changed; reload/
  );
  const again = await observations.get('self', created.id);
  assert.equal(again.nextReview, '2030-01-15');
  const rejected = await observations.review('self', created.id, {
    decision: 'reject',
    expectedHash: again.hash,
  });
  assert.equal(rejected.claimId, null);
  assert.deepEqual(await listEligibleClaims(roots.self), []);
  const list = await observations.list('self');
  assert.equal(list.candidates[0].status, 'rejected');
  assert.equal((await observations.get('self', created.id)).reviews.length, 2);
});

test('a claim without its matching human review is never eligible', async (t) => {
  const { roots, observations } = await fixture(t);
  const created = await observations.create('self', personClaim);
  const detail = await observations.get('self', created.id);
  const { claimId, reviewId } = await observations.review('self', created.id, {
    decision: 'accept',
    expectedHash: detail.hash,
  });
  const reviewPath = join(roots.self, 'Reviews', `${reviewId}.md`);
  const original = await readFile(reviewPath, 'utf8');
  await writeFile(reviewPath, original.replace("reviewer: 'human'", "reviewer: 'agent'"));
  assert.deepEqual(await listEligibleClaims(roots.self), []);
  await rm(reviewPath);
  assert.deepEqual(await listEligibleClaims(roots.self), []);
  const listed = await observations.list('self');
  assert.deepEqual(listed.accepted, [{ id: claimId, eligible: false, claim: '' }]);
});

test('an interrupted review is completed from its manifest', async (t) => {
  const { roots, opsRoot, observations } = await fixture(t);
  const created = await observations.create('self', personClaim);
  const candidatePath = join(roots.self, '_inbox', `${created.id}.md`);
  const before = await readFile(candidatePath, 'utf8');
  const detail = await observations.get('self', created.id);
  const { claimId, reviewId } = await observations.review('self', created.id, {
    decision: 'accept',
    expectedHash: detail.hash,
  });
  const planned = [];
  for (const [kind, path] of [
    ['review', `Reviews/${reviewId}.md`],
    ['claim', `Accepted/${claimId}.md`],
    ['candidate', `_inbox/${created.id}.md`],
  ])
    planned.push({
      kind,
      path,
      text: await readFile(join(roots.self, path), 'utf8'),
      beforeHash: kind === 'candidate' ? recordHash(before) : null,
    });
  // State after a crash that wrote the review only: no claim, candidate unchanged.
  await rm(join(roots.self, 'Accepted', `${claimId}.md`));
  await atomicWrite(candidatePath, before);
  await atomicWrite(
    join(opsRoot, 'op-1.json'),
    JSON.stringify({ op: 'op-1', vault: 'self', candidate: created.id, files: planned })
  );
  assert.deepEqual(await listEligibleClaims(roots.self), []);
  const listed = await observations.list('self');
  assert.equal(listed.pendingOperations, 0);
  assert.deepEqual(await readdir(opsRoot), []);
  assert.equal((await listEligibleClaims(roots.self))[0].id, claimId);
  assert.equal((await observations.get('self', created.id)).status, 'accepted');
});

test('read-only model vaults refuse writes but still list', async (t) => {
  const { observations } = await fixture(t, { writable: false });
  await assert.rejects(observations.create('self', personClaim), /read only/);
  assert.equal((await observations.list('self')).writable, false);
  await assert.rejects(observations.list('main'), /Unknown model vault/);
});

test('only accepted claims can enter agent context, and the catalog lists them', async (t) => {
  const { base, roots, observations } = await fixture(t);
  const created = await observations.create('self', personClaim);
  const detail = await observations.get('self', created.id);
  const agent = createAgent({
    root: roots.main,
    env: {},
    databasePath: ':memory:',
    vaultRoots: { self: roots.self, ai: roots.ai },
  });
  const request = {
    projectIds: [],
    includeTasks: false,
    includeReview: false,
    instruction: '',
  };
  await assert.rejects(
    agent.context({ ...request, vaultClaims: [{ vault: 'self', id: created.id }] }),
    /Invalid|claim/
  );
  const { claimId } = await observations.review('self', created.id, {
    decision: 'accept',
    expectedHash: detail.hash,
  });
  const context = await agent.context({
    ...request,
    vaultClaims: [{ vault: 'self', id: claimId }],
  });
  assert.match(context.text, /A slow walk before work helps/);
  assert.doesNotMatch(context.text, /Two mornings only/);
  const { vaults } = await createVaultCatalog({
    mainRoot: roots.main,
    selfRoot: roots.self,
    aiRoot: roots.ai,
  }).list();
  assert.equal(vaults.find((v) => v.id === 'self').claims[0].id, claimId);
  assert.ok(base);
});

test('HTTP routes respect the separate model vault write permission', async (t) => {
  const { base, roots } = await fixture(t);
  const make = (modelVaultsWritable) =>
    createApp({
      vaultRoot: roots.main,
      profilePath: join(base, 'private', 'profile.json'),
      mode: 'vault',
      writable: false,
      selfVaultRoot: roots.self,
      aiVaultRoot: roots.ai,
      modelVaultsWritable,
      agentEnv: {},
    });
  const post = (app, path, body) =>
    app.request(`http://localhost${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: 'localhost' },
      body: JSON.stringify(body),
    });
  const closed = make(false);
  assert.equal((await post(closed, '/api/observations/self', personClaim)).status, 403);
  const open = make(true);
  const response = await post(open, '/api/observations/self', personClaim);
  assert.equal(response.status, 200);
  const { id } = await response.json();
  const listed = await (
    await open.request('http://localhost/api/observations/self', { headers: { host: 'localhost' } })
  ).json();
  assert.equal(listed.candidates[0].id, id);
  const status = await (
    await open.request('http://localhost/api/status', { headers: { host: 'localhost' } })
  ).json();
  assert.equal(status.modelVaultsWritable, true);
  assert.equal(status.writable, false);
});

// Findings from the independent review of 2026-10-09.

async function accepted(t, options) {
  const f = await fixture(t, options);
  const created = await f.observations.create('self', personClaim);
  const detail = await f.observations.get('self', created.id);
  const result = await f.observations.review('self', created.id, {
    decision: 'accept',
    expectedHash: detail.hash,
  });
  return { ...f, created, ...result };
}
function agentFor(roots, calls = []) {
  return createAgent({
    root: roots.main,
    env: {},
    databasePath: ':memory:',
    vaultRoots: { self: roots.self, ai: roots.ai },
    fetchImpl: async (...args) => {
      calls.push(args);
      return Response.json({ choices: [{ message: { content: 'ok' } }] });
    },
  });
}
const contextRequest = {
  projectIds: [],
  includeTasks: false,
  includeReview: false,
  instruction: '',
};
const chatRequest = (contextId) => ({
  provider: 'local',
  model: 'example-local',
  contextId,
  messages: [{ role: 'user', content: 'Help' }],
  consent: true,
});

test('finding 1: a claim whose review was removed after preview is not sent', async (t) => {
  const { roots, claimId, reviewId } = await accepted(t);
  const calls = [];
  const agent = agentFor(roots, calls);
  const context = await agent.context({
    ...contextRequest,
    vaultClaims: [{ vault: 'self', id: claimId }],
  });
  await rm(join(roots.self, 'Reviews', `${reviewId}.md`));
  await assert.rejects(agent.chat(chatRequest(context.contextId)), (e) => e.status === 409);
  assert.equal(calls.length, 0);
});

test('finding 2: an edited claim loses eligibility until it is reviewed again', async (t) => {
  const { roots, claimId } = await accepted(t);
  const path = join(roots.self, 'Accepted', `${claimId}.md`);
  const text = await readFile(path, 'utf8');
  await writeFile(path, text.replace('A slow walk before work', 'New wording never reviewed'));
  assert.deepEqual(await listEligibleClaims(roots.self), []);
});

test('finding 3: recovery never overwrites a candidate edited after the crash', async (t) => {
  const { roots, opsRoot, observations } = await fixture(t);
  const created = await observations.create('self', personClaim);
  const candidatePath = join(roots.self, '_inbox', `${created.id}.md`);
  const before = await readFile(candidatePath, 'utf8');
  const detail = await observations.get('self', created.id);
  const { reviewId } = await observations.review('self', created.id, {
    decision: 'reject',
    expectedHash: detail.hash,
  });
  const planned = await readFile(candidatePath, 'utf8');
  const review = await readFile(join(roots.self, 'Reviews', `${reviewId}.md`), 'utf8');
  const edited = `${before}\nMy own later note.\n`;
  await atomicWrite(candidatePath, edited);
  await atomicWrite(
    join(opsRoot, 'op-2.json'),
    JSON.stringify({
      op: 'op-2',
      vault: 'self',
      candidate: created.id,
      files: [
        { kind: 'review', path: `Reviews/${reviewId}.md`, text: review, beforeHash: null },
        {
          kind: 'candidate',
          path: `_inbox/${created.id}.md`,
          text: planned,
          beforeHash: detail.hash,
        },
      ],
    })
  );
  const listed = await observations.list('self');
  assert.equal(listed.pendingOperations, 1);
  assert.equal(await readFile(candidatePath, 'utf8'), edited);
});

test('finding 4: read-only listing reports pending operations without writing', async (t) => {
  const f = await fixture(t);
  const readOnly = createObservations({ roots: f.roots, opsRoot: f.opsRoot, writable: false });
  const created = await f.observations.create('self', personClaim);
  const detail = await f.observations.get('self', created.id);
  const planned = {
    kind: 'review',
    path: 'Reviews/review-20300101-aaaaaaaa.md',
    text: '---\nid: x\n---\n',
    beforeHash: null,
  };
  await mkdir(f.opsRoot, { recursive: true });
  await atomicWrite(
    join(f.opsRoot, 'op-3.json'),
    JSON.stringify({ op: 'op-3', vault: 'self', candidate: created.id, files: [planned] })
  );
  assert.equal((await readOnly.list('self')).pendingOperations, 1);
  await readOnly.get('self', created.id);
  await assert.rejects(readFile(join(f.roots.self, planned.path)));
  assert.deepEqual(await readdir(f.opsRoot), ['op-3.json']);
  assert.ok(detail.hash);
});

test('finding 5: a query works with an accepted claim selected', async (t) => {
  const { roots, claimId } = await accepted(t);
  const context = await agentFor(roots).context({
    ...contextRequest,
    query: 'slow walk',
    vaultClaims: [{ vault: 'self', id: claimId }],
  });
  assert.ok(context.retrieval.sources.some((s) => s.path === `Accepted/${claimId}.md`));
});

test('finding 6: a decision keeps sections the person added to the candidate', async (t) => {
  const { roots, observations } = await fixture(t);
  const created = await observations.create('self', personClaim);
  const path = join(roots.self, '_inbox', `${created.id}.md`);
  await atomicWrite(path, `${await readFile(path, 'utf8')}\n## Notes\n\nKeep this paragraph.\n`);
  const detail = await observations.get('self', created.id);
  await observations.review('self', created.id, {
    decision: 'defer',
    expectedHash: detail.hash,
    nextReview: '2030-02-01',
  });
  const after = await readFile(path, 'utf8');
  assert.match(after, /## Notes\n\nKeep this paragraph\./);
  assert.match(after, /status: 'deferred'/);
});

test('re-review finding 2: an accepted claim that lost eligibility can be reviewed again', async (t) => {
  const { roots, observations, created, claimId } = await accepted(t);
  const claimPath = join(roots.self, 'Accepted', `${claimId}.md`);
  await writeFile(
    claimPath,
    (await readFile(claimPath, 'utf8')).replace('A slow walk before work', 'Edited later')
  );
  const listed = await observations.list('self');
  const entry = listed.candidates.find((c) => c.id === created.id);
  assert.equal(entry.status, 'accepted');
  assert.equal(entry.needsReview, true);
  const detail = await observations.get('self', created.id);
  assert.equal(detail.needsReview, true);
  const again = await observations.review('self', created.id, {
    decision: 'accept',
    expectedHash: detail.hash,
    wording: 'Edited later, now reviewed.',
  });
  assert.notEqual(again.claimId, claimId);
  const eligible = await listEligibleClaims(roots.self);
  assert.deepEqual(
    eligible.map((c) => c.id),
    [again.claimId]
  );
  const after = await observations.get('self', created.id);
  assert.equal(after.needsReview, false);
  assert.equal(after.reviews.length, 2);
  await assert.rejects(
    observations.review('self', created.id, { decision: 'reject', expectedHash: after.hash }),
    /already decided/
  );
});

async function interruptedAcceptance(t, { legacy = false, completed = false } = {}) {
  const f = await fixture(t);
  const created = await f.observations.create('self', personClaim);
  const candidatePath = join(f.roots.self, created.path);
  const before = await readFile(candidatePath, 'utf8');
  const detail = await f.observations.get('self', created.id);
  const result = await f.observations.review('self', created.id, {
    decision: 'accept',
    expectedHash: detail.hash,
  });
  const files = [];
  for (const [kind, path] of [
    ['review', `Reviews/${result.reviewId}.md`],
    ['claim', `Accepted/${result.claimId}.md`],
    ['candidate', created.path],
  ]) {
    files.push({
      kind,
      path,
      text: await readFile(join(f.roots.self, path), 'utf8'),
      ...(!legacy ? { beforeHash: kind === 'candidate' ? recordHash(before) : null } : {}),
    });
  }
  if (!completed) {
    await rm(join(f.roots.self, files[1].path));
    await atomicWrite(candidatePath, before);
  }
  await atomicWrite(
    join(f.opsRoot, 'pending.json'),
    JSON.stringify({
      op: 'pending',
      vault: 'self',
      candidate: created.id,
      files,
    })
  );
  return { ...f, created, candidatePath, before, files, ...result };
}

test('legacy recovery checks all files before writing a missing claim', async (t) => {
  const f = await interruptedAcceptance(t, { legacy: true });
  const listed = await f.observations.list('self');
  assert.equal(listed.pendingOperations, 1);
  assert.match(listed.recoveryConflicts[0].message, /Legacy.*beforeHash/);
  await assert.rejects(readFile(join(f.roots.self, f.files[1].path)), { code: 'ENOENT' });
  assert.equal(await readFile(f.candidatePath, 'utf8'), f.before);
  assert.equal((await f.observations.list('self')).pendingOperations, 1);
  assert.deepEqual(await readdir(f.opsRoot), ['pending.json']);
});

test('fully applied legacy manifests can finish without rewriting files', async (t) => {
  const f = await interruptedAcceptance(t, { legacy: true, completed: true });
  const listed = await f.observations.list('self');
  assert.equal(listed.pendingOperations, 0);
  assert.deepEqual(listed.recoveryConflicts, []);
  assert.deepEqual(await readdir(f.opsRoot), []);
  for (const step of f.files)
    assert.equal(await readFile(join(f.roots.self, step.path), 'utf8'), step.text);
});

test('modern recovery validates a conflict before writing any missing claim', async (t) => {
  const f = await interruptedAcceptance(t);
  const changed = `${f.before}\nKeep this later edit.\n`;
  await atomicWrite(f.candidatePath, changed);
  assert.equal((await f.observations.list('self')).pendingOperations, 1);
  await assert.rejects(readFile(join(f.roots.self, f.files[1].path)), { code: 'ENOENT' });
  assert.equal(await readFile(f.candidatePath, 'utf8'), changed);
});

test('a legacy claim can be reviewed again without modifying its old records', async (t) => {
  const f = await accepted(t);
  const reviewPath = join(f.roots.self, `Reviews/${f.reviewId}.md`);
  const legacyReview = (await readFile(reviewPath, 'utf8')).replace(/^claim_hash:.*\n/m, '');
  await atomicWrite(reviewPath, legacyReview);
  const oldClaimPath = join(f.roots.self, `Accepted/${f.claimId}.md`);
  const oldClaim = await readFile(oldClaimPath, 'utf8');
  assert.deepEqual(await listEligibleClaims(f.roots.self), []);
  const detail = await f.observations.get('self', f.created.id);
  assert.equal(detail.needsReview, true);
  const result = await f.observations.review('self', f.created.id, {
    decision: 'accept',
    expectedHash: detail.hash,
    wording: 'A freshly reviewed observation.',
  });
  assert.deepEqual(
    (await listEligibleClaims(f.roots.self)).map((c) => c.id),
    [result.claimId]
  );
  assert.equal(await readFile(reviewPath, 'utf8'), legacyReview);
  assert.equal(await readFile(oldClaimPath, 'utf8'), oldClaim);
});
