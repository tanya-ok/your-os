import { useEffect, useState } from 'react';
import { ownerCeremony } from './owner-passkey.js';

async function call(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    credentials: 'same-origin',
    ...(body
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Owner confirmation failed');
  return result;
}
export default function OwnerPasskey() {
  const supported =
    typeof window !== 'undefined' &&
    window.isSecureContext &&
    typeof window.PublicKeyCredential?.parseCreationOptionsFromJSON === 'function' &&
    typeof window.PublicKeyCredential?.parseRequestOptionsFromJSON === 'function' &&
    typeof window.PublicKeyCredential?.prototype?.toJSON === 'function';
  const [status, setStatus] = useState(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    call('/api/owner/status')
      .then(setStatus)
      .catch((e) => setError(e.message));
  }, []);
  async function enroll(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (!supported)
        throw new Error('Open this localhost address in a browser with native passkey support.');
      const registration = await call('/api/owner/enroll/start', { code: code.trim() });
      setCode('');
      const possession = await call('/api/owner/enroll/register', {
        challengeId: registration.challengeId,
        response: await ownerCeremony('create', registration.options),
      });
      await call('/api/owner/enroll/finish', {
        challengeId: possession.challengeId,
        response: await ownerCeremony('get', possession.options),
      });
      setStatus(await call('/api/owner/status'));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="card owner-passkey">
      <summary>Local confirmation key · {status?.registered ? 'Ready' : 'Set up once'}</summary>
      <p>
        Accepting an observation requires your passkey. Notes and verification state stay local.
      </p>
      {!supported && (
        <p role="status">
          This browser does not expose the required passkey APIs. Open the localhost address in an
          up-to-date browser with passkey support before issuing an enrollment code.
        </p>
      )}
      {status && window.location.origin !== status.origin && (
        <p>
          Open <a href={status.origin}>{status.origin}</a> to register or confirm with your passkey.
        </p>
      )}
      {!status?.registered && (
        <form onSubmit={enroll}>
          <p>
            In this project's terminal, run <code>node scripts/owner-passkey.mjs enroll</code>. The
            one-use code expires in ten minutes. Registration then asks for your passkey twice.
          </p>
          <label className="field">
            One-use enrollment code
            <input
              type="password"
              autoComplete="off"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="button primary"
            disabled={
              busy ||
              !supported ||
              !code.trim() ||
              !status ||
              window.location.origin !== status.origin
            }
          >
            {busy ? 'Waiting for your confirmation…' : 'Set up confirmation key'}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      <p>
        Existing unverified reviews remain stored. Accept them again to make their claims available
        to the agent.
      </p>
      <p className="field-help">
        Private key storage and syncing follow your chosen authenticator's settings.
      </p>
    </details>
  );
}
