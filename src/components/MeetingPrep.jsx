import { useEffect, useId, useState } from 'react';
import { useStoredState } from '../hooks/useStoredState.js';
import { calendarLocalDate, shiftCalendarDate } from './EditableCalendar.jsx';

const words = (locale, en, ru) => (locale === 'ru' ? ru : en);
const string = (value) => (typeof value === 'string' ? value : '');
export function buildMeetingBrief(
  {
    date,
    previousDate,
    yesterday = [],
    today = [],
    area = '',
    plan = '',
    dontForget = '',
    notes = '',
  },
  locale = 'en'
) {
  const l = (en, ru) => words(locale, en, ru);
  const list = (entries) =>
    entries.length
      ? entries.map((entry) => `- ${entry.text}`).join('\n')
      : l('No work notes recorded.', 'Рабочих записей пока нет.');
  return [
    `${l('Meeting preparation', 'Подготовка к встрече')} · ${date}`,
    `${l('Yesterday · completed', 'Вчера · сделано')} (${previousDate})\n${list(yesterday)}`,
    `${l('Today · completed', 'Сегодня · сделано')} (${date})\n${list(today)}`,
    `${l('Current work area', 'Текущая область работы')}\n${area.trim() || l('Not set.', 'Пока не указана.')}`,
    `${l('Today · plan', 'Сегодня · план')}\n${plan.trim() || l('Not set.', 'Пока не записан.')}`,
    `${l('Do not forget', 'Не забыть')}\n${dontForget.trim() || l('Nothing added.', 'Пока ничего не добавлено.')}`,
    ...(notes.trim() ? [`${l('Meeting notes', 'Заметки к встрече')}\n${notes.trim()}`] : []),
  ].join('\n\n');
}

function MeetingDay({ date, locale, timezone, refreshKey }) {
  const l = (en, ru) => words(locale, en, ru);
  const previousDate = shiftCalendarDate(date, -1);
  const [stored, setStored] = useStoredState(`main-meeting-${date}`, {
    area: 'Next useful step',
    plan: '',
    dontForget: '',
    notes: '',
  });
  const prep = {
    area: string(stored?.area),
    plan: string(stored?.plan),
    dontForget: string(stored?.dontForget),
    notes: string(stored?.notes),
  };
  const [records, setRecords] = useState({ yesterday: [], today: [] });
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [copyFallback, setCopyFallback] = useState(false);
  const [copying, setCopying] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Explicit refresh and Work's refreshKey reload the two selected dates.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const read = async (day) => {
      const response = await fetch(
        `/api/work/log?${new URLSearchParams({ date: day, timezone })}`,
        { signal: controller.signal }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || l('Work notes could not be loaded.', 'Не удалось загрузить рабочие записи.')
        );
      return data.entries || [];
    };
    Promise.all([read(previousDate), read(date)])
      .then(([yesterday, today]) => {
        if (!controller.signal.aborted) setRecords({ yesterday, today });
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [date, previousDate, timezone, revision, refreshKey]);
  const patch = (value) =>
    setStored((previous) => ({
      area: string(previous?.area),
      plan: string(previous?.plan),
      dontForget: string(previous?.dontForget),
      notes: string(previous?.notes),
      ...value,
    }));
  const brief = buildMeetingBrief({ date, previousDate, ...records, ...prep }, locale);
  async function copyBrief() {
    setCopying(true);
    setCopyStatus('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(brief);
      setCopyStatus(l('Meeting brief copied.', 'План встречи скопирован.'));
      setCopyFallback(false);
    } catch {
      setCopyFallback(true);
      setCopyStatus(l('Select and copy the text below.', 'Выделите и скопируйте текст ниже.'));
    } finally {
      setCopying(false);
    }
  }
  const completed = (title, entries, day) => (
    <section className="meeting-prep-completed">
      <div className="meeting-prep-section-heading">
        <h3>{title}</h3>
        <time dateTime={day}>{day}</time>
      </div>
      {loading ? (
        <p role="status">{l('Loading work notes…', 'Загружаем рабочие записи…')}</p>
      ) : entries.length ? (
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              <span aria-hidden="true">✓</span>
              <p>{entry.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="meeting-prep-empty">
          {l('No work notes recorded for this day yet.', 'За этот день рабочих записей пока нет.')}
        </p>
      )}
    </section>
  );
  return (
    <div className="meeting-prep-day">
      <div className="meeting-prep-records" aria-busy={loading}>
        {completed(l('Yesterday · completed', 'Вчера · сделано'), records.yesterday, previousDate)}
        {completed(l('Today · completed', 'Сегодня · сделано'), records.today, date)}
      </div>
      {error && (
        <div className="meeting-prep-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRevision((value) => value + 1)}>
            {l('Try again', 'Попробовать снова')}
          </button>
        </div>
      )}
      <div className="meeting-prep-fields">
        <label className="meeting-prep-field meeting-prep-wide">
          <span>{l('Current work area', 'Текущая область работы')}</span>
          <input
            maxLength={120}
            value={prep.area}
            onChange={(event) => patch({ area: event.target.value })}
            placeholder={l('Next useful step', 'Следующий полезный шаг')}
          />
        </label>
        <label className="meeting-prep-field">
          <span>{l('Today · plan', 'Сегодня · план')}</span>
          <textarea
            rows={4}
            maxLength={2400}
            value={prep.plan}
            onChange={(event) => patch({ plan: event.target.value })}
            placeholder={l('What will move forward next?', 'Что продвинется дальше?')}
          />
        </label>
        <label className="meeting-prep-field">
          <span>{l('Do not forget', 'Не забыть')}</span>
          <textarea
            rows={4}
            maxLength={1500}
            value={prep.dontForget}
            onChange={(event) => patch({ dontForget: event.target.value })}
            placeholder={l(
              'A question, a decision, or an important detail.',
              'Вопрос, решение или важная деталь.'
            )}
          />
        </label>
        <label className="meeting-prep-field meeting-prep-wide">
          <span>{l('Meeting notes', 'Заметки к встрече')}</span>
          <textarea
            rows={3}
            maxLength={4000}
            value={prep.notes}
            onChange={(event) => patch({ notes: event.target.value })}
            placeholder={l('What should be discussed?', 'Что хочется обсудить?')}
          />
        </label>
      </div>
      <footer className="meeting-prep-footer">
        <p>
          {l(
            'Completed items come from your work notes. Preparation is saved locally for the selected date.',
            'Сделанное берётся из рабочих записей. Подготовка сохраняется локально для выбранной даты.'
          )}
        </p>
        <div>
          <button
            type="button"
            className="demo-button demo-button-quiet"
            disabled={loading}
            onClick={() => setRevision((value) => value + 1)}
          >
            {l('Refresh notes', 'Обновить записи')}
          </button>
          <button
            type="button"
            className="demo-button"
            disabled={loading || copying || !!error}
            onClick={copyBrief}
          >
            {l('Copy meeting brief', 'Скопировать план встречи')}
          </button>
        </div>
      </footer>
      <p className="meeting-prep-copy-status" role="status" aria-live="polite">
        {copyStatus}
      </p>
      {copyFallback && (
        <label className="meeting-prep-field">
          <span>{l('Meeting brief to copy', 'План встречи для копирования')}</span>
          <textarea readOnly rows={14} value={brief} onFocus={(event) => event.target.select()} />
        </label>
      )}
    </div>
  );
}

export default function MeetingPrep({ locale = 'en', timezone = 'UTC', refreshKey = 0 }) {
  const l = (en, ru) => words(locale, en, ru);
  const id = useId();
  const today = calendarLocalDate(new Date(), timezone);
  const [date, setDate] = useState(today);
  return (
    <section className="meeting-prep" aria-labelledby={`${id}-title`}>
      <header className="meeting-prep-heading">
        <div>
          <span className="demo-eyebrow">{l('A clear conversation', 'Ясный разговор')}</span>
          <h2 id={`${id}-title`}>{l('Meeting preparation', 'Подготовка к встрече')}</h2>
          <p>
            {l(
              'Yesterday, today, and what needs to be remembered.',
              'Вчера, сегодня и то, о чём важно не забыть.'
            )}
          </p>
        </div>
      </header>
      <div className="meeting-prep-date-nav">
        <button
          type="button"
          className="demo-button demo-button-quiet"
          aria-label={l('Previous meeting day', 'Предыдущий день подготовки')}
          onClick={() => setDate(shiftCalendarDate(date, -1))}
        >
          ←
        </button>
        <label>
          <span>{l('Meeting date', 'Дата встречи')}</span>
          <input
            type="date"
            value={date}
            onChange={(event) => {
              if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setDate(event.target.value);
            }}
          />
        </label>
        <button
          type="button"
          className="demo-button demo-button-quiet"
          aria-label={l('Next meeting day', 'Следующий день подготовки')}
          onClick={() => setDate(shiftCalendarDate(date, 1))}
        >
          →
        </button>
        <button type="button" className="meeting-prep-today" onClick={() => setDate(today)}>
          {l('Today', 'Сегодня')}
        </button>
      </div>
      <MeetingDay
        key={date}
        date={date}
        locale={locale}
        timezone={timezone}
        refreshKey={refreshKey}
      />
    </section>
  );
}
