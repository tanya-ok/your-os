import { useEffect, useId, useState } from 'react';
import { calendarLocalDate, shiftCalendarDate } from './EditableCalendar.jsx';

async function workCall(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
export default function WorkHistory({ locale = 'en', timezone = 'UTC', refreshKey = 0, onChange }) {
  const l = (en, ru) => (locale === 'ru' ? ru : en);
  const uid = useId().replaceAll(':', '');
  const [today] = useState(() => calendarLocalDate(new Date(), timezone));
  const [date, setDate] = useState(today);
  const [data, setData] = useState({ entries: [], sessions: [], active: null });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Revision and refreshKey deliberately reload after entry and work-session mutations.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    workCall(`/api/work/log?${new URLSearchParams({ date, timezone })}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, timezone, revision, refreshKey]);
  const selectDate = (value) => {
    if (!value || value > today || busy) return;
    setDate(value);
    setDraft('');
    setStatus('');
  };
  const save = async (event) => {
    event.preventDefault();
    if (busy || !draft.trim()) return;
    setBusy(true);
    setError('');
    try {
      await workCall('/api/work/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft.trim(), date }),
      });
      setDraft('');
      setRevision((value) => value + 1);
      setStatus(l('Added.', 'Добавлено.'));
      onChange?.();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (entry) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await workCall(`/api/work/log/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      setRevision((value) => value + 1);
      setStatus(l('Removed.', 'Удалено.'));
      onChange?.();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const stamp = (value) => {
    try {
      return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    } catch {
      return '-';
    }
  };
  const duration = (session) => {
    const minutes = Math.max(
      0,
      Math.round((new Date(session.endedAt) - new Date(session.startedAt)) / 60000)
    );
    return Number.isFinite(minutes) ? `${minutes} ${l('min', 'мин')}` : '-';
  };
  return (
    <section className="work-history" aria-labelledby={`${uid}-title`}>
      <header className="work-history-heading">
        <h2 id={`${uid}-title`}>
          {date === today ? l('Done today', 'Сделано сегодня') : l('Completed work', 'Сделано')}
        </h2>
      </header>
      <div className="work-history-nav">
        <button
          type="button"
          disabled={busy}
          aria-label={l('Previous day', 'Предыдущий день')}
          onClick={() => selectDate(shiftCalendarDate(date, -1))}
        >
          ‹
        </button>
        <input
          type="date"
          value={date}
          max={today}
          disabled={busy}
          aria-label={l('Work day', 'Рабочий день')}
          onChange={(event) => selectDate(event.target.value)}
        />
        <button
          type="button"
          disabled={busy}
          aria-pressed={date === shiftCalendarDate(today, -1)}
          onClick={() => selectDate(shiftCalendarDate(today, -1))}
        >
          {l('Yesterday', 'Вчера')}
        </button>
        <button
          type="button"
          disabled={busy}
          aria-pressed={date === today}
          onClick={() => selectDate(today)}
        >
          {l('Today', 'Сегодня')}
        </button>
        <button
          type="button"
          disabled={busy || date >= today}
          aria-label={l('Next day', 'Следующий день')}
          onClick={() => selectDate(shiftCalendarDate(date, 1))}
        >
          ›
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">{l('Loading saved work…', 'Загрузка сохранённых записей…')}</p>}
      <ul className="work-history-entries work-history-task-list">
        {!loading && !data.entries?.length && (
          <li className="work-history-empty">{l('Nothing recorded yet.', 'Пока нет записей.')}</li>
        )}
        {!loading &&
          (data.entries || []).map((entry) => (
            <li key={entry.id} className="work-history-task-row">
              <span
                className="work-history-check"
                role="img"
                aria-label={l('Completed', 'Выполнено')}
              >
                ✓
              </span>
              <span className="work-history-task-text">{entry.text}</span>
              <small className="work-history-task-time">{stamp(entry.createdAt)}</small>
              <button
                className="work-history-task-delete"
                type="button"
                disabled={busy}
                onClick={() => remove(entry)}
                aria-label={l(`Delete entry: ${entry.text}`, `Удалить запись: ${entry.text}`)}
              >
                ×
              </button>
            </li>
          ))}
      </ul>
      <form className="work-history-form work-history-quick-add" onSubmit={save}>
        <input
          id={`${uid}-add`}
          type="text"
          required
          maxLength={1200}
          aria-label={l('Add completed work', 'Добавить сделанное')}
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={l('What did you finish?', 'Что удалось сделать?')}
        />
        <button className="demo-button" type="submit" disabled={busy || !draft.trim()}>
          {busy ? l('Adding…', 'Добавление…') : l('Add', 'Добавить')}
        </button>
      </form>
      {!loading && ((data.sessions || []).length > 0 || data.active) && (
        <details className="work-history-sessions">
          <summary>{l('Work sessions', 'Рабочие сессии')}</summary>
          {(data.sessions || []).map((session) => (
            <p key={session.id}>
              {stamp(session.startedAt)} - {stamp(session.endedAt)}{' '}
              <strong>{duration(session)}</strong>
            </p>
          ))}
          {data.active && (
            <p>
              {stamp(data.active.startedAt)} - {l('In progress', 'Идёт сейчас')}
            </p>
          )}
        </details>
      )}
      <p role="status">{status}</p>
    </section>
  );
}
