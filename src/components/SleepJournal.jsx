import { useEffect, useId, useState } from 'react';
import { useStoredState } from '../hooks/useStoredState.js';
import { calendarLocalDate, calendarWallTimeISO, shiftCalendarDate } from './EditableCalendar.jsx';

export function sleepNightMinutes({ date, bedtime, wake, wakeNextDay = true, timezone = 'UTC' }) {
  const start = calendarWallTimeISO(date, bedtime, timezone);
  const end = calendarWallTimeISO(wakeNextDay ? shiftCalendarDate(date, 1) : date, wake, timezone);
  const minutes = (Date.parse(end) - Date.parse(start)) / 60000;
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 1500)
    throw new Error(
      'The recorded interval must be positive and no longer than 25 hours. Check the next-day choice.'
    );
  return minutes;
}
export const SLEEP_FLAGS = Object.freeze(['not-recorded', 'no', 'yes']);

export function sleepObservationInput({
  difficultyFallingAsleep,
  difficultyWakingUp,
  awakenings,
  nightmares,
}) {
  if (
    !SLEEP_FLAGS.includes(difficultyFallingAsleep) ||
    !SLEEP_FLAGS.includes(difficultyWakingUp) ||
    !SLEEP_FLAGS.includes(nightmares)
  )
    throw new Error('Choose a manual sleep observation or leave it unrecorded.');
  const unrecorded = awakenings === '' || awakenings === null;
  const numericInput =
    typeof awakenings === 'number' ||
    (typeof awakenings === 'string' && /^\d{1,2}$/.test(awakenings));
  const count = unrecorded ? null : Number(awakenings);
  if (!unrecorded && (!numericInput || !Number.isInteger(count) || count < 0 || count > 30))
    throw new Error('Awakenings must be a whole number from 0 to 30, or blank.');
  return { difficultyFallingAsleep, difficultyWakingUp, awakenings: count, nightmares };
}

// Preserve recorded nights while removing the obsolete dream fields, including from edit drafts.
export function normalizeSleepNight(value) {
  const night = { ...value };
  for (const key of ['recall', 'dream', 'tags', 'dreamRecall', 'dreamStory', 'dreamTags'])
    delete night[key];
  return {
    ...night,
    difficultyFallingAsleep: SLEEP_FLAGS.includes(night.difficultyFallingAsleep)
      ? night.difficultyFallingAsleep
      : 'not-recorded',
    difficultyWakingUp: SLEEP_FLAGS.includes(night.difficultyWakingUp)
      ? night.difficultyWakingUp
      : 'not-recorded',
    awakenings:
      Number.isInteger(night.awakenings) && night.awakenings >= 0 && night.awakenings <= 30
        ? night.awakenings
        : null,
    nightmares: SLEEP_FLAGS.includes(night.nightmares) ? night.nightmares : 'not-recorded',
  };
}
export const normalizeSleepEntries = (entries) =>
  Array.isArray(entries) ? entries.map(normalizeSleepNight) : [];

export function createSleepExamples(date) {
  return [
    {
      id: 'sleep-example-latest',
      date,
      bedtime: '23:15',
      wake: '07:20',
      wakeNextDay: true,
      restfulness: 4,
      difficultyFallingAsleep: 'no',
      difficultyWakingUp: 'no',
      awakenings: 1,
      nightmares: 'no',
      example: true,
    },
    {
      id: 'sleep-example-earlier',
      date: shiftCalendarDate(date, -1),
      bedtime: '00:30',
      wake: '08:00',
      wakeNextDay: false,
      restfulness: 3,
      difficultyFallingAsleep: 'yes',
      difficultyWakingUp: 'yes',
      awakenings: 2,
      nightmares: 'yes',
      example: true,
    },
  ];
}
const emptyNight = (date) => ({
  date,
  bedtime: '23:00',
  wake: '07:00',
  wakeNextDay: true,
  restfulness: 3,
  difficultyFallingAsleep: 'not-recorded',
  difficultyWakingUp: 'not-recorded',
  awakenings: null,
  nightmares: 'not-recorded',
});

export default function SleepJournal({ locale = 'en', timezone = 'UTC' }) {
  const l = (en, ru) => (locale === 'ru' ? ru : en);
  const uid = useId().replaceAll(':', '');
  const [today] = useState(() => calendarLocalDate(new Date(), timezone));
  const [selectedDate, setSelectedDate] = useState(() => shiftCalendarDate(today, -1));
  const [storedEntries, setEntries] = useStoredState('main-sleep-journal', () =>
    createSleepExamples(shiftCalendarDate(today, -1))
  );
  const entries = normalizeSleepEntries(storedEntries);
  const normalized = JSON.stringify(entries);
  useEffect(() => {
    if (Array.isArray(storedEntries) && JSON.stringify(storedEntries) !== normalized)
      setEntries(JSON.parse(normalized));
  }, [storedEntries, normalized, setEntries]);
  const [form, setForm] = useState(null);
  const [removed, setRemoved] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const selected = entries.find((entry) => entry.date === selectedDate);
  const observationLabel = (value) =>
    ({
      no: l('No', 'Нет'),
      yes: l('Yes', 'Да'),
      'not-recorded': l('Not recorded', 'Не отмечено'),
    })[value] || l('Not recorded', 'Не отмечено');
  const duration = (entry) => {
    try {
      const minutes = sleepNightMinutes({ ...entry, timezone });
      return `${Math.floor(minutes / 60)} ${l('h', 'ч')} ${minutes % 60} ${l('min', 'мин')}`;
    } catch {
      return '-';
    }
  };
  const chooseDate = (date) => {
    if (!date) return;
    setSelectedDate(date);
    setForm(null);
    setError('');
    setStatus('');
  };
  const edit = () => {
    const entry = selected || emptyNight(selectedDate);
    setForm(normalizeSleepNight(entry));
    setError('');
    setStatus('');
  };
  const save = (event) => {
    event.preventDefault();
    setError('');
    try {
      sleepNightMinutes({ ...form, timezone });
    } catch {
      setError(
        l(
          'Check the dates and times. Wake-up must follow bedtime; use “next day” when the interval crosses midnight. A time skipped by a clock change cannot be recorded.',
          'Проверьте дату и время. Пробуждение должно быть позже отбоя; для перехода через полночь отметьте «на следующий день». Время, пропущенное при переводе часов, записать нельзя.'
        )
      );
      return;
    }
    if (!selected && entries.length >= 30) {
      setError(
        l(
          'This journal holds 30 nights. Remove an older entry explicitly before adding another.',
          'Этот журнал вмещает 30 ночей. Перед добавлением явно удалите старую запись.'
        )
      );
      return;
    }
    let observations;
    try {
      observations = sleepObservationInput(form);
    } catch {
      setError(
        l(
          'Awakenings must be a whole number from 0 to 30, or blank. Choose Yes, No or Not recorded for the other observations.',
          'Пробуждения: целое число от 0 до 30 или пустое поле. Для остальных отметок выберите «Да», «Нет» или «Не отмечено».'
        )
      );
      return;
    }
    const entry = {
      ...normalizeSleepNight(form),
      ...observations,
      id: selected?.id || crypto.randomUUID(),
      restfulness: Number(form.restfulness),
      example: false,
    };
    setEntries((previous) => [
      ...normalizeSleepEntries(previous).filter((item) => item.date !== selectedDate),
      entry,
    ]);
    setForm(null);
    setStatus(l('Sleep entry saved locally.', 'Запись о сне сохранена локально.'));
  };
  const remove = () => {
    if (!selected) return;
    setRemoved(selected);
    setEntries((previous) =>
      normalizeSleepEntries(previous).filter((entry) => entry.id !== selected.id)
    );
    setForm(null);
    setStatus(l('Entry removed. You can undo below.', 'Запись удалена. Ниже можно отменить.'));
  };
  const restore = () => {
    if (entries.some((entry) => entry.date === removed.date)) {
      setError(
        l(
          'There is already an entry for that night. Choose which one to keep before restoring.',
          'За эту ночь уже есть запись. Перед восстановлением выберите, какую оставить.'
        )
      );
      return;
    }
    setEntries((previous) => [...normalizeSleepEntries(previous), normalizeSleepNight(removed)]);
    setSelectedDate(removed.date);
    setRemoved(null);
    setStatus(l('Entry restored.', 'Запись восстановлена.'));
  };
  const update = (key, value) => setForm((previous) => ({ ...previous, [key]: value }));
  return (
    <section className="sleep-journal" aria-labelledby={`${uid}-title`}>
      <header className="sleep-journal-heading">
        <div>
          <span className="demo-eyebrow">{l('A MANUAL SLEEP LOG', 'РУЧНОЙ ЖУРНАЛ СНА')}</span>
          <h2 id={`${uid}-title`}>{l('Sleep', 'Сон')}</h2>
          <p>
            {l(
              'Record the night, how rested you feel, and any sleep disruptions.',
              'Отметьте время сна, отдых и то, что мешало спать.'
            )}
          </p>
        </div>
        <span>{timezone}</span>
      </header>
      <div className="sleep-journal-date-nav">
        <button
          type="button"
          aria-label={l('Previous night', 'Предыдущая ночь')}
          onClick={() => chooseDate(shiftCalendarDate(selectedDate, -1))}
        >
          ‹
        </button>
        <label>
          {l('Night beginning on', 'Ночь, начинающаяся')}
          <input
            type="date"
            required
            value={selectedDate}
            max={today}
            onChange={(event) => chooseDate(event.target.value)}
          />
        </label>
        <button type="button" onClick={() => chooseDate(shiftCalendarDate(today, -1))}>
          {l('Last night', 'Прошлая ночь')}
        </button>
        <button
          type="button"
          disabled={selectedDate >= today}
          aria-label={l('Next night', 'Следующая ночь')}
          onClick={() => chooseDate(shiftCalendarDate(selectedDate, 1))}
        >
          ›
        </button>
      </div>
      {form ? (
        <form className="sleep-journal-form" onSubmit={save}>
          <h3>
            {selected ? l('Edit this night', 'Изменить эту ночь') : l('A new night', 'Новая ночь')}
          </h3>
          <div className="sleep-journal-time-fields">
            <label>
              {l('Bedtime', 'Отбой')}
              <input
                type="time"
                required
                value={form.bedtime}
                onChange={(event) => update('bedtime', event.target.value)}
              />
            </label>
            <label>
              {l('Wake-up', 'Пробуждение')}
              <input
                type="time"
                required
                value={form.wake}
                onChange={(event) => update('wake', event.target.value)}
              />
            </label>
            <label>
              {l('Restfulness · manual', 'Как отдохнула · вручную')}
              <select
                value={form.restfulness}
                onChange={(event) => update('restfulness', Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value}/5
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="sleep-journal-next-day">
            <input
              type="checkbox"
              checked={form.wakeNextDay}
              onChange={(event) => update('wakeNextDay', event.target.checked)}
            />
            <span>
              {l('Wake-up on the next day', 'Пробуждение на следующий день')}
              {form.wakeNextDay ? ` · ${shiftCalendarDate(selectedDate, 1)}` : ` · ${selectedDate}`}
            </span>
          </label>
          <p className="sleep-journal-interval">
            {l('Recorded interval', 'Записанный интервал')}: <strong>{duration(form)}</strong>
          </p>
          <fieldset className="sleep-journal-observation-fields">
            <legend>
              {l(
                'Sleep disruptions · manual and optional',
                'Что мешало спать · вручную, необязательно'
              )}
            </legend>
            <label>
              {l('Difficulty falling asleep', 'Трудности с засыпанием')}
              <select
                value={form.difficultyFallingAsleep}
                onChange={(event) => update('difficultyFallingAsleep', event.target.value)}
              >
                {SLEEP_FLAGS.map((value) => (
                  <option key={value} value={value}>
                    {observationLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {l('Difficulty waking up', 'Трудно проснуться')}
              <select
                value={form.difficultyWakingUp}
                onChange={(event) => update('difficultyWakingUp', event.target.value)}
              >
                {SLEEP_FLAGS.map((value) => (
                  <option key={value} value={value}>
                    {observationLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {l('Awakenings · count', 'Пробуждения · количество')}
              <input
                type="number"
                min="0"
                max="30"
                step="1"
                value={form.awakenings ?? ''}
                onChange={(event) => update('awakenings', event.target.value)}
                placeholder={l('Not recorded', 'Не отмечено')}
              />
            </label>
            <label>
              {l('Nightmares', 'Кошмары')}
              <select
                value={form.nightmares}
                onChange={(event) => update('nightmares', event.target.value)}
              >
                {SLEEP_FLAGS.map((value) => (
                  <option key={value} value={value}>
                    {observationLabel(value)}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
          <div className="sleep-journal-actions">
            <button type="submit">{l('Save night locally', 'Сохранить ночь локально')}</button>
            <button
              type="button"
              onClick={() => {
                setForm(null);
                setError('');
              }}
            >
              {l('Cancel', 'Отмена')}
            </button>
          </div>
        </form>
      ) : selected ? (
        <>
          <div className="sleep-journal-night-grid">
            <section className="sleep-journal-night">
              <span className="demo-eyebrow">{l('THE RECORDED NIGHT', 'ЗАПИСАННАЯ НОЧЬ')}</span>
              <div className="sleep-journal-times">
                <div>
                  <small>{l('Bedtime', 'Отбой')}</small>
                  <strong>{selected.bedtime}</strong>
                  <span>{selected.date}</span>
                </div>
                <span aria-hidden="true">→</span>
                <div>
                  <small>{l('Wake-up', 'Пробуждение')}</small>
                  <strong>{selected.wake}</strong>
                  <span>
                    {selected.wakeNextDay ? shiftCalendarDate(selected.date, 1) : selected.date}
                  </span>
                </div>
              </div>
              <p>
                {l('Recorded interval', 'Записанный интервал')}:{' '}
                <strong>{duration(selected)}</strong>
              </p>
              <p>
                {l('Restfulness · your assessment', 'Как отдохнула · ваша оценка')}:{' '}
                <strong>{selected.restfulness}/5</strong>
              </p>
            </section>
            <section className="sleep-journal-observations">
              <span className="demo-eyebrow">{l('MANUAL OBSERVATIONS', 'РУЧНЫЕ ОТМЕТКИ')}</span>
              <h3>{l('Sleep disruptions', 'Что мешало спать')}</h3>
              <p>
                {l('Difficulty falling asleep', 'Трудности с засыпанием')}:{' '}
                <strong>{observationLabel(selected.difficultyFallingAsleep)}</strong>
              </p>
              <p>
                {l('Difficulty waking up', 'Трудно проснуться')}:{' '}
                <strong>{observationLabel(selected.difficultyWakingUp)}</strong>
              </p>
              <p>
                {l('Awakenings', 'Пробуждения')}:{' '}
                <strong>{selected.awakenings ?? l('Not recorded', 'Не отмечено')}</strong>
              </p>
              <p>
                {l('Nightmares', 'Кошмары')}:{' '}
                <strong>{observationLabel(selected.nightmares)}</strong>
              </p>
              {selected.example && <small>{l('Fictional example', 'Вымышленный пример')}</small>}
            </section>
          </div>
          <div className="sleep-journal-actions">
            <button type="button" onClick={edit}>
              {l('Edit this night', 'Изменить эту ночь')}
            </button>
            <button type="button" onClick={remove}>
              {l('Delete this night', 'Удалить эту ночь')}
            </button>
          </div>
        </>
      ) : (
        <div className="sleep-journal-empty">
          <p>
            {l(
              'No entry for this night yet. Record the times and add only the observations you choose.',
              'За эту ночь пока нет записи. Сохраните время и только те отметки, которые хотите.'
            )}
          </p>
          <button type="button" onClick={edit}>
            {l('Add this night', 'Добавить эту ночь')}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="sleep-journal-error">
          {error}
        </p>
      )}
      {removed && (
        <button className="sleep-journal-undo" type="button" onClick={restore}>
          {l('Undo deletion', 'Отменить удаление')} · {removed.date}
        </button>
      )}
      <details className="sleep-journal-history">
        <summary>
          {l('Night history', 'История ночей')} · {entries.length}
        </summary>
        <ol>
          {[...entries]
            .sort((left, right) => right.date.localeCompare(left.date))
            .map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  aria-pressed={entry.date === selectedDate}
                  onClick={() => chooseDate(entry.date)}
                >
                  <time dateTime={entry.date}>{entry.date}</time>
                  <span>
                    {entry.bedtime} → {entry.wake}
                  </span>
                  <strong>{duration(entry)}</strong>
                  <small>
                    {l('Restfulness', 'Отдых')} · {entry.restfulness}/5
                    {entry.example ? ` · ${l('example', 'пример')}` : ''}
                  </small>
                </button>
              </li>
            ))}
        </ol>
      </details>
      <p className="sleep-journal-note">
        {l(
          'Saved locally. The interval is elapsed time between your entries, including clock changes; it is not a sleep measurement. Restfulness, difficulty falling asleep, difficulty waking up, awakenings and nightmares are manual observations. Starting examples are fictional; no interpretations or health conclusions are generated.',
          'Сохраняется локально. Интервал - время между вашими отметками с учётом перевода часов, а не измерение сна. Отдых, трудности с засыпанием, трудности с пробуждением, ночные пробуждения и кошмары отмечаются вручную. Начальные примеры вымышлены; интерпретации и выводы о здоровье не создаются.'
        )}
      </p>
      <p role="status" className="sleep-journal-status">
        {status}
      </p>
    </section>
  );
}
