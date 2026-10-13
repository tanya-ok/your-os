const providers = new Set(['local']);
const encoder = new TextEncoder();
export function parseSession(text) {
  if (typeof text !== 'string' || encoder.encode(text).length > 64000)
    throw new Error('Session exceeds 64 KB');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON session file');
  }
  if (
    !data ||
    Array.isArray(data) ||
    typeof data !== 'object' ||
    Object.keys(data).some(
      (key) => !['format', 'version', 'provider', 'model', 'messages'].includes(key)
    ) ||
    data.format !== 'personal-os-session' ||
    data.version !== 1 ||
    !providers.has(data.provider) ||
    typeof data.model !== 'string' ||
    data.model.length > 120 ||
    (data.model && !/^[a-zA-Z0-9][a-zA-Z0-9_.:/+-]*$/.test(data.model)) ||
    !Array.isArray(data.messages) ||
    data.messages.length > 20
  )
    throw new Error('Unsupported session format');
  for (const [index, message] of data.messages.entries()) {
    if (
      !message ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      Object.keys(message).some((key) => !['role', 'content'].includes(key)) ||
      !['user', 'assistant'].includes(message.role) ||
      typeof message.content !== 'string' ||
      !message.content.trim() ||
      message.content.length > 6000 ||
      (index === 0 && message.role !== 'user')
    )
      throw new Error('Invalid session message');
  }
  if (encoder.encode(JSON.stringify(data.messages)).length > 32000)
    throw new Error('Conversation exceeds 32 KB');
  return data;
}
export function serializeSession({ provider, model, messages }) {
  const text = JSON.stringify(
    {
      format: 'personal-os-session',
      version: 1,
      provider,
      model,
      messages: messages.map(({ role, content }) => ({ role, content })),
    },
    null,
    2
  );
  parseSession(text);
  return text;
}
