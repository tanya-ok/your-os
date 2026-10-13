import { useCallback, useEffect, useState } from 'react';
import {
  durationClock,
  EMPTY_WORK_SESSION,
  sessionMilliseconds,
  sessionTimestamp,
} from '../work-session.js';

export default function WorkSession({ locale = 'en', timezone = 'UTC', onChange }) {
  const l = (en, ru) => (locale === 'ru' ? ru : en);
  const [state, setState] = useState(EMPTY_WORK_SESSION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(
    async (signal) => {
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      const response = await fetch(
        `/api/work/log?date=${date}&timezone=${encodeURIComponent(timezone)}`,
        { signal }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load work history');
      setState({ active: data.active, sessions: data.sessions });
    },
    [timezone]
  );
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal).catch((reason) => {
      if (reason.name !== 'AbortError') setError(reason.message);
    });
    return () => controller.abort();
  }, [load]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!state.active) return;
    const tick = () => setNow(Date.now());
    const timer = setInterval(tick, 1000);
    const visible = () => {
      if (!document.hidden) tick();
    };
    window.addEventListener('focus', tick);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [state.active]);
  const latest = state.active || state.sessions.at(-1);
  const elapsed = sessionMilliseconds(latest, now);
  const total =
    state.sessions.reduce((sum, session) => sum + sessionMilliseconds(session, now), 0) +
    sessionMilliseconds(state.active, now);
  const mark = async (type) => {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/work/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: type }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not save work session');
      setNow(Date.now());
      await load();
      onChange?.();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const stamp = (at) => sessionTimestamp(at, locale, timezone);
  return (
    <section className="demo-card demo-work-session" aria-labelledby="work-session-title">
      <div className="demo-section-heading">
        <div>
          <span className="demo-eyebrow">{l('YOUR WORKING TIME', 'ВАШЕ РАБОЧЕЕ ВРЕМЯ')}</span>
          <h2 id="work-session-title">{l('Work session', 'Рабочая сессия')}</h2>
        </div>
        <span className="demo-session-status" role="status">
          {state.active
            ? l('Working', 'Работаю')
            : latest
              ? l('Session finished', 'Сессия завершена')
              : l('Ready to begin', 'Можно начинать')}
        </span>
      </div>
      <div className="demo-session-clock">
        <div>
          <span className="demo-eyebrow">{l('Session duration', 'Длительность сессии')}</span>
          <strong aria-live="off">{durationClock(elapsed)}</strong>
          <small>
            {l('Recorded today', 'Записано за сегодня')}: {durationClock(total)}
          </small>
        </div>
        <div className="demo-session-actions">
          <button
            className="demo-button"
            type="button"
            disabled={busy || Boolean(state.active)}
            onClick={() => mark('start')}
          >
            {l('Start work', 'Начать работу')}
          </button>
          <button
            className="demo-button demo-button-secondary"
            type="button"
            disabled={busy || !state.active}
            onClick={() => mark('end')}
          >
            {l('End work', 'Закончить работу')}
          </button>
        </div>
      </div>
      <dl className="demo-session-times">
        <div>
          <dt>{l('Start', 'Начало')}</dt>
          <dd>
            {latest ? (
              <time dateTime={new Date(latest.startedAt).toISOString()}>
                {stamp(latest.startedAt)}
              </time>
            ) : (
              '-'
            )}
          </dd>
        </div>
        <div>
          <dt>{l('End', 'Окончание')}</dt>
          <dd>
            {latest?.endedAt != null ? (
              <time dateTime={new Date(latest.endedAt).toISOString()}>{stamp(latest.endedAt)}</time>
            ) : state.active ? (
              l('In progress', 'В процессе')
            ) : (
              '-'
            )}
          </dd>
        </div>
      </dl>
      <p className="demo-session-note">
        {l('Times use your workspace timezone.', 'Время в часовом поясе пространства.')} {timezone}.{' '}
        {l(
          'Start and end are saved locally. Work history is still here tomorrow.',
          'Начало и окончание сохраняются локально. История останется и завтра.'
        )}
      </p>
      {error && <p role="alert">{error}</p>}
      {state.sessions.length > 0 && (
        <div className="demo-session-history">
          <div className="demo-section-heading">
            <h3>{l('Completed sessions', 'Завершённые сессии')}</h3>
          </div>
          <ol>
            {[...state.sessions].reverse().map((session) => (
              <li key={session.id}>
                <span>
                  <time dateTime={new Date(session.startedAt).toISOString()}>
                    {stamp(session.startedAt)}
                  </time>
                  <span aria-hidden="true"> → </span>
                  <time dateTime={new Date(session.endedAt).toISOString()}>
                    {stamp(session.endedAt)}
                  </time>
                </span>
                <strong>{durationClock(sessionMilliseconds(session, now))}</strong>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
