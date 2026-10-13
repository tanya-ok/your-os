import { useId, useState } from 'react';
import WorkspaceSettings from '../components/WorkspaceSettings.jsx';

export const SETUP_SECTIONS = [
  ['start', 'Start here', 'A guided beginning: intention, review rhythm and comfort.'],
  ['workspace', 'Daily rhythm', 'Home programme, work hours, focus timer, Today and shortcuts.'],
  ['appearance', 'Appearance', 'Lighting, timezone and motion preview.'],
  ['vaults', 'Three vaults', 'Main Vault, Person-self-model and AI-Model.'],
  ['confirmation', 'Local confirmation', 'One-time key setup for accepting model observations.'],
  ['connections', 'Connections', 'Google / ICS, Apple Calendar, Reminders and RSS / Atom.'],
  ['areas', 'Areas & projects', 'Name your areas. Create and edit projects in Projects.'],
];

export default function SetupHub(props) {
  const [selected, setSelected] = useState('start');
  const id = useId().replaceAll(':', '');
  return (
    <div className="setup-hub">
      <nav className="setup-hub-navigation" aria-label="Setup sections">
        {SETUP_SECTIONS.map(([key, title], index) => (
          <button
            type="button"
            key={key}
            aria-current={selected === key ? 'page' : undefined}
            onClick={() => setSelected(key)}
          >
            <span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
            {title}
          </button>
        ))}
      </nav>
      {SETUP_SECTIONS.map(([key, title, description]) => (
        <section
          key={key}
          className="setup-hub-section"
          hidden={selected !== key}
          aria-labelledby={`${id}-${key}`}
        >
          <header className="setup-hub-heading">
            <h2 id={`${id}-${key}`}>{title}</h2>
            <p>{description}</p>
          </header>
          {props[key]}
        </section>
      ))}
    </div>
  );
}

export function DashboardPreferences({ value, onSave, busy }) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(value);
  async function save() {
    setError('');
    try {
      await onSave(draft);
      setSaved(true);
    } catch (reason) {
      setError(reason.message);
    }
  }
  return (
    <div>
      <WorkspaceSettings
        value={draft}
        onChange={(next) => {
          setDraft(next);
          setSaved(false);
        }}
      />
      <footer className="setup-hub-save">
        <button type="button" className="button primary" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save daily rhythm'}
        </button>
        <p role="status">
          {dirty ? 'Unsaved changes' : saved ? 'Saved locally.' : 'Settings are up to date.'}
        </p>
      </footer>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
