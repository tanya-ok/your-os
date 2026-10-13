import { useEffect, useRef, useState } from 'react';

// Safe auto-refresh is limited to an untouched Main page. Drafts and AI history stay in place.
export function previewMayReload({ page, edited, busy, preserved, dialog }) {
  return page === 'main' && !edited && !busy && !preserved && !dialog;
}
export default function LivePreview() {
  const version = useRef(null);
  const edited = useRef(false);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    const markEdited = () => {
      edited.current = true;
    };
    document.addEventListener('input', markEdited, true);
    document.addEventListener('change', markEdited, true);
    async function check() {
      try {
        const response = await fetch('/api/status', {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Preview unavailable');
        const data = await response.json();
        if (!data.previewVersion || stopped) return;
        if (version.current && version.current !== data.previewVersion) {
          const safe = previewMayReload({
            page: document.querySelector('.app-shell')?.dataset.page,
            edited: edited.current,
            busy: Boolean(document.querySelector('[aria-busy="true"]')),
            preserved: Boolean(document.querySelector('[data-preserve-preview="true"]')),
            dialog: Boolean(document.querySelector('[role="dialog"]')),
          });
          if (safe) {
            window.location.reload();
            return;
          }
          setAvailable(true);
        }
        version.current ||= data.previewVersion;
      } catch {
        /* Server restart is transient. Keep the user's current page. */
      }
      if (!stopped) timer = setTimeout(check, 3000);
    }
    check();
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener('input', markEdited, true);
      document.removeEventListener('change', markEdited, true);
    };
  }, []);
  if (!available) return null;
  return (
    <aside className="live-preview-update" role="status">
      <span>
        A new demo version is ready. Export any AI conversation and save drafts before reloading.
      </span>
      <button type="button" onClick={() => window.location.reload()}>
        Reload demo
      </button>
    </aside>
  );
}
