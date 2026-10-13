import { useEffect, useState } from 'react';
import { createStoredStateClient } from './stored-state-client.js';

const client = createStoredStateClient({
  report(key, phase, message = '') {
    window.dispatchEvent(
      new CustomEvent('personal-os-storage-status', { detail: { key, phase, message } })
    );
    if (phase === 'error')
      window.dispatchEvent(new CustomEvent('personal-os-storage-error', { detail: message }));
  },
});
export function useStoredState(key, initial) {
  const [snapshot, setSnapshot] = useState(() => ({
    key,
    value: typeof initial === 'function' ? initial() : initial,
    loaded: false,
  }));
  // biome-ignore lint/correctness/useExhaustiveDependencies: The entry retains its initial value and unsaved draft across page navigation.
  useEffect(() => client.observe(key, initial, (value) => setSnapshot({ key, ...value })), [key]);
  const current = snapshot.key === key;
  return [
    current ? snapshot.value : typeof initial === 'function' ? initial() : initial,
    (change) => client.set(key, change),
    current && snapshot.loaded,
  ];
}
