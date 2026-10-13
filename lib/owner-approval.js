import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { ApiError } from './config.js';
import { readSafe, safeRoot } from './safe-path.js';
import { atomicWrite } from './writer.js';

const hash = (value) => createHash('sha256').update(value).digest('hex');
export const acceptanceBinding = (value) => hash(JSON.stringify(value));

export async function issueEnrollmentCode(root, now = Date.now()) {
  await mkdir(root, { recursive: true, mode: 0o700 });
  root = await safeRoot(root);
  const owner = await readSafe(root, 'owner-credential.json');
  if (owner.exists) throw new Error('An owner credential already exists; enrollment is locked');
  const code = randomBytes(32).toString('base64url');
  await atomicWrite(
    join(root, 'owner-enrollment.json'),
    JSON.stringify({
      digest: hash(code),
      expires: now + 10 * 60 * 1000,
      attempts: 0,
    })
  );
  return code;
}

export function createOwnerApproval({ root, origin, now = Date.now }) {
  const expected = new URL(origin);
  if (
    expected.hostname !== 'localhost' ||
    expected.protocol !== 'http:' ||
    expected.origin !== origin
  )
    throw new Error('Owner approval requires a fixed http://localhost origin');
  const rpID = 'localhost';
  const pending = new Map();
  let queue = Promise.resolve();
  function serial(fn) {
    const result = queue.then(fn, fn);
    queue = result.catch(() => {});
    return result;
  }
  async function storage() {
    await mkdir(root, { recursive: true, mode: 0o700 });
    return safeRoot(root);
  }
  async function read(name) {
    const file = await readSafe(await storage(), name);
    if (!file.exists) return null;
    try {
      const value = JSON.parse(file.text);
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid owner state');
      return value;
    } catch {
      throw new ApiError('Owner credential storage is invalid; local recovery is required', 503);
    }
  }
  async function owner() {
    const value = await read('owner-credential.json');
    if (!value) return null;
    if (
      value.version !== 1 ||
      typeof value.id !== 'string' ||
      !value.id ||
      typeof value.publicKey !== 'string' ||
      !value.publicKey ||
      !Number.isSafeInteger(value.counter) ||
      value.counter < 0 ||
      value.origin !== origin
    )
      throw new ApiError('Owner credential storage is invalid or belongs to another origin', 503);
    return value;
  }
  function keep(kind, options, extra = {}) {
    for (const [id, entry] of pending) if (entry.expires <= now()) pending.delete(id);
    if (pending.size >= 64) throw new ApiError('Too many pending owner confirmations', 429);
    const challengeId = randomUUID();
    pending.set(challengeId, {
      kind,
      challenge: options.challenge,
      expires: now() + 120000,
      ...extra,
    });
    return { challengeId, options };
  }
  function consume(id, kind) {
    const entry = pending.get(id);
    pending.delete(id);
    if (!entry || entry.kind !== kind || entry.expires <= now())
      throw new ApiError('Owner confirmation expired or was already used', 403);
    return entry;
  }
  async function authenticate(entry, response, credential) {
    if (
      response?.id !== credential.id ||
      response?.rawId !== credential.id ||
      response?.type !== 'public-key'
    )
      throw new ApiError('Unknown owner credential', 403);
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: entry.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: Buffer.from(credential.publicKey, 'base64url'),
          counter: credential.counter,
          transports: credential.transports,
        },
      });
    } catch {
      throw new ApiError('Owner passkey confirmation was refused', 403);
    }
    if (!result.verified || !result.authenticationInfo.userVerified)
      throw new ApiError('Owner user verification is required', 403);
    return { ...credential, counter: result.authenticationInfo.newCounter };
  }
  async function options(credential) {
    return generateAuthenticationOptions({
      rpID,
      userVerification: 'required',
      allowCredentials: [{ id: credential.id, transports: credential.transports }],
    });
  }
  return {
    status: async () => ({ registered: Boolean(await owner()), origin }),
    startEnrollment: (code) =>
      serial(async () => {
        if (await owner()) throw new ApiError('Owner enrollment is already complete', 409);
        const grant = await read('owner-enrollment.json');
        if (
          !grant ||
          !Number.isFinite(grant.expires) ||
          !Number.isSafeInteger(grant.attempts) ||
          grant.attempts < 0 ||
          !/^[0-9a-f]{64}$/.test(grant.digest || '') ||
          grant.expires <= now() ||
          grant.attempts >= 5 ||
          typeof code !== 'string' ||
          code.length > 128
        )
          throw new ApiError('Run the local owner enrollment command first', 403);
        grant.attempts += 1;
        await atomicWrite(join(await storage(), 'owner-enrollment.json'), JSON.stringify(grant));
        const supplied = Buffer.from(hash(code));
        const wanted = Buffer.from(String(grant.digest));
        if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted))
          throw new ApiError('Owner enrollment code is invalid', 403);
        await unlink(join(await storage(), 'owner-enrollment.json'));
        const generated = await generateRegistrationOptions({
          rpName: 'Personal OS owner',
          rpID,
          userName: 'Local owner',
          userID: randomBytes(32),
          attestationType: 'none',
          supportedAlgorithmIDs: [-7, -257],
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        });
        return keep('registration', generated);
      }),
    finishRegistration: (proof) =>
      serial(async () => {
        const entry = consume(proof?.challengeId, 'registration');
        if (await owner()) throw new ApiError('Owner enrollment is already complete', 409);
        let result;
        try {
          result = await verifyRegistrationResponse({
            response: proof.response,
            expectedChallenge: entry.challenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            requireUserVerification: true,
          });
        } catch {
          throw new ApiError('Owner passkey registration was refused', 403);
        }
        if (!result.verified || !result.registrationInfo.userVerified)
          throw new ApiError('Owner user verification is required', 403);
        const c = result.registrationInfo.credential;
        const credential = {
          version: 1,
          origin,
          id: c.id,
          publicKey: Buffer.from(c.publicKey).toString('base64url'),
          counter: c.counter,
          transports: c.transports || [],
        };
        return keep('possession', await options(credential), { credential });
      }),
    finishEnrollment: (proof) =>
      serial(async () => {
        const entry = consume(proof?.challengeId, 'possession');
        if (await owner()) throw new ApiError('Owner enrollment is already complete', 409);
        const credential = await authenticate(entry, proof.response, entry.credential);
        await atomicWrite(
          join(await storage(), 'owner-credential.json'),
          JSON.stringify(credential)
        );
        return { registered: true };
      }),
    challenge: (binding) =>
      serial(async () => {
        const credential = await owner();
        if (!credential)
          throw new ApiError('Register the local owner passkey before accepting', 403);
        return keep('accept', await options(credential), { binding, credentialId: credential.id });
      }),
    authorize: (binding, proof) =>
      serial(async () => {
        const entry = consume(proof?.challengeId, 'accept');
        const credential = await owner();
        if (!credential || credential.id !== entry.credentialId || entry.binding !== binding)
          throw new ApiError('Observation or decision changed; confirm again', 409);
        const updated = await authenticate(entry, proof.response, credential);
        await atomicWrite(join(await storage(), 'owner-credential.json'), JSON.stringify(updated));
        return { method: 'webauthn', credentialHash: hash(credential.id), bindingHash: binding };
      }),
  };
}
