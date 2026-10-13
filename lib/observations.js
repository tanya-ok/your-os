import { randomUUID } from 'node:crypto';
import { chmod, readdir, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import yaml from 'js-yaml';
import { z } from 'zod';
import { ApiError, localDateStr } from './config.js';
import { ensureRecordParent, parseRecordYaml, recordHash } from './record-store.js';
import { readSafe, safePath, safeRoot } from './safe-path.js';
import { atomicWrite } from './writer.js';

// Lifecycle: observation -> source -> human review -> accept (docs/storage-contract.md).
export const MODEL_VAULTS = Object.freeze({ self: 'person', ai: 'agent' });
const DIRECTORIES = Object.freeze({ candidate: '_inbox', claim: 'Accepted', review: 'Reviews' });
const ID = /^(obs|claim|review)-\d{8}-[0-9a-f]{8}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXCERPT_LINES = 40;
const EXCERPT_CHARS = 4000;
const NO_HEADINGS = (value) => !/^#{1,6}\s/m.test(value) && !/^---\s*$/m.test(value);
const text = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .refine(NO_HEADINGS, 'Remove Markdown headings and --- lines from the text');
const sourceSchema = z
  .strictObject({
    vault: z.enum(['main', 'self', 'ai']),
    path: z.string().max(240),
    startLine: z.number().int().min(1).optional(),
    endLine: z.number().int().min(1).optional(),
  })
  .refine(
    (s) => s.endLine === undefined || (s.startLine !== undefined && s.endLine >= s.startLine),
    {
      message: 'Line range is invalid',
    }
  );
const createSchema = z.strictObject({
  claim: text(2000).pipe(z.string().min(1)),
  uncertainty: text(2000).optional(),
  confidence: z.enum(['low', 'medium', 'high']),
  sources: z.array(sourceSchema).min(1).max(20),
});
const reviewSchema = z.strictObject({
  decision: z.enum(['accept', 'reject', 'defer']),
  expectedHash: z.string().regex(/^[0-9a-f]{64}$/),
  wording: text(2000).optional(),
  confidence: z.enum(['low', 'medium', 'high']).optional(),
  nextReview: z.string().regex(DATE).optional(),
  note: text(2000).optional(),
  acknowledgeSourceChanges: z.boolean().optional(),
});

function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApiError(result.error.issues[0]?.message || 'Invalid observation request');
  return result.data;
}
function newId(prefix, now) {
  return `${prefix}-${localDateStr(now).replaceAll('-', '')}-${randomUUID().slice(0, 8)}`;
}
function dump(value) {
  return yaml.dump(value, {
    schema: yaml.JSON_SCHEMA,
    noRefs: true,
    forceQuotes: true,
    quotingType: "'",
    lineWidth: 120,
    noCompatMode: true,
  });
}
function document(meta, title, sections) {
  const body = sections
    .filter(([, value]) => value)
    .map(([heading, value]) => `## ${heading}\n\n${value}\n`)
    .join('\n');
  return `---\n${dump(meta)}---\n# ${title}\n\n${body}`;
}
function decode(fileText) {
  const head = fileText.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!head) throw new ApiError('Invalid observation file', 409);
  const meta = parseRecordYaml(head[1]);
  if (!meta || typeof meta !== 'object' || !ID.test(meta.id || ''))
    throw new ApiError('Invalid observation file', 409);
  const body = fileText.slice(head[0].length);
  const section = (heading) => {
    const match = body.match(
      new RegExp(`^## ${heading}\\r?\\n([\\s\\S]*?)(?=^## |$(?![\\s\\S]))`, 'm')
    );
    return match ? match[1].trim() : '';
  };
  return {
    meta,
    claim: section('Claim'),
    uncertainty: section('Uncertainty'),
    note: section('Note'),
  };
}
const pathFor = (kind, id) => `${DIRECTORIES[kind]}/${id}.md`;
// A missing parent folder means the file does not exist yet, not an unsafe path.
async function readMaybe(root, path) {
  if (!(await ensureRecordParent(root, path, false))) return { exists: false, text: '' };
  return readSafe(root, path);
}

/** Sources are workspace Markdown; candidates, agent transcripts and settings never count. */
function sourceAllowed(path) {
  return (
    path.endsWith('.md') &&
    !path.startsWith(`${DIRECTORIES.candidate}/`) &&
    !path.startsWith('Records/Agent/') &&
    !path.startsWith('Settings/')
  );
}
function excerpt(fileText, source) {
  const lines = fileText.split('\n');
  const start = (source.startLine || 1) - 1;
  const end = Math.min(
    source.endLine || start + EXCERPT_LINES,
    start + EXCERPT_LINES,
    lines.length
  );
  return lines.slice(start, end).join('\n').slice(0, EXCERPT_CHARS);
}

export async function readEligibleClaim(root, id) {
  if (!ID.test(id) || !id.startsWith('claim-')) throw new ApiError('Unknown accepted claim', 404);
  root = await safeRoot(root);
  const file = await readMaybe(root, pathFor('claim', id));
  if (!file.exists) throw new ApiError('Unknown accepted claim', 404);
  const claim = decode(file.text);
  if (claim.meta.id !== id || claim.meta.status !== 'accepted')
    throw new ApiError('Claim is not accepted', 403);
  const review = await readMaybe(root, pathFor('review', claim.meta.review_id || 'none'));
  if (!review.exists) throw new ApiError('Claim has no committed human review', 403);
  const meta = decode(review.text).meta;
  if (
    meta.decision !== 'accept' ||
    meta.reviewer !== 'human' ||
    meta.human_verification !== 'webauthn' ||
    !/^[0-9a-f]{64}$/.test(meta.approval_hash || '') ||
    !/^[0-9a-f]{64}$/.test(meta.credential_hash || '') ||
    meta.claim_id !== id ||
    meta.candidate_id !== claim.meta.candidate_id ||
    // The review covers the exact accepted text; any later edit needs a new review.
    meta.claim_hash !== recordHash(file.text)
  )
    throw new ApiError('Claim has no matching human review', 403);
  return {
    path: pathFor('claim', id),
    text: file.text,
    claim,
    reviewPath: pathFor('review', claim.meta.review_id),
    reviewText: review.text,
  };
}
async function listIds(root, kind) {
  if (!(await ensureRecordParent(root, `${DIRECTORIES[kind]}/x.md`, false))) return [];
  const entries = await readdir(join(root, DIRECTORIES[kind]), { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name.slice(0, -3))
    .filter((id) => ID.test(id))
    .sort()
    .slice(0, 2000);
}
export async function listEligibleClaims(root) {
  root = await safeRoot(root);
  const result = [];
  for (const id of await listIds(root, 'claim')) {
    try {
      const { claim, text: fileText } = await readEligibleClaim(root, id);
      result.push({ id, title: claim.claim.slice(0, 120), hash: recordHash(fileText) });
    } catch {
      /* Partial or unreviewed claims are not eligible. */
    }
  }
  return result;
}

export function createObservations({
  roots,
  opsRoot,
  writable = false,
  now = () => new Date(),
  authorizeAcceptance = async () => {
    throw new ApiError('Owner passkey confirmation is required', 403);
  },
}) {
  let queue = Promise.resolve();
  // One server process holds the runtime lease, so an in-process queue serialises reviews.
  const serial = (operation) => {
    const run = queue.then(operation, operation);
    queue = run.catch(() => {});
    return run;
  };
  async function vaultRoot(vault) {
    if (!Object.hasOwn(MODEL_VAULTS, vault)) throw new ApiError('Unknown model vault', 404);
    if (!roots[vault]) throw new ApiError('Model vault is not configured', 409);
    return safeRoot(roots[vault]);
  }
  function requireWritable() {
    if (!writable)
      throw new ApiError('Model vaults are read only; enable model vault writes first', 403);
  }
  async function checkSource(source) {
    if (!roots[source.vault]) return { ...source, state: 'unavailable', excerpt: '' };
    try {
      const file = await readMaybe(await safeRoot(roots[source.vault]), source.path);
      if (!file.exists) return { ...source, state: 'missing', excerpt: '' };
      return {
        ...source,
        state: recordHash(file.text) === source.hash ? 'unchanged' : 'changed',
        currentHash: recordHash(file.text),
        excerpt: excerpt(file.text, source),
      };
    } catch {
      return { ...source, state: 'unavailable', excerpt: '' };
    }
  }
  async function captureSource(source) {
    if (!sourceAllowed(source.path))
      throw new ApiError(
        'Sources must be workspace notes, not candidates, settings or agent sessions'
      );
    if (!roots[source.vault]) throw new ApiError('Source vault is not configured', 409);
    const root = await safeRoot(roots[source.vault]);
    await safePath(root, source.path, { allowMissing: false });
    const file = await readSafe(root, source.path);
    if (!file.exists) throw new ApiError('Source note does not exist', 409);
    const lines = file.text.split('\n').length;
    if ((source.startLine || 1) > lines || (source.endLine || 1) > lines)
      throw new ApiError('Source line range is outside the note');
    return {
      vault: source.vault,
      path: source.path,
      hash: recordHash(file.text),
      ...(source.startLine ? { start_line: source.startLine } : {}),
      ...(source.endLine ? { end_line: source.endLine } : {}),
    };
  }
  const toSource = (s) => ({
    vault: s.vault,
    path: s.path,
    hash: s.hash,
    ...(s.start_line ? { startLine: s.start_line } : {}),
    ...(s.end_line ? { endLine: s.end_line } : {}),
  });

  async function create(vault, input, { authorKind = 'human' } = {}) {
    requireWritable();
    if (authorKind !== 'human')
      throw new ApiError('Agents need a separately granted permission to draft observations', 403);
    const root = await vaultRoot(vault);
    const request = parse(createSchema, input);
    const subject = MODEL_VAULTS[vault];
    const sources = [];
    for (const source of request.sources) sources.push(await captureSource(source));
    if (subject === 'person' && !sources.some((s) => s.vault !== 'ai'))
      throw new ApiError('A claim about the person needs a source outside the AI-Model vault');
    const id = newId('obs', now());
    const meta = {
      schema: 'personal-os/observation-v1',
      id,
      status: 'candidate',
      subject,
      author_kind: authorKind,
      created: now().toISOString(),
      confidence: request.confidence,
      sources,
      reviews: [],
      rag: 'excluded',
    };
    const fileText = document(meta, 'Candidate observation', [
      ['Claim', request.claim],
      ['Uncertainty', request.uncertainty],
    ]);
    await ensureRecordParent(root, pathFor('candidate', id));
    const target = await safePath(root, pathFor('candidate', id));
    if ((await readMaybe(root, pathFor('candidate', id))).exists)
      throw new ApiError('Observation already exists', 409);
    await atomicWrite(target, fileText);
    return { id, path: pathFor('candidate', id), hash: recordHash(fileText) };
  }

  // An accepted candidate needs a new review when its claim lost eligibility (edited or unreviewed).
  async function needsReview(root, meta) {
    if (meta.status !== 'accepted') return false;
    try {
      await readEligibleClaim(root, meta.outcome?.claim_id || '');
      return false;
    } catch {
      return true;
    }
  }
  async function readCandidate(root, id) {
    if (!ID.test(id) || !id.startsWith('obs-')) throw new ApiError('Unknown observation', 404);
    const file = await readMaybe(root, pathFor('candidate', id));
    if (!file.exists) throw new ApiError('Unknown observation', 404);
    const parsed = decode(file.text);
    if (parsed.meta.id !== id) throw new ApiError('Observation file does not match its name', 409);
    return { ...parsed, text: file.text, hash: recordHash(file.text) };
  }

  async function get(vault, id) {
    const root = await vaultRoot(vault);
    await recover(vault);
    const candidate = await readCandidate(root, id);
    const sources = [];
    for (const source of candidate.meta.sources || [])
      sources.push(await checkSource(toSource(source)));
    const reviews = [];
    for (const reviewId of candidate.meta.reviews || []) {
      const file = await readMaybe(root, pathFor('review', reviewId));
      if (file.exists) {
        const review = decode(file.text);
        reviews.push({ ...review.meta, note: review.note });
      }
    }
    return {
      id,
      vault,
      status: candidate.meta.status,
      subject: candidate.meta.subject,
      confidence: candidate.meta.confidence,
      created: candidate.meta.created,
      nextReview: candidate.meta.next_review || null,
      claim: candidate.claim,
      uncertainty: candidate.uncertainty,
      sources,
      reviews,
      outcome: candidate.meta.outcome || null,
      needsReview: await needsReview(root, candidate.meta),
      hash: candidate.hash,
      label: 'UNREVIEWED CANDIDATE',
    };
  }

  async function list(vault) {
    if (!Object.hasOwn(MODEL_VAULTS, vault)) throw new ApiError('Unknown model vault', 404);
    if (!roots[vault]) return { vault, configured: false, writable, candidates: [], accepted: [] };
    const root = await vaultRoot(vault);
    const pending = await recover(vault);
    const candidates = [];
    for (const id of await listIds(root, 'candidate')) {
      try {
        const c = await readCandidate(root, id);
        candidates.push({
          id,
          status: c.meta.status,
          confidence: c.meta.confidence,
          created: c.meta.created,
          nextReview: c.meta.next_review || null,
          sourceCount: (c.meta.sources || []).length,
          claim: c.claim.slice(0, 300),
          needsReview: await needsReview(root, c.meta),
        });
      } catch {
        candidates.push({ id, status: 'invalid', claim: '' });
      }
    }
    const accepted = [];
    for (const id of await listIds(root, 'claim')) {
      try {
        const { claim } = await readEligibleClaim(root, id);
        accepted.push({
          id,
          candidateId: claim.meta.candidate_id,
          claim: claim.claim.slice(0, 300),
          confidence: claim.meta.confidence,
          acceptedAt: claim.meta.accepted_at,
          nextReview: claim.meta.next_review,
          eligible: true,
        });
      } catch {
        accepted.push({ id, eligible: false, claim: '' });
      }
    }
    return {
      vault,
      configured: true,
      writable,
      candidates,
      accepted,
      pendingOperations: pending.count,
      recoveryConflicts: pending.conflicts,
    };
  }

  async function writeManifest(manifest) {
    await ensureRecordParent(dirname(opsRoot), `${basename(opsRoot)}/op.json`);
    const path = await safePath(await safeRoot(opsRoot), `${manifest.op}.json`);
    await atomicWrite(path, `${JSON.stringify(manifest)}\n`);
    await chmod(path, 0o600);
  }
  async function applyManifest(manifest) {
    const root = await vaultRoot(manifest.vault);
    // Validate the entire operation before writing any destinations.
    for (const step of manifest.files) {
      const current = await readMaybe(root, step.path);
      if (current.exists && current.text === step.text) continue;
      if (step.kind === 'candidate' && !Object.hasOwn(step, 'beforeHash'))
        throw new ApiError(
          'Legacy review has no candidate beforeHash. Back up the vault and reconcile the candidate and manifest manually; no files were written.',
          409
        );
      const found = current.exists ? recordHash(current.text) : null;
      if (found !== (step.beforeHash ?? null))
        throw new ApiError('Observation files changed after an interrupted review; reconcile', 409);
    }
    // Every step is idempotent: a file already holding the planned text is left as is.
    // Otherwise the file must still be exactly what the review saw, or absent for a new file.
    for (const step of manifest.files) {
      const current = await readMaybe(root, step.path);
      if (current.exists && current.text === step.text) continue;
      const found = current.exists ? recordHash(current.text) : null;
      if (found !== (step.beforeHash ?? null))
        throw new ApiError('Observation files changed after an interrupted review; reconcile', 409);
      await ensureRecordParent(root, step.path);
      await atomicWrite(await safePath(root, step.path), step.text);
    }
    await unlink(join(await safeRoot(opsRoot), `${manifest.op}.json`));
  }
  async function recover(vault) {
    let names = [];
    try {
      names = (await readdir(await safeRoot(opsRoot))).filter((name) => name.endsWith('.json'));
    } catch {
      return { count: 0, conflicts: [] };
    }
    let pending = 0;
    const conflicts = [];
    for (const name of names) {
      if (!writable) {
        // Read only: report the interrupted operation, never complete it.
        try {
          const file = await readSafe(await safeRoot(opsRoot), name);
          if (file.exists && JSON.parse(file.text).vault === vault) pending += 1;
        } catch {
          pending += 1;
        }
        continue;
      }
      try {
        // Re-read inside the queue: a finished review deletes its manifest first.
        await serial(async () => {
          const file = await readSafe(await safeRoot(opsRoot), name);
          if (!file.exists) return;
          const manifest = JSON.parse(file.text);
          if (manifest.vault === vault) await applyManifest(manifest);
        });
      } catch (error) {
        pending += 1;
        conflicts.push({
          operation: name,
          message:
            error instanceof ApiError
              ? error.message
              : 'Cannot read the interrupted review; reconcile manually.',
        });
      }
    }
    return { count: pending, conflicts };
  }

  function binding(vault, id, request, candidate, sources) {
    return recordHash(
      JSON.stringify({
        vault,
        id,
        request,
        candidateHash: candidate.hash,
        sources: sources.map((s) => ({
          vault: s.vault,
          path: s.path,
          state: s.state,
          hash: s.currentHash || null,
          startLine: s.startLine || null,
          endLine: s.endLine || null,
        })),
      })
    );
  }
  async function prepareAcceptance(vault, id, input) {
    requireWritable();
    const request = parse(reviewSchema, input);
    if (request.decision !== 'accept') throw new ApiError('Only acceptance needs a passkey');
    const candidate = await readCandidate(await vaultRoot(vault), id);
    if (candidate.hash !== request.expectedHash)
      throw new ApiError('Observation changed; reload', 409);
    const sources = [];
    for (const source of candidate.meta.sources || [])
      sources.push(await checkSource(toSource(source)));
    return binding(vault, id, request, candidate, sources);
  }
  async function review(vault, id, input, proof) {
    requireWritable();
    const root = await vaultRoot(vault);
    const request = parse(reviewSchema, input);
    return serial(async () => {
      const candidate = await readCandidate(root, id);
      if (candidate.hash !== request.expectedHash)
        throw new ApiError('Observation changed; reload before reviewing', 409);
      if (
        !['candidate', 'deferred'].includes(candidate.meta.status) &&
        !(await needsReview(root, candidate.meta))
      )
        throw new ApiError('Observation was already decided', 409);
      const sources = [];
      for (const source of candidate.meta.sources || [])
        sources.push(await checkSource(toSource(source)));
      const drift = sources.filter((s) => s.state !== 'unchanged');
      let approval;
      if (request.decision === 'accept') {
        if (!sources.length) throw new ApiError('Accepting needs at least one source');
        if (drift.length && request.acknowledgeSourceChanges !== true)
          throw new ApiError('Sources changed or are missing; review them and acknowledge', 409);
        const bound = binding(vault, id, request, candidate, sources);
        approval = await authorizeAcceptance(bound, proof);
        if (
          approval?.method !== 'webauthn' ||
          approval.bindingHash !== bound ||
          !/^[0-9a-f]{64}$/.test(approval.credentialHash || '')
        )
          throw new ApiError('Owner passkey confirmation is required', 403);
        const refreshed = await readCandidate(root, id);
        const currentSources = [];
        for (const source of refreshed.meta.sources || [])
          currentSources.push(await checkSource(toSource(source)));
        if (binding(vault, id, request, refreshed, currentSources) !== bound)
          throw new ApiError('Observation or sources changed during confirmation; reload', 409);
      }
      if (request.decision === 'defer' && !request.nextReview)
        throw new ApiError('Choose the next review date');
      const at = now();
      const reviewId = newId('review', at);
      const claimId = request.decision === 'accept' ? newId('claim', at) : null;
      const nextReview =
        request.nextReview ||
        (request.decision === 'accept'
          ? localDateStr(new Date(at.getTime() + 90 * 24 * 60 * 60 * 1000))
          : null);
      const claimText = claimId
        ? document(
            {
              schema: 'personal-os/claim-v1',
              id: claimId,
              status: 'accepted',
              candidate_id: id,
              review_id: reviewId,
              subject: candidate.meta.subject,
              confidence: request.confidence || candidate.meta.confidence,
              sources: candidate.meta.sources,
              accepted_at: at.toISOString(),
              next_review: nextReview,
              rag: 'selected-only',
            },
            'Accepted claim',
            [['Claim', request.wording || candidate.claim]]
          )
        : null;
      const files = [];
      files.push({
        kind: 'review',
        beforeHash: null,
        path: pathFor('review', reviewId),
        text: document(
          {
            schema: 'personal-os/review-v1',
            id: reviewId,
            candidate_id: id,
            claim_id: claimId,
            claim_hash: claimText ? recordHash(claimText) : null,
            decision: request.decision,
            reviewer: 'human',
            ...(approval
              ? {
                  human_verification: approval.method,
                  credential_hash: approval.credentialHash,
                  approval_hash: approval.bindingHash,
                }
              : {}),
            reviewed_at: at.toISOString(),
            source_states: sources.map((s) => ({
              vault: s.vault,
              path: s.path,
              state: s.state,
              hash: s.currentHash || null,
            })),
            rag: 'excluded',
          },
          'Observation review',
          [['Note', request.note]]
        ),
      });
      if (claimId)
        files.push({
          kind: 'claim',
          path: pathFor('claim', claimId),
          text: claimText,
          beforeHash: null,
        });
      const status = { accept: 'accepted', reject: 'rejected', defer: 'deferred' }[
        request.decision
      ];
      const meta = {
        ...candidate.meta,
        status,
        reviews: [...(candidate.meta.reviews || []), reviewId],
        outcome: { review_id: reviewId, claim_id: claimId },
        next_review: request.decision === 'defer' ? nextReview : null,
      };
      // Only the frontmatter changes; everything the person wrote below it is kept.
      const head = candidate.text.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
      files.push({
        kind: 'candidate',
        path: pathFor('candidate', id),
        text: `---\n${dump(meta)}---\n${candidate.text.slice(head[0].length)}`,
        beforeHash: candidate.hash,
      });
      const manifest = { op: randomUUID(), vault, candidate: id, files };
      await writeManifest(manifest);
      await applyManifest(manifest);
      return { status, reviewId, claimId, nextReview };
    });
  }
  return { list, get, create, review, recover, prepareAcceptance };
}
