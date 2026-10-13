import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createObservations, listEligibleClaims } from '../lib/observations.js';
import { createOwnerApproval, issueEnrollmentCode } from '../lib/owner-approval.js';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';

const origin = 'http://localhost:3118';
const sha = (bytes) => createHash('sha256').update(bytes).digest();
// A deliberately synthetic ES256 authenticator. This is not a browser or Touch ID test.
function authenticator() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const id = randomBytes(16),
    credentialId = id.toString('base64url');
  const cose = Buffer.concat([
    Buffer.from([0xa5, 1, 2, 3, 0x26, 0x20, 1, 0x21, 0x58, 32]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from([0x22, 0x58, 32]),
    Buffer.from(jwk.y, 'base64url'),
  ]);
  function response(
    challenge,
    {
      registration = false,
      flags,
      requestOrigin = origin,
      rpID = 'localhost',
      counter = 0,
      signingKey = privateKey,
    } = {}
  ) {
    const client = Buffer.from(
      JSON.stringify({
        type: registration ? 'webauthn.create' : 'webauthn.get',
        challenge,
        origin: requestOrigin,
        crossOrigin: false,
      })
    );
    const count = Buffer.alloc(4);
    count.writeUInt32BE(counter);
    const data = Buffer.concat([
      sha(rpID),
      Buffer.from([flags ?? (registration ? 0x45 : 0x05)]),
      count,
      ...(registration ? [Buffer.alloc(16), Buffer.from([0, id.length]), id, cose] : []),
    ]);
    const common = {
      id: credentialId,
      rawId: credentialId,
      type: 'public-key',
      clientExtensionResults: {},
    };
    if (registration) {
      // CBOR {fmt: "none", attStmt: {}, authData: <bytes>} for the test fixture only.
      const attestation = Buffer.concat([
        Buffer.from([0xa3, 0x63]),
        Buffer.from('fmt'),
        Buffer.from([0x64]),
        Buffer.from('none'),
        Buffer.from([0x67]),
        Buffer.from('attStmt'),
        Buffer.from([0xa0, 0x68]),
        Buffer.from('authData'),
        Buffer.from([0x58, data.length]),
        data,
      ]);
      return {
        ...common,
        response: {
          clientDataJSON: client.toString('base64url'),
          attestationObject: attestation.toString('base64url'),
          transports: ['internal'],
        },
      };
    }
    return {
      ...common,
      response: {
        clientDataJSON: client.toString('base64url'),
        authenticatorData: data.toString('base64url'),
        userHandle: null,
        signature: sign('sha256', Buffer.concat([data, sha(client)]), signingKey).toString(
          'base64url'
        ),
      },
    };
  }
  return { response };
}
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'owner-approval-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  let time = Date.now();
  const gate = createOwnerApproval({ root, origin, now: () => time });
  return {
    root,
    gate,
    advance: (ms) => {
      time += ms;
    },
  };
}
async function enrolled(t) {
  const f = await fixture(t),
    key = authenticator();
  const code = await issueEnrollmentCode(f.root);
  const reg = await f.gate.startEnrollment(code);
  const possession = await f.gate.finishRegistration({
    challengeId: reg.challengeId,
    response: key.response(reg.options.challenge, { registration: true }),
  });
  assert.equal((await f.gate.status()).registered, false);
  await f.gate.finishEnrollment({
    challengeId: possession.challengeId,
    response: key.response(possession.options.challenge),
  });
  return { ...f, key };
}
test('enrollment requires a terminal grant, possession and a one-use code', async (t) => {
  const { root, gate } = await fixture(t);
  await assert.rejects(gate.startEnrollment('untrusted'), (e) => e.status === 403);
  const code = await issueEnrollmentCode(root);
  await assert.rejects(gate.startEnrollment('wrong'), /invalid/);
  await gate.startEnrollment(code);
  await assert.rejects(gate.startEnrollment(code), (e) => e.status === 403);
  assert.equal((await gate.status()).registered, false);
});
test('real verifier accepts a signed synthetic assertion and refuses replay and concurrent reuse', async (t) => {
  const { root, gate, key } = await enrolled(t);
  assert.equal((await gate.status()).registered, true);
  await assert.rejects(issueEnrollmentCode(root), /already exists/);
  const binding = 'a'.repeat(64),
    challenge = await gate.challenge(binding);
  const proof = {
    challengeId: challenge.challengeId,
    response: key.response(challenge.options.challenge),
  };
  const results = await Promise.allSettled([
    gate.authorize(binding, proof),
    gate.authorize(binding, proof),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(results.filter((r) => r.status === 'rejected').length, 1);
  assert.equal(results.find((r) => r.status === 'fulfilled').value.method, 'webauthn');
});
test('wrong signature, origin, relying party and missing verification fail through the real library', async (t) => {
  const { gate, key } = await enrolled(t);
  for (const overrides of [
    { flags: 1 },
    { flags: 4 },
    { requestOrigin: 'http://localhost:9999' },
    { rpID: 'different.example' },
    { signingKey: generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey },
  ]) {
    const challenge = await gate.challenge('b'.repeat(64));
    await assert.rejects(
      gate.authorize('b'.repeat(64), {
        challengeId: challenge.challengeId,
        response: key.response(challenge.options.challenge, overrides),
      }),
      (e) => e.status === 403
    );
  }
});
test('changed operation binding and expired challenges are refused', async (t) => {
  const { gate, key, advance } = await enrolled(t);
  const challenge = await gate.challenge('c'.repeat(64));
  await assert.rejects(
    gate.authorize('d'.repeat(64), {
      challengeId: challenge.challengeId,
      response: key.response(challenge.options.challenge),
    }),
    (e) => e.status === 409
  );
  const expired = await gate.challenge('c'.repeat(64));
  advance(120001);
  await assert.rejects(
    gate.authorize('c'.repeat(64), {
      challengeId: expired.challengeId,
      response: key.response(expired.options.challenge),
    }),
    (e) => e.status === 403
  );
});
test('missing proof is refused and a restart invalidates all in-flight challenges', async (t) => {
  const { gate, root, key } = await enrolled(t);
  await assert.rejects(gate.authorize('e'.repeat(64), undefined), (e) => e.status === 403);
  const challenge = await gate.challenge('e'.repeat(64));
  const restarted = createOwnerApproval({ root, origin });
  await assert.rejects(
    restarted.authorize('e'.repeat(64), {
      challengeId: challenge.challengeId,
      response: key.response(challenge.options.challenge),
    }),
    (e) => e.status === 403
  );
});

test('accepted storage uses the real verifier, refuses source races and hides legacy reviews', async (t) => {
  const { root, gate, key } = await enrolled(t);
  const roots = { main: join(root, 'main'), self: join(root, 'self'), ai: join(root, 'ai') };
  for (const path of Object.values(roots)) await mkdir(join(path, 'Projects'), { recursive: true });
  const source = join(roots.main, 'Projects', 'source.md');
  await atomicWrite(source, '# A fictional source\nOne observation.\n');
  let race = false;
  const observations = createObservations({
    roots,
    opsRoot: join(root, 'ops'),
    writable: true,
    authorizeAcceptance: async (binding, proof) => {
      const approval = await gate.authorize(binding, proof);
      if (race) await atomicWrite(source, '# Edited during verification\n');
      return approval;
    },
  });
  const candidate = await observations.create('self', {
    claim: 'An example claim',
    confidence: 'low',
    sources: [{ vault: 'main', path: 'Projects/source.md' }],
  });
  const request = { decision: 'accept', expectedHash: candidate.hash, wording: 'Reviewed example' };
  const challenge = await gate.challenge(
    await observations.prepareAcceptance('self', candidate.id, request)
  );
  const proof = {
    challengeId: challenge.challengeId,
    response: key.response(challenge.options.challenge),
  };
  race = true;
  await assert.rejects(
    observations.review('self', candidate.id, request, proof),
    (e) => e.status === 409
  );
  assert.deepEqual(await listEligibleClaims(roots.self), []);
  race = false;
  const acknowledged = { ...request, acknowledgeSourceChanges: true };
  const again = await gate.challenge(
    await observations.prepareAcceptance('self', candidate.id, acknowledged)
  );
  const result = await observations.review('self', candidate.id, acknowledged, {
    challengeId: again.challengeId,
    response: key.response(again.options.challenge),
  });
  assert.equal((await listEligibleClaims(roots.self)).length, 1);
  const reviewPath = join(roots.self, 'Reviews', `${result.reviewId}.md`);
  const original = await readFile(reviewPath, 'utf8');
  assert.match(original, /human_verification: 'webauthn'/);
  await atomicWrite(reviewPath, original.replace(/^human_verification:.*\n/m, ''));
  assert.deepEqual(await listEligibleClaims(roots.self), []);
  assert.equal((await observations.get('self', candidate.id)).needsReview, true);
});

test('a caller cannot accept without an explicit trusted authorizer or forge proof through HTTP', async (t) => {
  const { root } = await fixture(t);
  const roots = { main: join(root, 'main'), self: join(root, 'self'), ai: join(root, 'ai') };
  for (const path of Object.values(roots)) await mkdir(join(path, 'Projects'), { recursive: true });
  await atomicWrite(join(roots.main, 'Projects', 'source.md'), '# Fictional source');
  const observations = createObservations({ roots, opsRoot: join(root, 'ops'), writable: true });
  const candidate = await observations.create('self', {
    claim: 'Example',
    confidence: 'low',
    sources: [{ vault: 'main', path: 'Projects/source.md' }],
  });
  const before = await readFile(join(roots.self, candidate.path), 'utf8');
  const body = { decision: 'accept', expectedHash: candidate.hash };
  await assert.rejects(observations.review('self', candidate.id, body), (e) => e.status === 403);
  const app = createApp({
    vaultRoot: roots.main,
    selfVaultRoot: roots.self,
    aiVaultRoot: roots.ai,
    profilePath: join(root, 'profile.json'),
    writable: true,
    ownerOrigin: origin,
  });
  const result = await app.request(`${origin}/api/observations/self/${candidate.id}/review`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, ownerProof: { challengeId: 'untrusted', method: 'webauthn' } }),
  });
  assert.equal(result.status, 403);
  assert.match((await result.json()).error, /Owner confirmation expired/);
  assert.equal(await readFile(join(roots.self, candidate.path), 'utf8'), before);
  assert.deepEqual(await listEligibleClaims(roots.self), []);
});

test('HTTP acceptance requires the exact signed challenge issued by that server', async (t) => {
  const { root, key } = await enrolled(t);
  const roots = { main: join(root, 'main'), self: join(root, 'self'), ai: join(root, 'ai') };
  for (const path of Object.values(roots)) await mkdir(join(path, 'Projects'), { recursive: true });
  await atomicWrite(join(roots.main, 'Projects', 'source.md'), '# Fictional source');
  const app = createApp({
    vaultRoot: roots.main,
    selfVaultRoot: roots.self,
    aiVaultRoot: roots.ai,
    profilePath: join(root, 'profile.json'),
    writable: true,
    ownerOrigin: origin,
  });
  async function post(path, body) {
    return app.request(`${origin}${path}`, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  const created = await (
    await post('/api/observations/self', {
      claim: 'An HTTP example',
      confidence: 'low',
      sources: [{ vault: 'main', path: 'Projects/source.md' }],
    })
  ).json();
  const body = {
    decision: 'accept',
    expectedHash: created.hash,
    wording: 'Owner-reviewed example',
  };
  const challengeResponse = await post(`/api/observations/self/${created.id}/approval`, body);
  assert.equal(challengeResponse.status, 200);
  const challenge = await challengeResponse.json();
  const approved = await post(`/api/observations/self/${created.id}/review`, {
    ...body,
    ownerProof: {
      challengeId: challenge.challengeId,
      response: key.response(challenge.options.challenge),
    },
  });
  assert.equal(approved.status, 200, await approved.clone().text());
  assert.equal((await approved.json()).status, 'accepted');
  assert.equal((await listEligibleClaims(roots.self)).length, 1);
});
