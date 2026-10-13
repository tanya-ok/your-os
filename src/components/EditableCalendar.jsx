import { useEffect, useId, useState } from 'react';

const words = (locale, en, ru) => (locale === 'ru' ? ru : en);
function dateParts(instant, timezone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
}
function part(parts, name) {
  return parts.find((value) => value.type === name)?.value;
}
export function calendarLocalDate(instant = new Date(), timezone = 'UTC') {
  const parts = dateParts(new Date(instant), timezone);
  return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}`;
}
export function shiftCalendarDate(date, amount) {
  const instant = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(instant.getTime())) throw new Error('Invalid calendar date');
  instant.setUTCDate(instant.getUTCDate() + amount);
  return instant.toISOString().slice(0, 10);
}
export function calendarMonday(date) {
  const day = new Date(`${date}T12:00:00Z`).getUTCDay();
  return shiftCalendarDate(date, -((day + 6) % 7));
}
/** Resolve a wall-clock time using real zone offsets, reject DST gaps.
 * Repeated autumn times consistently use the earlier occurrence. */
export function calendarWallTimeISO(date, time, timezone = 'UTC') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error('Invalid date or time');
  const target = new Date(`${date}T${time}:00Z`);
  if (!Number.isFinite(target.getTime()) || target.toISOString().slice(0, 16) !== `${date}T${time}`)
    throw new Error('Invalid date or time');
  const offsets = new Set();
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = new Date(target.getTime() + hours * 3600000);
    const parts = dateParts(probe, timezone);
    const wallUTC = Date.UTC(
      Number(part(parts, 'year')),
      Number(part(parts, 'month')) - 1,
      Number(part(parts, 'day')),
      Number(part(parts, 'hour')),
      Number(part(parts, 'minute'))
    );
    offsets.add(wallUTC - probe.getTime());
  }
  const candidates = [...offsets]
    .map((offset) => new Date(target.getTime() - offset))
    .filter((candidate) => {
      const parts = dateParts(candidate, timezone);
      return (
        `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')}T${part(parts, 'hour')}:${part(parts, 'minute')}` ===
        `${date}T${time}`
      );
    })
    .sort((left, right) => left - right);
  if (!candidates.length)
    throw new Error(
      'This local time does not exist because the clock changes. Choose another time.'
    );
  return candidates[0].toISOString();
}
function clock(instant, timezone) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(instant));
}
async function calendarCall(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

export default function EditableCalendar({ locale = 'en', timezone = 'UTC' }) {
  const l = (en, ru) => words(locale, en, ru);
  const uid = useId().replaceAll(':', '');
  const [today] = useState(() => calendarLocalDate(new Date(), timezone));
  const [monday, setMonday] = useState(() => calendarMonday(today));
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const days = Array.from({ length: 7 }, (_, index) => shiftCalendarDate(monday, index));
  // biome-ignore lint/correctness/useExhaustiveDependencies: Revision deliberately reloads local events after a successful mutation.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setEvents([]);
    calendarCall(
      `/api/today/sources?${new URLSearchParams({ date: monday, days: '7', timezone })}`,
      { signal: controller.signal }
    )
      .then((data) => {
        if (!controller.signal.aborted) setEvents(Array.isArray(data.events) ? data.events : []);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [monday, timezone, revision]);
  const add = (date) => {
    setForm({ id: '', title: '', date, startTime: '09:00', endDate: date, endTime: '10:00' });
    setError('');
    setStatus('');
  };
  const edit = (event) => {
    setForm({
      id: event.id,
      title: event.title,
      date: calendarLocalDate(event.start, timezone),
      startTime: clock(event.start, timezone),
      endDate: calendarLocalDate(event.end, timezone),
      endTime: clock(event.end, timezone),
    });
    setError('');
    setStatus('');
  };
  const save = async (event) => {
    event.preventDefault();
    if (busy || !form.title.trim()) return;
    setBusy(true);
    setError('');
    try {
      const start = calendarWallTimeISO(form.date, form.startTime, timezone);
      const end = calendarWallTimeISO(form.endDate, form.endTime, timezone);
      if (new Date(end) <= new Date(start))
        throw new Error(l('End must be after start.', 'Окончание должно быть позже начала.'));
      await calendarCall('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(form.id ? { id: form.id } : {}),
          title: form.title.trim(),
          start,
          end,
          allDay: false,
        }),
      });
      setForm(null);
      setRevision((value) => value + 1);
      setStatus(l('Event saved locally.', 'Событие сохранено локально.'));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = async (event) => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await calendarCall(`/api/calendar/events/${encodeURIComponent(event.id)}`, {
        method: 'DELETE',
      });
      setRevision((value) => value + 1);
      if (form?.id === event.id) setForm(null);
      setStatus(l('Event removed locally.', 'Событие удалено локально.'));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  };
  const forDay = (date) =>
    events
      .filter((event) => {
        try {
          const start =
            event.allDay && event.sourceId !== 'apple-calendar'
              ? event.start.slice(0, 10)
              : calendarLocalDate(event.start, timezone);
          const end =
            event.allDay && event.sourceId !== 'apple-calendar'
              ? shiftCalendarDate(event.end.slice(0, 10), -1)
              : calendarLocalDate(new Date(new Date(event.end).getTime() - 1), timezone);
          return start <= date && end >= date;
        } catch {
          return false;
        }
      })
      .sort((left, right) => new Date(left.start) - new Date(right.start));
  return (
    <section className="editable-calendar" aria-labelledby={`${uid}-title`}>
      <header className="editable-calendar-heading">
        <div>
          <span className="demo-eyebrow">
            {l('YOUR WEEK', 'ВАША НЕДЕЛЯ')} · {timezone}
          </span>
          <h2 id={`${uid}-title`}>{l('Room for the week', 'Пространство недели')}</h2>
          <p>
            {l(
              'Add and edit local events. Connected calendars are read-only.',
              'Добавляйте и меняйте локальные события. Подключённые календари доступны только для чтения.'
            )}
          </p>
        </div>
        <button type="button" className="demo-button" onClick={() => add(today)}>
          {l('Add event', 'Добавить событие')}
        </button>
      </header>
      <div className="editable-calendar-week-nav">
        <button
          type="button"
          aria-label={l('Previous calendar week', 'Предыдущая неделя календаря')}
          onClick={() => setMonday((value) => shiftCalendarDate(value, -7))}
        >
          ‹
        </button>
        <strong>
          {days[0]} - {days[6]}
        </strong>
        <button type="button" onClick={() => setMonday(calendarMonday(today))}>
          {l('This week', 'Эта неделя')}
        </button>
        <button
          type="button"
          aria-label={l('Next calendar week', 'Следующая неделя календаря')}
          onClick={() => setMonday((value) => shiftCalendarDate(value, 7))}
        >
          ›
        </button>
      </div>
      {error && (
        <p className="editable-calendar-error" role="alert">
          {error}
        </p>
      )}
      {loading && <p role="status">{l('Loading calendar…', 'Загрузка календаря…')}</p>}
      {form && (
        <form className="editable-calendar-form" onSubmit={save}>
          <div className="editable-calendar-section-heading">
            <h3>
              {form.id
                ? l('Edit local event', 'Изменить локальное событие')
                : l('New local event', 'Новое локальное событие')}
            </h3>
            <button type="button" disabled={busy} onClick={() => setForm(null)}>
              {l('Cancel', 'Отмена')}
            </button>
          </div>
          <label>
            {l('Event title', 'Название события')}
            <input
              required
              maxLength="200"
              value={form.title}
              onChange={(event) =>
                setForm((previous) => ({ ...previous, title: event.target.value }))
              }
            />
          </label>
          <div className="editable-calendar-fields">
            <label>
              {l('Start date', 'Дата начала')}
              <input
                type="date"
                required
                value={form.date}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    date: event.target.value,
                    endDate:
                      previous.endDate < event.target.value ? event.target.value : previous.endDate,
                  }))
                }
              />
            </label>
            <label>
              {l('Start time', 'Время начала')}
              <input
                type="time"
                required
                value={form.startTime}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, startTime: event.target.value }))
                }
              />
            </label>
            <label>
              {l('End date', 'Дата окончания')}
              <input
                type="date"
                required
                min={form.date}
                value={form.endDate}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, endDate: event.target.value }))
                }
              />
            </label>
            <label>
              {l('End time', 'Время окончания')}
              <input
                type="time"
                required
                value={form.endTime}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, endTime: event.target.value }))
                }
              />
            </label>
          </div>
          <small>
            {l(
              'Times use the selected timezone. Repeated autumn times use the first occurrence.',
              'Время в выбранном часовом поясе. При осеннем повторе часа выбирается первое вхождение.'
            )}
          </small>
          <button className="demo-button" type="submit" disabled={busy || !form.title.trim()}>
            {busy
              ? l('Saving…', 'Сохранение…')
              : l('Save event locally', 'Сохранить событие локально')}
          </button>
        </form>
      )}
      <div className="editable-calendar-grid">
        {days.map((date) => (
          <section
            key={date}
            className={`editable-calendar-day ${date === today ? 'editable-calendar-is-today' : ''}`}
            aria-label={date}
          >
            <header>
              <div>
                <strong>
                  {new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
                    weekday: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(`${date}T12:00:00Z`))}
                </strong>
                <span>{date.slice(8)}</span>
              </div>
              <button
                type="button"
                aria-label={l(`Add event on ${date}`, `Добавить событие на ${date}`)}
                onClick={() => add(date)}
              >
                +
              </button>
            </header>
            <div className="editable-calendar-day-events">
              {forDay(date).map((event) => (
                <article
                  className={`editable-calendar-event ${event.editable ? '' : 'editable-calendar-feed-event'}`}
                  key={event.id}
                >
                  <small>
                    {event.allDay
                      ? l('All day', 'Весь день')
                      : `${clock(event.start, timezone)}-${clock(event.end, timezone)}`}
                  </small>
                  <h3>{event.title}</h3>
                  {event.location && <p>{event.location}</p>}
                  <span>
                    {event.editable
                      ? l('Local', 'Локально')
                      : l('Calendar feed · read-only', 'Календарная лента · чтение')}
                  </span>
                  {event.editable && (
                    <div className="editable-calendar-event-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => edit(event)}
                        aria-label={l(`Edit ${event.title}`, `Изменить ${event.title}`)}
                      >
                        {l('Edit', 'Изменить')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(event)}
                        aria-label={l(`Delete ${event.title}`, `Удалить ${event.title}`)}
                      >
                        {l('Delete', 'Удалить')}
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {!loading && forDay(date).length === 0 && (
                <p className="editable-calendar-empty">{l('Room to breathe', 'Свободное место')}</p>
              )}
            </div>
          </section>
        ))}
      </div>
      <p className="editable-calendar-note">
        {l(
          'Local events survive reloads. These edits do not write to Google Calendar or Markdown notes.',
          'Локальные события сохраняются после перезагрузки. Изменения не записываются в Google Calendar или Markdown-заметки.'
        )}
      </p>
      <p role="status" className="editable-calendar-status">
        {status}
      </p>
    </section>
  );
}
