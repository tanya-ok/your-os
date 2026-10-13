import { useEffect, useState } from 'react';
import {
  calendarLocalDate,
  calendarMonday,
  calendarWallTimeISO,
  shiftCalendarDate,
} from './EditableCalendar.jsx';

async function call(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Connection unavailable');
  return data;
}
export default function NativeConnections({
  locale = 'en',
  timezone = 'UTC',
  mode = 'setup',
  onNavigateSetup,
}) {
  const l = (en, ru) => (locale === 'ru' ? ru : en);
  const [data, setData] = useState({ supported: false, calendar: null, reminders: null });
  const [calendars, setCalendars] = useState([]);
  const [lists, setLists] = useState([]);
  const [selectedCalendars, setSelectedCalendars] = useState([]);
  const [selectedLists, setSelectedLists] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/integrations/apple', { signal: controller.signal })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value;
      })
      .then((value) => {
        setData(value);
        setSelectedCalendars(value.calendar?.calendarIds || []);
        setSelectedLists(value.reminders?.listIds || []);
        setCalendars(value.calendar?.calendars || []);
        setLists(value.reminders?.lists || []);
      })
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, []);
  const perform = async (action) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const toggle = (value, set, id) =>
    set(value.includes(id) ? value.filter((item) => item !== id) : [...value, id]);
  if (mode === 'gtd')
    return (
      <section className="native-connections card">
        <header className="section-heading">
          <h2>{l('Apple Reminders', 'Напоминания Apple')}</h2>
          <button type="button" className="text-button" onClick={onNavigateSetup}>
            {l('Connect in Setup', 'Подключить в Setup')} ↗
          </button>
        </header>
        <p>
          {l(
            'A manually refreshed, read-only view. Completing dashboard tasks does not change Apple Reminders.',
            'Обновляемый вручную список для чтения. Выполнение задач дашборда не меняет Напоминания Apple.'
          )}
        </p>
        {data.reminders?.items?.length ? (
          <ul>
            {data.reminders.items
              .filter((item) => !item.completed)
              .map((item) => (
                <li key={`${item.listId}:${item.id}`}>
                  <strong>{item.title}</strong>
                  <small>
                    {' '}
                    · {item.listTitle}
                    {item.dueDate
                      ? ` · ${new Intl.DateTimeFormat(locale, { timeZone: timezone, dateStyle: 'medium' }).format(new Date(item.dueDate))}`
                      : ''}
                  </small>
                </li>
              ))}
          </ul>
        ) : (
          <p>
            {l(
              'Choose your reminder lists in Setup, then refresh them.',
              'Выберите списки напоминаний в Setup и обновите их.'
            )}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </section>
    );
  return (
    <section className="native-connections card" id="apple-connections">
      <span className="eyebrow">{l('Connect your Mac', 'Подключения на Mac')}</span>
      <h2>{l('Apple Calendar & Reminders', 'Календарь и Напоминания Apple')}</h2>
      <p>
        {l(
          'Connect explicitly, choose calendars or lists, then refresh. macOS may ask for permission. Nothing is read automatically on startup.',
          'Нажмите подключить, выберите календари или списки и обновите. macOS может запросить разрешение. При запуске данные автоматически не читаются.'
        )}
      </p>
      {!data.supported && (
        <p>
          {l(
            'Native connections require macOS. Google and Apple calendar subscriptions are available below through ICS.',
            'Локальные подключения работают на macOS. Подписки Google и Apple по ICS доступны ниже.'
          )}
        </p>
      )}
      <div className="native-connections-grid">
        <article>
          <h3>Apple Calendar</h3>
          <p>
            {l(
              'Selected events appear on Today and Calendar. Read-only; local demo events stay editable.',
              'Выбранные события появятся на Today и Calendar. Только чтение; локальные события демо можно редактировать.'
            )}
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !data.supported}
            onClick={() =>
              perform(async () => {
                const result = await call('/api/integrations/apple/calendars');
                setCalendars(result.calendars);
              })
            }
          >
            {l('Connect Apple Calendar', 'Подключить Apple Calendar')}
          </button>
          <fieldset disabled={busy}>
            <legend>{l('Calendars to include', 'Какие календари включить')}</legend>
            {calendars.map((item) => (
              <label className="check-row" key={item.id}>
                <input
                  type="checkbox"
                  checked={selectedCalendars.includes(item.id)}
                  onChange={() => toggle(selectedCalendars, setSelectedCalendars, item.id)}
                />
                {item.title}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="button primary"
            disabled={busy || !selectedCalendars.length}
            onClick={() =>
              perform(async () => {
                const monday = calendarMonday(calendarLocalDate(new Date(), timezone));
                const start = calendarWallTimeISO(monday, '00:00', timezone);
                const end = calendarWallTimeISO(shiftCalendarDate(monday, 7), '00:00', timezone);
                setData(
                  await call('/api/integrations/apple/calendar/refresh', {
                    calendarIds: selectedCalendars,
                    start,
                    end,
                  })
                );
                setNotice(
                  l(
                    'This week’s events are saved locally.',
                    'События этой недели сохранены локально.'
                  )
                );
              })
            }
          >
            {l('Refresh this week', 'Обновить эту неделю')}
          </button>
          {data.calendar?.lastSync && (
            <p>
              {l('Last refresh', 'Обновлено')}:{' '}
              {new Date(data.calendar.lastSync).toLocaleString(locale)}
            </p>
          )}
        </article>
        <article>
          <h3>Apple Reminders · GTD</h3>
          <p>
            {l(
              'Choose the lists you use for Next, Waiting or Someday. They appear in GTD as a separate read-only view.',
              'Выберите списки для Next, Waiting или Someday. Они появятся в GTD отдельным списком для чтения.'
            )}
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !data.supported}
            onClick={() =>
              perform(async () => {
                const result = await call('/api/integrations/apple/reminder-lists');
                setLists(result.lists);
              })
            }
          >
            {l('Connect Apple Reminders', 'Подключить Напоминания Apple')}
          </button>
          <fieldset disabled={busy}>
            <legend>{l('Reminder lists to include', 'Списки напоминаний')}</legend>
            {lists.map((item) => (
              <label className="check-row" key={item.id}>
                <input
                  type="checkbox"
                  checked={selectedLists.includes(item.id)}
                  onChange={() => toggle(selectedLists, setSelectedLists, item.id)}
                />
                {item.title}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="button primary"
            disabled={busy || !selectedLists.length}
            onClick={() =>
              perform(async () => {
                setData(
                  await call('/api/integrations/apple/reminders/refresh', { lists: selectedLists })
                );
                setNotice(
                  l(
                    'Selected reminders are saved locally for GTD.',
                    'Выбранные напоминания сохранены локально для GTD.'
                  )
                );
              })
            }
          >
            {l('Refresh selected lists', 'Обновить выбранные списки')}
          </button>
          {data.reminders?.lastSync && (
            <p>
              {l('Last refresh', 'Обновлено')}:{' '}
              {new Date(data.reminders.lastSync).toLocaleString(locale)}
            </p>
          )}
        </article>
      </div>
      {(data.calendar || data.reminders) && (
        <button
          type="button"
          className="text-button"
          disabled={busy}
          onClick={() =>
            perform(async () => {
              setData(await call('/api/integrations/apple/disconnect', {}));
              setCalendars([]);
              setLists([]);
              setSelectedCalendars([]);
              setSelectedLists([]);
              setNotice(
                l(
                  'Local connection cache cleared. macOS permissions are managed in System Settings.',
                  'Локальный кеш подключения очищен. Разрешения macOS управляются в Системных настройках.'
                )
              );
            })
          }
        >
          {l('Forget local connections', 'Забыть локальные подключения')}
        </button>
      )}
      {busy && <p role="status">{l('Waiting for macOS…', 'Ожидание macOS…')}</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {[...(data.calendar?.warnings || []), ...(data.reminders?.warnings || [])].map((warning) => (
        <p key={warning}>{warning}</p>
      ))}
    </section>
  );
}
