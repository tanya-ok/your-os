export async function ownerCeremony(kind, options) {
  if (!window.isSecureContext || !window.PublicKeyCredential)
    throw new Error('Passkeys require a supported browser on the localhost address.');
  const parse =
    kind === 'create'
      ? PublicKeyCredential.parseCreationOptionsFromJSON
      : PublicKeyCredential.parseRequestOptionsFromJSON;
  if (typeof parse !== 'function')
    throw new Error('Update your browser to use native passkey support.');
  const credential = await navigator.credentials[kind]({
    publicKey: parse.call(PublicKeyCredential, options),
  });
  if (!credential || typeof credential.toJSON !== 'function')
    throw new Error('The browser did not provide a passkey confirmation.');
  return credential.toJSON();
}
