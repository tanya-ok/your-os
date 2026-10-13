// Drafts and writes outlive a page component, so navigation cannot cancel a save.
export function createStoredStateClient({
  fetchImpl = fetch,
  report = () => {},
  delay = 200,
} = {}) {
  const entries = new Map();
  const initialValue = (value) => (typeof value === 'function' ? value() : value);
  const changed = (entry) => {
    for (const listener of entry.listeners) listener({ value: entry.value, loaded: entry.loaded });
  };
  async function load(entry) {
    if (entry.loading || entry.dirty || entry.saving) return;
    entry.loading = true;
    report(entry.key, 'loading');
    try {
      const response = await fetchImpl(`/api/state/${encodeURIComponent(entry.key)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Saved Markdown is unavailable');
      entry.value = result.revision > 0 ? result.data : initialValue(entry.initial);
      entry.revision = result.revision;
      entry.hash = result.hash;
      entry.saved = JSON.stringify(entry.value);
      entry.loaded = true;
      entry.failed = false;
      report(entry.key, 'saved');
      changed(entry);
    } catch (error) {
      entry.failed = true;
      report(entry.key, 'error', error.message);
    } finally {
      entry.loading = false;
    }
  }
  async function save(entry) {
    if (!entry.loaded || entry.saving || entry.failed) return;
    entry.saving = true;
    report(entry.key, 'saving');
    try {
      while (entry.dirty) {
        const text = JSON.stringify(entry.value);
        if (text === entry.saved) {
          entry.dirty = false;
          break;
        }
        const response = await fetchImpl(`/api/state/${encodeURIComponent(entry.key)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: JSON.parse(text),
            revision: entry.revision,
            hash: entry.hash,
          }),
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || 'Could not save Markdown; keep the draft');
        entry.revision = result.revision;
        entry.hash = result.hash;
        entry.saved = text;
        entry.dirty = JSON.stringify(entry.value) !== text;
      }
      report(entry.key, 'saved');
    } catch (error) {
      entry.failed = true;
      report(entry.key, 'error', error.message);
    } finally {
      entry.saving = false;
    }
  }
  function observe(key, initial, listener) {
    let entry = entries.get(key);
    if (!entry) {
      entry = {
        key,
        initial,
        value: initialValue(initial),
        loaded: false,
        dirty: false,
        listeners: new Set(),
      };
      entries.set(key, entry);
    }
    entry.listeners.add(listener);
    listener({ value: entry.value, loaded: entry.loaded });
    void load(entry);
    return () => entry.listeners.delete(listener);
  }
  function set(key, change) {
    const entry = entries.get(key);
    if (!entry?.loaded) return;
    entry.value = typeof change === 'function' ? change(entry.value) : change;
    entry.dirty = JSON.stringify(entry.value) !== entry.saved;
    report(
      key,
      entry.failed ? 'error' : entry.dirty ? 'pending' : 'saved',
      entry.failed ? 'Draft kept in this tab. Resolve the file conflict before reloading.' : ''
    );
    changed(entry);
    clearTimeout(entry.timer);
    if (entry.dirty && !entry.failed)
      entry.timer = setTimeout(() => {
        void save(entry);
      }, delay);
  }
  return { observe, set };
}
