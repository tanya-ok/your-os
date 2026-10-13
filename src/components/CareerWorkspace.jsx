import { useId, useState } from 'react';
import { useStoredState } from '../hooks/useStoredState.js';

export const CAREER_TABS = [
  ['week', 'Week', 'Неделя'],
  ['overview', 'Overview', 'Обзор'],
  ['timeline', 'Timeline', 'План перехода'],
  ['skills', 'Skills', 'Навыки'],
  ['profile', 'Profile', 'Профиль'],
  ['studylog', 'Study Log', 'Журнал учёбы'],
];
const text = (locale, en, ru) => (locale === 'ru' ? ru : en);

export function careerISOWeek(instant = new Date(), timezone = 'UTC') {
  let date = new Date(instant);
  if (!Number.isFinite(date.getTime())) date = new Date('2026-10-07T12:00:00Z');
  const options = { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' };
  let parts;
  try {
    parts = new Intl.DateTimeFormat('en-CA', options).formatToParts(date);
  } catch {
    parts = new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' }).formatToParts(date);
  }
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  const day = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return careerWeekFromMonday(day);
}

export function careerWeekFromMonday(monday, offset = 0) {
  let start = new Date(monday);
  if (!Number.isFinite(start.getTime())) start = new Date('2026-10-05T00:00:00Z');
  const shift = Number.isInteger(offset) && Math.abs(offset) <= 5200 ? offset : 0;
  start.setUTCDate(start.getUTCDate() + shift * 7);
  const thursday = new Date(start);
  thursday.setUTCDate(start.getUTCDate() + 3);
  const year = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((thursday - yearStart) / 86400000 + 1) / 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    year,
    week,
    key: `${year}-W${String(week).padStart(2, '0')}`,
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

const TASKS = [
  {
    id: 'soil',
    group: ['Practice', 'Практика'],
    title: ['Compare two soil samples', 'Сравнить два образца почвы'],
    detail: [
      'Observe texture, moisture and drainage. Write what you see.',
      'Описать структуру, влажность и дренаж. Записать наблюдения.',
    ],
    done: true,
  },
  {
    id: 'light',
    group: ['Practice', 'Практика'],
    title: ['Draw a light map of one garden bed', 'Нарисовать карту света одной грядки'],
    detail: ['Morning, noon and evening observations.', 'Наблюдения утром, днём и вечером.'],
    done: false,
  },
  {
    id: 'path',
    group: ['Explore the path', 'Исследовать направление'],
    title: ['Compare garden work and forest stewardship', 'Сравнить работу в саду и заботу о лесе'],
    detail: [
      'Tasks, supervision, seasonality and what remains unknown.',
      'Задачи, наставничество, сезонность и открытые вопросы.',
    ],
    done: false,
  },
  {
    id: 'reflect',
    group: ['Review', 'Обзор'],
    title: ['Describe one thing that grew without a sprint', 'Описать то, что выросло без спринта'],
    detail: [
      'An observation, not another performance metric.',
      'Наблюдение, а не очередная метрика эффективности.',
    ],
    done: false,
  },
];
const SKILLS = [
  {
    id: 'soil',
    en: 'Soil & compost',
    ru: 'Почва и компост',
    value: 1,
    evidence: ['Compared two sample textures', 'Сравнила структуру двух образцов'],
    tasks: [
      ['Describe a soil sample', 'Описать образец почвы'],
      ['Sketch a compost cycle', 'Нарисовать цикл компоста'],
    ],
  },
  {
    id: 'plants',
    en: 'Plant observation',
    ru: 'Наблюдение за растениями',
    value: 0,
    evidence: ['', ''],
    tasks: [
      ['Identify three plants with a guide', 'Определить три растения по справочнику'],
      ['Keep a seven-day observation log', 'Вести дневник наблюдений семь дней'],
    ],
  },
  {
    id: 'tools',
    en: 'Tools & safe practice',
    ru: 'Инструменты и безопасная практика',
    value: 0,
    evidence: ['', ''],
    tasks: [
      ['List questions for a supervisor', 'Составить вопросы наставнику'],
      ['Plan a supervised introduction', 'Запланировать знакомство под руководством наставника'],
    ],
  },
  {
    id: 'systems',
    en: 'Systems thinking',
    ru: 'Системное мышление',
    value: 2,
    evidence: [
      'Mapped water, shade and access as one system',
      'Связала воду, тень и доступ в одной схеме',
    ],
    tasks: [
      ['Map water and shade', 'Связать на карте воду и тень'],
      ['Explain one feedback loop', 'Описать одну петлю обратной связи'],
    ],
  },
];

export default function CareerWorkspace({
  locale = 'en',
  timezone = 'UTC',
  initialTab = 'week',
  onOpenProject,
}) {
  const l = (en, ru) => text(locale, en, ru);
  const pick = (pair) => pair[locale === 'ru' ? 1 : 0];
  const uid = useId().replaceAll(':', '');
  const [tab, setTab] = useState(() =>
    CAREER_TABS.some(([key]) => key === initialTab) ? initialTab : 'week'
  );
  const [base] = useState(() => careerISOWeek(new Date(), timezone));
  const [offset, setOffset] = useState(0);
  const week = careerWeekFromMonday(`${base.start}T00:00:00Z`, offset);
  const [path, setPath] = useStoredState('career-path', 'garden');
  const [checked, setChecked] = useStoredState('career-checked', {});
  const [reviews, setReviews] = useStoredState('career-reviews', {});
  const [reviewEditing, setReviewEditing] = useState(false);
  const [status, setStatus] = useState('');
  const [skills, setSkills] = useStoredState('career-skills', () =>
    SKILLS.map((skill) => ({ ...skill, evidence: pick(skill.evidence) }))
  );
  const [expanded, setExpanded] = useState('soil');
  const [milestones, setMilestones] = useStoredState('career-milestones', {});
  const [profile, setProfile] = useStoredState('career-profile', {
    title: l(
      'Senior IT specialist of everything → beginner with a watering can',
      'Senior IT specialist of everything → новичок с лейкой'
    ),
    statement: l(
      'I bring patient observation and systems thinking to learning garden care. I am exploring the work before choosing a role.',
      'Переношу внимательное наблюдение и системное мышление в изучение ухода за садом. Сначала исследую работу, затем выбираю роль.'
    ),
  });
  const [editingProfile, setEditingProfile] = useState(false);
  const [sessions, setSessions] = useStoredState('career-sessions', () => [
    {
      id: 'example-session',
      week: base.key,
      date: base.start,
      track: 'soil',
      minutes: 25,
      topic: l('Soil as a living system', 'Почва как живая система'),
      notes: l(
        'Sketch the cycle; ask what a healthy sample looks like.',
        'Нарисовать цикл; уточнить, как выглядит здоровый образец.'
      ),
      energy: 3,
    },
  ]);
  const [form, setForm] = useState({ track: 'soil', minutes: 25, topic: '', notes: '', energy: 3 });
  const [nextId, setNextId] = useState(1);
  const weekSessions = sessions.filter((session) => session.week === week.key);
  const isDone = (task) => checked[`${week.key}:${task.id}`] ?? (offset === 0 && task.done);
  const done = TASKS.filter(isDone).length;
  const review = reviews[week.key] || { got: '', learned: '', next: '' };
  const pathName =
    path === 'garden'
      ? l('Garden care', 'Уход за садом')
      : l('Forest stewardship', 'Забота о лесе');
  const announce = (message) => setStatus(message);
  const changeTab = (next) => {
    setTab(next);
    setStatus('');
  };
  const setReview = (key, value) =>
    setReviews((previous) => ({ ...previous, [week.key]: { ...review, [key]: value } }));
  const patchSession = (id, key, value) =>
    setSessions((previous) =>
      previous.map((session) => (session.id === id ? { ...session, [key]: value } : session))
    );
  const addSession = (event) => {
    event.preventDefault();
    if (
      !form.topic.trim() ||
      !Number.isInteger(Number(form.minutes)) ||
      Number(form.minutes) < 1 ||
      Number(form.minutes) > 480
    )
      return;
    setSessions((previous) => [
      {
        ...form,
        topic: form.topic.trim(),
        notes: form.notes.trim(),
        minutes: Number(form.minutes),
        id: `practice-${nextId}`,
        week: week.key,
        date: week.start,
      },
      ...previous,
    ]);
    setNextId((value) => value + 1);
    setForm((previous) => ({ ...previous, topic: '', notes: '' }));
    announce(l('Practice added to the selected week.', 'Практика добавлена в выбранную неделю.'));
  };

  return (
    <div className="career-workspace">
      <header className="career-workspace-heading">
        <div>
          <span className="career-workspace-eyebrow">
            {l('Career · a new direction', 'Career · новое направление')}
          </span>
          <h2>{l('Gardening for beginners', 'Садоводство для начинающих')}</h2>
          <p>
            {l(
              'From “Senior IT specialist of everything” to keeping something alive without a deployment.',
              'От «Senior IT specialist of everything» к заботе о том, что растёт без деплоя.'
            )}
          </p>
        </div>
        <div className="career-workspace-header-actions">
          <span className="career-workspace-badge">{pathName}</span>
          {onOpenProject && (
            <button type="button" onClick={onOpenProject}>
              {l('Open project note', 'Открыть заметку проекта')} ↗
            </button>
          )}
        </div>
      </header>
      <div
        className="career-workspace-tabs"
        role="tablist"
        aria-label={l('Career sections', 'Разделы Career')}
      >
        {CAREER_TABS.map(([key, en, ru], index) => (
          <button
            key={key}
            type="button"
            role="tab"
            id={`${uid}-tab-${key}`}
            aria-controls={`${uid}-panel`}
            aria-selected={tab === key}
            tabIndex={tab === key ? 0 : -1}
            onClick={() => changeTab(key)}
            onKeyDown={(event) => {
              let next;
              if (event.key === 'ArrowRight') next = (index + 1) % CAREER_TABS.length;
              if (event.key === 'ArrowLeft')
                next = (index + CAREER_TABS.length - 1) % CAREER_TABS.length;
              if (event.key === 'Home') next = 0;
              if (event.key === 'End') next = CAREER_TABS.length - 1;
              if (next !== undefined) {
                event.preventDefault();
                changeTab(CAREER_TABS[next][0]);
                event.currentTarget.parentElement.querySelectorAll('[role="tab"]')[next].focus();
              }
            }}
          >
            {l(en, ru)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${uid}-panel`}
        aria-labelledby={`${uid}-tab-${tab}`}
        className="career-workspace-content"
      >
        {tab === 'week' && (
          <>
            <div className="career-workspace-week-heading">
              <div>
                <span className="career-workspace-eyebrow">
                  {week.key} · {l('Phase 1 · observe', 'Этап 1 · наблюдать')}
                </span>
                <h3>
                  {offset < 0
                    ? l('Notice before changing', 'Наблюдать, прежде чем менять')
                    : offset > 0
                      ? l('One small growing experiment', 'Один маленький эксперимент с ростом')
                      : l('Start with the ground beneath your feet', 'Начать с почвы под ногами')}
                </h3>
                <p>
                  {week.start} - {week.end}
                </p>
              </div>
              <div className="career-workspace-week-nav">
                <button
                  type="button"
                  disabled={offset <= -1}
                  aria-label={l('Previous career week', 'Предыдущая неделя Career')}
                  onClick={() => {
                    setOffset((value) => value - 1);
                    setReviewEditing(false);
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  disabled={offset === 0}
                  onClick={() => {
                    setOffset(0);
                    setReviewEditing(false);
                  }}
                >
                  {l('Current', 'Текущая')}
                </button>
                <button
                  type="button"
                  disabled={offset >= 1}
                  aria-label={l('Next career week', 'Следующая неделя Career')}
                  onClick={() => {
                    setOffset((value) => value + 1);
                    setReviewEditing(false);
                  }}
                >
                  ›
                </button>
              </div>
            </div>
            <div className="career-workspace-progress">
              <progress
                value={done}
                max={TASKS.length}
                aria-label={l('Week task progress', 'Прогресс задач недели')}
              />
              <span>
                {done}/{TASKS.length} {l('steps', 'шагов')}
              </span>
            </div>
            <div className="career-workspace-columns">
              {[
                ['Practice', 'Практика'],
                ['Explore the path', 'Исследовать направление'],
                ['Review', 'Обзор'],
              ].map((group) => (
                <section className="career-workspace-card" key={group[0]}>
                  <h4>{pick(group)}</h4>
                  {TASKS.filter((task) => task.group[0] === group[0]).map((task) => (
                    <label className="career-workspace-task" key={task.id}>
                      <input
                        type="checkbox"
                        checked={isDone(task)}
                        onChange={() =>
                          setChecked((previous) => ({
                            ...previous,
                            [`${week.key}:${task.id}`]: !isDone(task),
                          }))
                        }
                      />
                      <span>
                        <strong>{pick(task.title)}</strong>
                        <small>{pick(task.detail)}</small>
                      </span>
                    </label>
                  ))}
                </section>
              ))}
            </div>
            <section className="career-workspace-card">
              <div className="career-workspace-section-heading">
                <h4>{l('Study log · this week', 'Журнал учёбы · эта неделя')}</h4>
                <button type="button" onClick={() => changeTab('studylog')}>
                  {l('Add practice', 'Добавить практику')} ↗
                </button>
              </div>
              {weekSessions.length ? (
                <div className="career-workspace-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>{l('Topic', 'Тема')}</th>
                        <th>{l('Minutes', 'Минуты')}</th>
                        <th>{l('Reflection', 'Наблюдение')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weekSessions.map((session) => (
                        <tr key={session.id}>
                          <td>{session.topic}</td>
                          <td>{session.minutes}</td>
                          <td>
                            <input
                              aria-label={l(
                                `Reflection for ${session.topic}`,
                                `Наблюдение: ${session.topic}`
                              )}
                              value={session.notes}
                              onChange={(event) =>
                                patchSession(session.id, 'notes', event.target.value)
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>
                  {l(
                    'No practice logged for this week yet.',
                    'В этой неделе ещё нет записей о практике.'
                  )}
                </p>
              )}
            </section>
            <section className="career-workspace-card">
              <div className="career-workspace-section-heading">
                <h4>{l('Week review', 'Обзор недели')}</h4>
                <button
                  type="button"
                  onClick={() => {
                    setReviewEditing(!reviewEditing);
                    if (reviewEditing)
                      announce(l('Review saved for this week.', 'Обзор этой недели сохранён.'));
                  }}
                >
                  {reviewEditing
                    ? l('Save review', 'Сохранить обзор')
                    : l('Edit review', 'Заполнить обзор')}
                </button>
              </div>
              <div className="career-workspace-columns">
                {[
                  ['got', 'What I did', 'Что сделала'],
                  ['learned', 'What I learned', 'Что узнала'],
                  ['next', 'Next week', 'На следующую неделю'],
                ].map(([key, en, ru]) => (
                  <div key={key}>
                    {reviewEditing ? (
                      <label>
                        {l(en, ru)}
                        <textarea
                          rows="3"
                          value={review[key]}
                          onChange={(event) => setReview(key, event.target.value)}
                        />
                      </label>
                    ) : (
                      <>
                        <h5>{l(en, ru)}</h5>
                        <p>
                          {review[key] ||
                            l('Leave a short observation.', 'Оставить короткое наблюдение.')}
                        </p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
        {tab === 'overview' && (
          <>
            <section className="career-workspace-manifesto">
              <span aria-hidden="true">✳</span>
              <h3>{l('A career can grow sideways.', 'Карьера может расти в сторону.')}</h3>
              <p>
                {l(
                  'Less “own the entire stack”. More “understand this patch of earth”. Technical experience stays useful; being a beginner is allowed.',
                  'Меньше «отвечать за весь стек». Больше «понять этот клочок земли». Инженерный опыт остаётся полезным; быть новичком разрешается.'
                )}
              </p>
            </section>
            <section className="career-workspace-card">
              <h4>{l('Choose a direction to explore', 'Выбрать направление для исследования')}</h4>
              <div className="career-workspace-paths">
                {[
                  [
                    'garden',
                    'Garden care',
                    'Уход за садом',
                    'A small bed, soil, plants and seasonal care.',
                    'Небольшая грядка, почва, растения и сезонный уход.',
                  ],
                  [
                    'forest',
                    'Forest stewardship',
                    'Забота о лесе',
                    'Observation, habitat, routes and supervised field practice.',
                    'Наблюдение, среда обитания, маршруты и полевая практика с наставником.',
                  ],
                ].map(([key, en, ru, detailEn, detailRu]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={path === key}
                    onClick={() => {
                      setPath(key);
                      announce(
                        l('Exploration direction updated.', 'Направление исследования обновлено.')
                      );
                    }}
                  >
                    <strong>{l(en, ru)}</strong>
                    <span>{l(detailEn, detailRu)}</span>
                  </button>
                ))}
              </div>
            </section>
            <div className="career-workspace-columns">
              <section className="career-workspace-card">
                <h4>{l('Positioning', 'Позиционирование')}</h4>
                <p>{profile.statement}</p>
              </section>
              <section className="career-workspace-card">
                <h4>{l('Convergence', 'Что переносится из IT')}</h4>
                <dl>
                  <dt>{l('Observability → observation', 'Observability → наблюдение')}</dt>
                  <dd>
                    {l(
                      'Notice a pattern before changing the system.',
                      'Сначала заметить закономерность, затем менять систему.'
                    )}
                  </dd>
                  <dt>
                    {l('Incident review → field notes', 'Разбор инцидента → полевые заметки')}
                  </dt>
                  <dd>
                    {l(
                      'Record conditions and learn without blame.',
                      'Записывать условия и учиться без поиска виноватого.'
                    )}
                  </dd>
                </dl>
              </section>
              <section className="career-workspace-card">
                <h4>{l('Requirements to investigate', 'Что предстоит выяснить')}</h4>
                <ul>
                  <li>
                    {l(
                      'A mentor and supervised introduction',
                      'Наставник и вводная практика под руководством'
                    )}
                  </li>
                  <li>
                    {l(
                      'Local rules and necessary training',
                      'Местные правила и необходимое обучение'
                    )}
                  </li>
                  <li>
                    {l(
                      'Seasonal schedule and realistic workload',
                      'Сезонность и реалистичная нагрузка'
                    )}
                  </li>
                </ul>
                <p className="career-workspace-muted">
                  {l(
                    'An exploration plan, not a job opening or qualification.',
                    'План исследования, а не вакансия или квалификация.'
                  )}
                </p>
              </section>
            </div>
          </>
        )}
        {tab === 'timeline' && (
          <>
            <div className="career-workspace-section-heading">
              <div>
                <span className="career-workspace-eyebrow">{pathName}</span>
                <h3>{l('From stack traces to forest paths', 'От stack trace к лесной тропе')}</h3>
              </div>
              <span>
                {l(
                  'Three experiments, no promised deadline',
                  'Три эксперимента, без обещания дедлайна'
                )}
              </span>
            </div>
            <ol className="career-workspace-timeline">
              {[
                [
                  'observe',
                  '01',
                  'Observe',
                  'Наблюдать',
                  'Sketch the site; compare soil, light and water.',
                  'Нарисовать участок; сравнить почву, свет и воду.',
                ],
                [
                  'practice',
                  '02',
                  'Practise with support',
                  'Практиковаться с поддержкой',
                  path === 'forest'
                    ? 'Plan a supervised field visit and habitat observation.'
                    : 'Care for one small bed and record what changes.',
                  path === 'forest'
                    ? 'Запланировать полевой выход с наставником и наблюдение за средой.'
                    : 'Ухаживать за одной маленькой грядкой и записывать изменения.',
                ],
                [
                  'decide',
                  '03',
                  'Review the fit',
                  'Проверить, подходит ли',
                  'Compare the work imagined with the work experienced.',
                  'Сравнить представление о работе с полученным опытом.',
                ],
              ].map(([key, number, en, ru, detailEn, detailRu]) => (
                <li className="career-workspace-card" key={key}>
                  <span className="career-workspace-phase-number">{number}</span>
                  <div>
                    <h4>{l(en, ru)}</h4>
                    <p>{l(detailEn, detailRu)}</p>
                    <label className="career-workspace-task">
                      <input
                        type="checkbox"
                        checked={!!milestones[key]}
                        onChange={() =>
                          setMilestones((previous) => ({ ...previous, [key]: !previous[key] }))
                        }
                      />
                      <span>{l('Checkpoint reviewed', 'Контрольная точка рассмотрена')}</span>
                    </label>
                  </div>
                </li>
              ))}
            </ol>
            <section className="career-workspace-card">
              <h4>{l('Risks & buffers', 'Риски и запас')}</h4>
              <div className="career-workspace-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{l('Uncertainty', 'Неопределённость')}</th>
                      <th>{l('Buffer', 'Запас')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>{l('Weather changes the plan', 'Погода меняет планы')}</td>
                      <td>
                        {l(
                          'Keep an indoor reading alternative',
                          'Оставить вариант с чтением в помещении'
                        )}
                      </td>
                    </tr>
                    <tr>
                      <td>
                        {l(
                          'A title sounds better than the daily work',
                          'Название привлекает больше, чем ежедневная работа'
                        )}
                      </td>
                      <td>
                        {l(
                          'Try a small supervised practice first',
                          'Сначала попробовать небольшую практику с наставником'
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
        {tab === 'skills' && (
          <>
            <div className="career-workspace-section-heading">
              <div>
                <span className="career-workspace-eyebrow">
                  {l('A roadmap of practice', 'Карта практики')}
                </span>
                <h3>{l('Evidence before a shiny badge', 'Опыт раньше красивого бейджа')}</h3>
              </div>
              <p>{l('Self-assessment, not certification.', 'Самооценка, а не сертификация.')}</p>
            </div>
            <div className="career-workspace-skill-grid">
              {skills.map((skill) => (
                <button
                  type="button"
                  key={skill.id}
                  aria-expanded={expanded === skill.id}
                  aria-controls={`${uid}-skill-${skill.id}`}
                  onClick={() => setExpanded(expanded === skill.id ? null : skill.id)}
                >
                  <strong>{l(skill.en, skill.ru)}</strong>
                  <span>
                    {skill.value}/3 · {l('self-assessment', 'самооценка')}
                  </span>
                  <progress max="3" value={skill.value} aria-label={l(skill.en, skill.ru)} />
                </button>
              ))}
            </div>
            {skills.map(
              (skill) =>
                expanded === skill.id && (
                  <section
                    className="career-workspace-card"
                    id={`${uid}-skill-${skill.id}`}
                    key={skill.id}
                  >
                    <h4>{l(skill.en, skill.ru)}</h4>
                    <div className="career-workspace-form-grid">
                      <label>
                        {l('Current level', 'Текущий уровень')}
                        <select
                          value={skill.value}
                          onChange={(event) =>
                            setSkills((previous) =>
                              previous.map((item) =>
                                item.id === skill.id
                                  ? { ...item, value: Number(event.target.value) }
                                  : item
                              )
                            )
                          }
                        >
                          {[
                            [0, 'Not tried', 'Не пробовала'],
                            [1, 'With guidance', 'С подсказкой'],
                            [2, 'Practising', 'Практикую'],
                            [3, 'Can explain and repeat', 'Могу объяснить и повторить'],
                          ].map(([value, en, ru]) => (
                            <option key={value} value={value}>
                              {value} · {l(en, ru)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {l('Evidence or observation', 'Опыт или наблюдение')}
                        <input
                          value={skill.evidence}
                          onChange={(event) =>
                            setSkills((previous) =>
                              previous.map((item) =>
                                item.id === skill.id
                                  ? { ...item, evidence: event.target.value }
                                  : item
                              )
                            )
                          }
                        />
                      </label>
                    </div>
                    <h5>{l('Learning roadmap tasks', 'Задачи карты обучения')}</h5>
                    {skill.tasks.map((task, index) => {
                      const key = `skill:${skill.id}:${index}`;
                      return (
                        <label key={key} className="career-workspace-task">
                          <input
                            type="checkbox"
                            checked={!!checked[key]}
                            onChange={() =>
                              setChecked((previous) => ({ ...previous, [key]: !previous[key] }))
                            }
                          />
                          <span>{pick(task)}</span>
                        </label>
                      );
                    })}
                  </section>
                )
            )}
          </>
        )}
        {tab === 'profile' && (
          <>
            <section className="career-workspace-card">
              <div className="career-workspace-section-heading">
                <h3>{l('A profile in progress', 'Профиль в процессе')}</h3>
                <button
                  type="button"
                  onClick={() => {
                    setEditingProfile(!editingProfile);
                    if (editingProfile)
                      announce(
                        l('Profile saved for this session.', 'Профиль сохранён в этом сеансе.')
                      );
                  }}
                >
                  {editingProfile
                    ? l('Save profile', 'Сохранить профиль')
                    : l('Edit profile', 'Изменить профиль')}
                </button>
              </div>
              {editingProfile ? (
                <div className="career-workspace-form-grid">
                  <label>
                    {l('Headline', 'Заголовок')}
                    <input
                      value={profile.title}
                      onChange={(event) =>
                        setProfile((previous) => ({ ...previous, title: event.target.value }))
                      }
                    />
                  </label>
                  <label>
                    {l('Positioning statement', 'Позиционирование')}
                    <textarea
                      value={profile.statement}
                      rows="4"
                      onChange={(event) =>
                        setProfile((previous) => ({ ...previous, statement: event.target.value }))
                      }
                    />
                  </label>
                </div>
              ) : (
                <>
                  <h4>{profile.title}</h4>
                  <p>{profile.statement}</p>
                </>
              )}
            </section>
            <div className="career-workspace-columns">
              <section className="career-workspace-card">
                <h4>{l('Transferable experience', 'Переносимый опыт')}</h4>
                <p>
                  {l(
                    'Describe systems clearly. Keep a useful log. Ask what changed. Know when to ask for help.',
                    'Понятно описывать системы. Вести полезный журнал. Спрашивать, что изменилось. Знать, когда нужна помощь.'
                  )}
                </p>
              </section>
              <section className="career-workspace-card">
                <h4>{l('Proof of practice', 'Следы практики')}</h4>
                <p>
                  {l(
                    'A light map, a soil sketch and the notes in Study Log. No invented credentials.',
                    'Карта света, схема почвы и заметки в журнале учёбы. Без выдуманных квалификаций.'
                  )}
                </p>
                <button type="button" onClick={() => changeTab('studylog')}>
                  {l('Open Study Log', 'Открыть журнал')} ↗
                </button>
              </section>
            </div>
          </>
        )}
        {tab === 'studylog' && (
          <>
            <section className="career-workspace-card">
              <span className="career-workspace-eyebrow">{week.key}</span>
              <h3>{l('Log a study or field session', 'Записать учёбу или полевую практику')}</h3>
              <form className="career-workspace-form" onSubmit={addSession}>
                <div className="career-workspace-form-grid">
                  <label>
                    {l('Track', 'Направление')}
                    <select
                      value={form.track}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, track: event.target.value }))
                      }
                    >
                      {SKILLS.map((skill) => (
                        <option key={skill.id} value={skill.id}>
                          {l(skill.en, skill.ru)}
                        </option>
                      ))}
                      <option value="forest">{l('Forest stewardship', 'Забота о лесе')}</option>
                    </select>
                  </label>
                  <label>
                    {l('Minutes', 'Минуты')}
                    <input
                      required
                      type="number"
                      min="1"
                      max="480"
                      step="1"
                      value={form.minutes}
                      onChange={(event) =>
                        setForm((previous) => ({ ...previous, minutes: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <label>
                  {l('Section / topic', 'Раздел / тема')}
                  <input
                    required
                    maxLength="200"
                    value={form.topic}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, topic: event.target.value }))
                    }
                    placeholder={l('What did you explore?', 'Что исследовала?')}
                  />
                </label>
                <label>
                  {l('Notes / reflection', 'Заметки / наблюдения')}
                  <textarea
                    rows="3"
                    maxLength="2000"
                    value={form.notes}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, notes: event.target.value }))
                    }
                  />
                </label>
                <label>
                  {l('Energy · manual', 'Энергия · вручную')}
                  <select
                    value={form.energy}
                    onChange={(event) =>
                      setForm((previous) => ({ ...previous, energy: Number(event.target.value) }))
                    }
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}/5
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" disabled={!form.topic.trim()}>
                  {l('Log session', 'Записать занятие')}
                </button>
              </form>
            </section>
            <section className="career-workspace-card">
              <div className="career-workspace-section-heading">
                <h4>{l('Recent sessions', 'Последние занятия')}</h4>
                <span>
                  {sessions.reduce((sum, session) => sum + session.minutes, 0)}{' '}
                  {l('minutes in this demo', 'минут в этом примере')}
                </span>
              </div>
              {sessions.map((session) => (
                <article className="career-workspace-log-entry" key={session.id}>
                  <div>
                    <small>
                      {session.week} · {session.minutes} {l('min', 'мин')} ·{' '}
                      {l('Energy', 'Энергия')} {session.energy}/5
                    </small>
                    <h5>{session.topic}</h5>
                    <p>{session.notes || l('No reflection added.', 'Без наблюдения.')}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={l(
                      `Remove session: ${session.topic}`,
                      `Удалить занятие: ${session.topic}`
                    )}
                    onClick={() => {
                      setSessions((previous) => previous.filter((item) => item.id !== session.id));
                      announce(l('Practice entry removed.', 'Запись о практике удалена.'));
                    }}
                  >
                    {l('Remove', 'Удалить')}
                  </button>
                </article>
              ))}
            </section>
          </>
        )}
      </div>
      <p className="career-workspace-status" role="status">
        {status}
      </p>
    </div>
  );
}
