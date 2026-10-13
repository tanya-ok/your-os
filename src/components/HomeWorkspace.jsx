import { useId, useState } from 'react';
import { useStoredState } from '../hooks/useStoredState.js';

const text = (locale, en, ru) => (locale === 'ru' ? ru : en);
const DAY_MS = 86400000;
const THEMES = [
  ['Make room', 'Освободить место'],
  ['Small reliable routines', 'Маленькие устойчивые привычки'],
  ['A home that supports you', 'Дом, который поддерживает'],
  ['Care without a backlog', 'Забота без вечного списка дел'],
  ['An invitation to slow down', 'Приглашение замедлиться'],
  ['Keep what works', 'Оставить то, что работает'],
];

export function homeWeekDates(instant = new Date(), timezone = 'UTC', week = 3, currentWeek = 3) {
  const date = new Date(instant);
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(Number.isNaN(date.getTime()) ? new Date('2026-10-07T12:00:00Z') : date);
  }
  const get = (type) => parts.find((part) => part.type === type).value;
  const localDate = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`);
  const mondayOffset = (localDate.getUTCDay() + 6) % 7;
  const monday = localDate.getTime() - mondayOffset * DAY_MS;
  const selectedMonday = monday + (week - currentWeek) * 7 * DAY_MS;
  return Array.from({ length: 7 }, (_, index) =>
    new Date(selectedMonday + index * DAY_MS).toISOString().slice(0, 10)
  );
}

export function createHomeWeek(number, locale = 'en') {
  number = Number.isInteger(number) ? Math.min(52, Math.max(1, number)) : 3;
  const l = (en, ru) => text(locale, en, ru);
  const practices = [
    [
      l('Clear one useful surface', 'Освободить одну полезную поверхность'),
      l('Choose a place for a shared shelf', 'Найти место для общей полки'),
      l('Leave room for a field notebook', 'Оставить место полевому блокноту'),
    ],
    [
      l('Try a ten-minute morning pause', 'Попробовать десять минут утренней паузы'),
      l('Listen without preparing a reply', 'Послушать, не готовя ответ'),
      l('Notice the light on one plant', 'Заметить свет на одном растении'),
    ],
    [
      l('Make a comfortable reading corner', 'Устроить уютный уголок для чтения'),
      l('Make time for an unhurried conversation', 'Найти время для неспешного разговора'),
      l('Keep one evening free of plans', 'Оставить один вечер без планов'),
    ],
    [
      l('Observe one growing space', 'Понаблюдать за растущим садом'),
      l('Ask for help with one small thing', 'Попросить помощи в одном небольшом деле'),
      l('Let one unnecessary task go', 'Отпустить одно ненужное дело'),
    ],
    [
      l('Take a walk without an output', 'Прогуляться без результата'),
      l('Share a quiet cup of tea', 'Разделить спокойную чашку чая'),
      l('Leave one question unanswered for now', 'Пока оставить один вопрос открытым'),
    ],
    [
      l('Keep one routine that helped', 'Оставить одну привычку, которая помогла'),
      l('Tell someone what became clearer', 'Рассказать, что стало яснее'),
      l(
        'Choose a small experiment for next week',
        'Выбрать маленький эксперимент на следующую неделю'
      ),
    ],
  ];
  const tasks = practices[(number - 1) % 6].map((title, index) => [
    title,
    [l('Home', 'Дом'), l('Relationships', 'Отношения'), l('Self', 'Для себя')][index],
  ]);
  return {
    theme: THEMES[(number - 1) % 6][locale === 'ru' ? 1 : 0],
    phrase:
      number === 4
        ? l(
            'Keep the useful part. Leave room for what comes next.',
            'Оставить полезное. Освободить место для следующего шага.'
          )
        : l('Care, repeated, is enough.', 'Немного заботы, снова и снова, уже достаточно.'),
    context:
      number === 4
        ? l(
            'Last week, a smaller plan helped. This week, keep the quiet corner and make time to observe one growing space.',
            'На прошлой неделе помог небольшой план. На этой - оставить тихий уголок и найти время понаблюдать за растущим садом.'
          )
        : l(
            'A quiet week of making everyday life easier. Choose what helps; the rest can wait.',
            'Спокойная неделя, чтобы сделать повседневность легче. Выбрать то, что помогает; остальное может подождать.'
          ),
    focus: l(
      'A comfortable corner, one shared moment, and enough room to rest.',
      'Уютный уголок, один совместный момент и достаточно места для отдыха.'
    ),
    tasks: tasks.map(([title, area], index) => ({
      id: `home-${number}-${index}`,
      title,
      area,
      done: number < 3 || (number === 3 && index === 0),
    })),
    days: Array.from({ length: 7 }, (_, index) => ({
      focus: [
        l('Make a small beginning', 'Начать с малого'),
        l('Care for a shared space', 'Позаботиться об общем пространстве'),
        l('Separate an observation from an assumption', 'Отделить наблюдение от предположения'),
        l('Listen without rushing', 'Послушать без спешки'),
        l('Close one open loop', 'Завершить одно небольшое дело'),
        l('Enjoy the space you made', 'Насладиться тем, что получилось'),
        l('Notice what helped', 'Заметить, что помогло'),
      ][index],
      word: [
        l('Begin', 'Начать'),
        l('Listen', 'Слушать'),
        l('Notice', 'Заметить'),
        l('Ask', 'Попросить'),
        l('Wonder', 'Удивиться'),
        l('Walk', 'Пройтись'),
        l('Enough', 'Достаточно'),
      ][index],
      thought: l(
        'Before fixing anything, notice what is already here.',
        'Прежде чем что-то исправлять, заметить то, что уже есть.'
      ),
    })),
    tracker: Array.from({ length: 3 }, (_, row) =>
      Array.from(
        { length: 7 },
        (_, day) => number < 3 || (number === 3 && day < 2 && (row !== 2 || day === 0))
      )
    ),
    review:
      number < 3
        ? {
            helped: l(
              'Keeping the plan small made it easier to return to it.',
              'Небольшой план помогал возвращаться к нему.'
            ),
            change: l(
              'Leave more space between errands.',
              'Оставлять больше времени между делами.'
            ),
            next: l(
              'Carry one helpful routine into next week.',
              'Взять одну полезную привычку в следующую неделю.'
            ),
          }
        : { helped: '', change: '', next: '' },
  };
}

export default function HomeWorkspace({ locale = 'en', timezone = 'UTC', instant, settings = {} }) {
  const l = (en, ru) => text(locale, en, ru);
  const id = useId();
  const [anchor] = useState(() => (instant ? new Date(instant) : new Date()));
  const totalWeeks = settings.homeWeeks || 6;
  const todayDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(anchor);
  const programmeDay = settings.homeStartDate
    ? Math.max(
        1,
        Math.floor(
          (new Date(`${todayDate}T12:00Z`) - new Date(`${settings.homeStartDate}T12:00Z`)) / DAY_MS
        ) + 1
      )
    : null;
  const currentWeek = Math.min(
    totalWeeks,
    programmeDay ? Math.ceil(programmeDay / 7) : settings.homeCurrentWeek || 3
  );
  const [selectedWeek, setSelectedWeek] = useState(currentWeek);
  const [expanded, setExpanded] = useState(false);
  const [currentDay] = useState(() => {
    const today = homeWeekDates(anchor, timezone, currentWeek, currentWeek);
    let date;
    try {
      date = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(anchor);
    } catch {
      date = anchor.toISOString().slice(0, 10);
    }
    return Math.max(0, today.indexOf(date));
  });
  const [selectedDay, setSelectedDay] = useState(currentDay);
  const [weeks, setWeeks] = useStoredState('home-weeks', {});
  // Each locale has its own example text; edits remain attached to their selected week.
  const key = `${locale}-${selectedWeek}`;
  const week = weeks[key] || createHomeWeek(selectedWeek, locale);
  const update = (change) =>
    setWeeks((previous) => ({
      ...previous,
      [key]: { ...(previous[key] || createHomeWeek(selectedWeek, locale)), ...change },
    }));
  const dates = homeWeekDates(anchor, timezone, selectedWeek, currentWeek);
  const format = (date, options) =>
    new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
      timeZone: 'UTC',
      ...options,
    }).format(new Date(`${date}T12:00:00Z`));
  const completed = week.tasks.filter((task) => task.done).length;
  const dayNumber = Math.min(
    totalWeeks * 7,
    programmeDay || (currentWeek - 1) * 7 + currentDay + 1
  );
  const period = (number) => {
    const weekDates = homeWeekDates(anchor, timezone, number, currentWeek);
    return `${format(weekDates[0], { day: 'numeric', month: 'short' })} - ${format(weekDates[6], { day: 'numeric', month: 'short' })}`;
  };
  const selectWeek = (number) => setSelectedWeek(Math.min(totalWeeks, Math.max(1, number)));
  const sectionData = [
    [
      'support',
      l('Support & rest', 'Поддержка и отдых'),
      l(
        'A quieter evening, a short walk, or asking for help. Pick one thing that feels useful.',
        'Тихий вечер, небольшая прогулка или просьба о помощи. Выбрать что-то одно, что пригодится.'
      ),
    ],
    [
      'relationships',
      l('Relationships', 'Отношения'),
      l(
        'One unrushed conversation. There is no need to solve everything at once.',
        'Один неспешный разговор. Не обязательно решать всё сразу.'
      ),
    ],
    [
      'self',
      l('Self & identity', 'Я и мои ориентиры'),
      l(
        'What would make this week feel like your own?',
        'Что поможет почувствовать, что эта неделя ваша?'
      ),
    ],
    [
      'home',
      l('Home', 'Дом'),
      l(
        'Keep a small corner ready for something you enjoy.',
        'Подготовить небольшой уголок для того, что нравится.'
      ),
    ],
    [
      'materials',
      l('Materials', 'Материалы'),
      l(
        'A notebook, a comfortable chair, and the things already at hand.',
        'Блокнот, удобное кресло и то, что уже есть под рукой.'
      ),
    ],
  ];
  return (
    <div className="home-workspace">
      <header className="home-workspace-heading">
        <div>
          <span className="demo-eyebrow">
            {l('Home · a six-week journey', 'Home · путь на шесть недель')}
          </span>
          <h2>
            {settings.homeTitle && settings.homeTitle !== 'My Home'
              ? settings.homeTitle
              : l('My Home', 'Мой дом')}
          </h2>
          <p>
            {l(
              'Toward a place, and a pace, that feel like yours.',
              'К своему пространству и своему темпу.'
            )}
          </p>
        </div>
        <div
          className="home-workspace-progress"
          role="img"
          aria-label={l(
            `Day ${dayNumber} of ${totalWeeks * 7}`,
            `День ${dayNumber} из ${totalWeeks * 7}`
          )}
        >
          <svg viewBox="0 0 100 100" aria-hidden="true">
            <circle cx="50" cy="50" r="42" />
            <circle
              className="home-workspace-progress-value"
              cx="50"
              cy="50"
              r="42"
              strokeDasharray={`${(dayNumber / (totalWeeks * 7)) * 264} 264`}
            />
          </svg>
          <span>
            <strong>{dayNumber}</strong>
            <small>{l('day', 'день')}</small>
          </span>
        </div>
      </header>
      <section className="home-week-list" aria-labelledby={`${id}-weeks`}>
        <div className="home-workspace-section-heading">
          <h3 id={`${id}-weeks`}>{l('Weeks', 'Недели')}</h3>
          <span>{l('Your pace. No deadline.', 'Свой темп. Без дедлайна.')}</span>
        </div>
        {Array.from({ length: totalWeeks }, (_, index) => THEMES[index % 6]).map((theme, index) => {
          const number = index + 1;
          if (
            !expanded &&
            number !== currentWeek &&
            number !== currentWeek + 1 &&
            number !== selectedWeek
          )
            return null;
          const current = number === currentWeek;
          const saved = weeks[`${locale}-${number}`];
          return (
            <button
              key={number}
              type="button"
              className={`home-week-choice ${number === selectedWeek ? 'home-week-selected' : ''}`}
              aria-pressed={number === selectedWeek}
              onClick={() => selectWeek(number)}
            >
              <span className="home-week-number">{String(number).padStart(2, '0')}</span>
              <span className="home-week-choice-text">
                <strong>{saved?.theme || theme[locale === 'ru' ? 1 : 0]}</strong>
                <small>
                  {l('Days', 'Дни')} {(number - 1) * 7 + 1}-{number * 7} · {period(number)}
                </small>
              </span>
              <span className="home-week-status">
                {current
                  ? l('Current', 'Сейчас')
                  : number < currentWeek
                    ? l('Completed', 'Завершена')
                    : l('Ahead', 'Впереди')}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          className="home-workspace-text-button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? l('Collapse weeks ↑', 'Свернуть недели ↑')
            : l(`Show all ${totalWeeks} weeks ↓`, `Показать все ${totalWeeks} недель ↓`)}
        </button>
      </section>
      <section className="home-week-detail" aria-labelledby={`${id}-selected-week`}>
        <div className="home-workspace-section-heading home-week-navigation">
          <div>
            <span className="demo-eyebrow">{period(selectedWeek)}</span>
            <h3 id={`${id}-selected-week`}>
              {l('Week', 'Неделя')} {selectedWeek}
              {selectedWeek === currentWeek && <small>{l('current', 'текущая')}</small>}
            </h3>
          </div>
          <div className="home-week-arrows">
            <button
              type="button"
              aria-label={l('Previous home week', 'Предыдущая неделя Home')}
              disabled={selectedWeek === 1}
              onClick={() => selectWeek(selectedWeek - 1)}
            >
              ←
            </button>
            <button
              type="button"
              aria-label={l('Next home week', 'Следующая неделя Home')}
              disabled={selectedWeek === totalWeeks}
              onClick={() => selectWeek(selectedWeek + 1)}
            >
              →
            </button>
          </div>
        </div>
        <label className="home-week-theme">
          <span>{l('Theme of the week', 'Тема недели')}</span>
          <input
            value={week.theme}
            onChange={(event) => update({ theme: event.target.value })}
            maxLength={160}
          />
        </label>
        <blockquote className="home-week-phrase">{week.phrase}</blockquote>
        <fieldset className="home-week-day-strip" aria-label={l('Day of the week', 'День недели')}>
          {dates.map((date, index) => (
            <button
              type="button"
              key={date}
              aria-pressed={selectedDay === index}
              onClick={() => setSelectedDay(index)}
            >
              <span>{format(date, { weekday: 'short' })}</span>
              <strong>{format(date, { day: 'numeric' })}</strong>
            </button>
          ))}
        </fieldset>
        <p className="home-day-word">
          <span>{l('Word of the day', 'Слово дня')}</span> ·{' '}
          <strong>{week.days[selectedDay].word}</strong>
        </p>
        <blockquote className="home-week-phrase">{week.days[selectedDay].thought}</blockquote>
        <label className="home-week-day-focus">
          <span>
            {l('Day focus', 'Фокус дня')} ·{' '}
            {format(dates[selectedDay], { weekday: 'long', day: 'numeric', month: 'short' })}
          </span>
          <textarea
            rows={2}
            maxLength={600}
            value={week.days[selectedDay].focus}
            onChange={(event) =>
              update({
                days: week.days.map((day, index) =>
                  index === selectedDay ? { ...day, focus: event.target.value } : day
                ),
              })
            }
          />
        </label>
        <div className="home-workspace-section-heading">
          <h4>{l('Tasks', 'Задачи')}</h4>
          <span>
            {completed} / {week.tasks.length}
          </span>
        </div>
        <div className="home-week-tasks">
          {week.tasks.map((task) => (
            <label
              key={task.id}
              className={`home-week-task ${task.done ? 'home-week-task-done' : ''}`}
            >
              <input
                type="checkbox"
                checked={task.done}
                onChange={() =>
                  update({
                    tasks: week.tasks.map((item) =>
                      item.id === task.id ? { ...item, done: !item.done } : item
                    ),
                  })
                }
              />
              <span>
                <strong>{task.title}</strong>
                <small>{task.area}</small>
              </span>
            </label>
          ))}
        </div>
        <div className="home-workspace-section-heading">
          <h4>{l('Tracker', 'Трекер')}</h4>
          <span>{l('Small things count', 'Маленькие шаги считаются')}</span>
        </div>
        <div className="home-week-tracker-scroll">
          <table className="home-week-tracker">
            <thead>
              <tr>
                <th scope="col">{l('Practice', 'Практика')}</th>
                {dates.map((date) => (
                  <th scope="col" key={date}>
                    {format(date, { weekday: 'short' })}
                    <small>{format(date, { day: 'numeric' })}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                l('Fresh air', 'Немного свежего воздуха'),
                l('A small home reset', 'Немного порядка'),
                l('An unhurried pause', 'Неспешная пауза'),
              ].map((habit, row) => (
                <tr key={habit}>
                  <th scope="row">{habit}</th>
                  {dates.map((date, day) => (
                    <td key={date}>
                      <input
                        type="checkbox"
                        aria-label={`${habit} · ${format(date, { weekday: 'long', day: 'numeric', month: 'short' })}`}
                        checked={week.tracker[row][day]}
                        onChange={() =>
                          update({
                            tracker: week.tracker.map((values, index) =>
                              index === row
                                ? values.map((value, column) => (column === day ? !value : value))
                                : values
                            ),
                          })
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="home-week-sections">
          <details open>
            <summary>{l('Context', 'Контекст')}</summary>
            <p>{week.context}</p>
          </details>
          <details open>
            <summary>{l('Focus areas', 'Фокус внимания')}</summary>
            <p>{week.focus}</p>
          </details>
          {sectionData.map(([section, title, body]) => (
            <details key={`${selectedWeek}-${section}`}>
              <summary>{title}</summary>
              <p>{body}</p>
            </details>
          ))}
        </div>
        <section className="home-week-review" aria-labelledby={`${id}-review`}>
          <div className="home-workspace-section-heading">
            <h4 id={`${id}-review`}>{l('Week review', 'Обзор недели')}</h4>
            <span>{l('Notice, then adjust', 'Заметить и скорректировать')}</span>
          </div>
          {[
            ['helped', l('What helped?', 'Что помогло?')],
            ['change', l('What would you change?', 'Что хочется изменить?')],
            ['next', l('What will you take into next week?', 'Что взять в следующую неделю?')],
          ].map(([field, label]) => (
            <label key={field}>
              <span>{label}</span>
              <textarea
                rows={2}
                maxLength={2000}
                value={week.review[field]}
                placeholder={l('A few words are enough…', 'Достаточно нескольких слов…')}
                onChange={(event) =>
                  update({ review: { ...week.review, [field]: event.target.value } })
                }
              />
            </label>
          ))}
        </section>
      </section>
      <section className="home-workspace-components">
        <div className="home-workspace-section-heading">
          <h3>{l('Five components', 'Пять составляющих')}</h3>
        </div>
        {[
          l('Space', 'Пространство'),
          l('Routines', 'Ритмы'),
          l('Relationships', 'Отношения'),
          l('Self', 'Я'),
          l('Rest', 'Отдых'),
        ].map((component, index) => (
          <div key={component}>
            <span className="home-week-number">{String(index + 1).padStart(2, '0')}</span>
            <span>{component}</span>
            <small>
              {index < 2 ? l('Taking shape', 'Обретает форму') : l('Growing', 'Растёт')}
            </small>
          </div>
        ))}
      </section>
    </div>
  );
}
