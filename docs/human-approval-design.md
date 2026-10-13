# Owner-verified observation acceptance

Status: implemented with @simplewebauthn/server 14.0.3, verified using synthetic signed WebAuthn fixtures. Real browser enrollment and owner confirmation are still pending.

## Current gap

Before this change, the review endpoint wrote human metadata without authenticating the reviewer. It now passes a one-use assertion to a trusted server authorizer. Accepting without a verified credential is refused before a manifest is created.

## Intended guarantee

Accepting an observation requires a fresh assertion from the owner's registered WebAuthn credential with both user presence and user verification. The server verifies it before creating a review manifest. A browser checkbox, a request header, a client-side gesture or a label in Markdown is not proof.

This proves use of an enrolled credential with its authenticator's user-verification step. It does not prove comprehension, agreement free of coercion, or hardware-backed storage without attestation. A hostile process running as the filesystem owner can change the program or its files; this mechanism does not protect against that adversary.

## Enrollment

1. The owner starts an explicit local enrollment operation from the terminal. No code is issued through an unauthenticated HTTP endpoint, ordinary logs or model context.
2. A short-lived, one-use enrollment code authorizes the browser ceremony. Attempts are rate limited. Expiry and consumption are enforced on the server.
3. The browser registers a credential for a fixed localhost relying party and origin, with user verification required.
4. The server validates the registration, then requires an assertion proving possession before activating the credential.
5. Credential identifiers, public keys and counters are technical state in ignored private storage. They do not enter a vault, RAG or an export of user notes. Invalid or unreadable credential state fails closed.

The approved verifier is @simplewebauthn/server, pinned to 14.0.3. Registration requests attestation none. The application makes no hardware-attestation claim and does not configure a remote metadata service. Native browser JSON conversion APIs are required; no browser package or handwritten production cryptographic verifier is used.

## Acceptance ceremony

The person reviews the source excerpts and final wording first. The server normalizes the request and binds a random, single-use challenge to:

- The vault role and candidate identifier.
- The exact candidate hash and current source hashes or missing-source states.
- Decision, final wording, confidence, next review date and review note.
- Any acknowledgement of source changes.
- The enrolled credential, expected origin, expiry and server-side challenge identifier.

The browser requests an assertion with `userVerification: required`. The server checks challenge, relying-party hash, origin, ceremony type, signature, credential, user-presence and user-verification flags, expiry and replay status. Counter checks must account for synchronized passkeys, which may report zero. No proof value supplied by the client is trusted without verification.

The challenge is consumed atomically. Before writing, the existing serialized review operation rechecks the candidate and sources against the approved snapshot. An edit between confirmation and writing causes a conflict and requires a new ceremony. Replays or concurrent duplicate submissions cannot create two accepted claims.

The review records a minimal credential reference, approval method and binding digest along with its existing exact claim hash. Raw assertions, enrollment codes and private credential state are excluded from Markdown. Candidate contents remain excluded from agent context.

## Existing claims and recovery

Existing metadata-only reviews must not be silently presented as credential-verified. Preserve their files. Show their legacy status and provide an explicit owner-confirmed re-review. Legacy claims remain stored but are excluded from agent context until a new owner-confirmed review. No file is silently deleted and proof is not inferred retrospectively.

Recovery may complete a manifest whose acceptance was already verified and durably authorized before interruption. It must not turn an unverified legacy manifest into credential-verified acceptance. Repeated recovery of the same approved manifest remains idempotent. Reject, defer and acceptance are distinct decisions; this implementation requires verification for acceptance, while stronger protection for every review decision is a separate scope choice.

## Recovery of owner access

Credential replacement cannot be an unauthenticated HTTP reset. Prefer enrolling a second owner credential after a verified ceremony. If all credentials are lost, an explicit local recovery operation must preserve notes and existing review records, invalidate outstanding challenges, and clearly record the credential change. No remote account, email reset or automatic fallback is included.

## Implemented API changes

The approved routes are GET /api/owner/status; POST /api/owner/enroll/start, /register and /finish; and POST /api/observations/:vault/:id/approval. The existing review route rejects acceptance without a matching verified assertion. Read-only listing, candidate creation and agent-context preparation do not acquire acceptance permission.

Serve the ceremony from the configured localhost origin. The running IP-address preview must not silently change the expected relying party or accept arbitrary origins. Confirm browser support and the chosen development port before enabling the gate.

## Verification required before completion

Synthetic tests must cover missing proof, invalid signature, unknown credential, wrong origin or relying party, missing verification flags, expiry, replay, concurrent submission, changed candidate, changed sources and changed final wording. Check that every denial happens before manifest or claim creation and before any model call. Also test successful acceptance, unchanged repeat agent sends, interrupted write recovery, legacy claim display and explicit re-review.

A real browser ceremony with the owner's credential is a separate acceptance check. Passing synthetic authenticator tests does not establish successful Touch ID, a security-key interaction or the owner's recovery workflow. The server gate is implemented and covered by synthetic tests. Do not describe real owner confirmation as verified until the browser enrollment and acceptance ceremony have both been completed.

## First setup and limits

Run `node scripts/owner-passkey.mjs enroll` in the directory used to launch this application. The command writes only a hash of a random one-use code to ignored private technical storage and prints the code to that terminal. Open Setup on `http://localhost:<port>`, select Local confirmation and enter the code yourself. Browser registration and a possession assertion both require user verification. Do not let an agent enroll a credential for you.

Only the initial owner credential is currently supported. There is no HTTP reset, automatic credential replacement or password fallback. Lost-key recovery and enrolling a second key need a separate explicit local recovery design. Other dashboard pages remain usable without an enrolled key. Pending challenges expire after two minutes and disappear on restart; the enrollment grant expires after ten minutes and permits five code attempts.
