import { useId, useRef, useState } from 'react';
import { useStoredState } from '../hooks/useStoredState.js';

const text = (locale, en, ru) => (locale === 'ru' ? ru : en);
const label = (item, locale) => item[locale] || item.en;
export const LEARNING_TABS = [
  { id: 'overview', en: 'Overview', ru: 'Обзор' },
  { id: 'curriculum', en: 'Curriculum', ru: 'Программа' },
  { id: 'week', en: 'Weekly rotation', ru: 'Ритм недели' },
  { id: 'log', en: 'Session log', ru: 'Журнал занятий' },
  { id: 'resources', en: 'Resources', ru: 'Материалы' },
];
export const LEARNING_MODULES = [
  {
    id: 'attention',
    en: '01 · Paying attention',
    ru: '01 · Замечать',
    description: {
      en: 'Notice what is here before deciding what to do with it.',
      ru: 'Сначала заметить, что происходит, и лишь потом решать, что делать.',
    },
    lessons: [
      {
        id: 'notice',
        en: 'Five ordinary things',
        ru: 'Пять обычных вещей',
        minutes: 10,
        practice: {
          en: 'Look around. Write five concrete details without rating them as good or bad.',
          ru: 'Оглянитесь. Запишите пять конкретных деталей, не оценивая их как хорошие или плохие.',
        },
      },
      {
        id: 'pause',
        en: 'A pause before the next thing',
        ru: 'Пауза перед следующим делом',
        minutes: 10,
        practice: {
          en: 'Leave a small gap between two activities. Note what you wanted to rush past.',
          ru: 'Оставьте небольшой промежуток между двумя делами. Заметьте, что хотелось проскочить.',
        },
      },
      {
        id: 'walk',
        en: 'A walk without an output',
        ru: 'Прогулка без результата',
        minutes: 15,
        practice: {
          en: 'Take a short walk with no step target. Bring back one question, not a performance report.',
          ru: 'Прогуляйтесь без нормы шагов. Принесите один вопрос, а не отчёт о производительности.',
        },
      },
    ],
  },
  {
    id: 'listening',
    en: '02 · Listening',
    ru: '02 · Слушать',
    description: {
      en: 'A conversation does not always need a solution.',
      ru: 'Разговору не всегда нужно решение.',
    },
    lessons: [
      {
        id: 'listen',
        en: 'Listen without fixing',
        ru: 'Слушать, не чинить',
        minutes: 15,
        practice: {
          en: 'In an ordinary conversation, ask whether the other person wants ideas or simply company.',
          ru: 'В обычном разговоре спросите, нужны ли собеседнику идеи или просто компания.',
        },
      },
      {
        id: 'reflect',
        en: 'Say what you heard',
        ru: 'Повторить услышанное',
        minutes: 10,
        practice: {
          en: 'Summarize one point in your own words. Ask if you understood correctly.',
          ru: 'Перескажите одну мысль своими словами. Спросите, правильно ли вы поняли.',
        },
      },
      {
        id: 'question',
        en: 'One open question',
        ru: 'Один открытый вопрос',
        minutes: 10,
        practice: {
          en: 'Try a question that starts with “what” or “how”. Leave room for an unexpected answer.',
          ru: 'Попробуйте вопрос с «что» или «как». Оставьте место неожиданному ответу.',
        },
      },
    ],
  },
  {
    id: 'uncertainty',
    en: '03 · Not knowing yet',
    ru: '03 · Пока не знать',
    description: {
      en: 'Replace a premature conclusion with a small experiment.',
      ru: 'Вместо преждевременного вывода - маленький эксперимент.',
    },
    lessons: [
      {
        id: 'unknown',
        en: 'Make an unknowns list',
        ru: 'Список неизвестного',
        minutes: 10,
        practice: {
          en: 'Separate one observation, one assumption and one unanswered question.',
          ru: 'Отделите одно наблюдение, одно предположение и один открытый вопрос.',
        },
      },
      {
        id: 'experiment',
        en: 'Try the smaller version',
        ru: 'Попробовать маленькую версию',
        minutes: 15,
        practice: {
          en: 'Choose a reversible experiment that fits into fifteen minutes.',
          ru: 'Выберите обратимый эксперимент, который поместится в пятнадцать минут.',
        },
      },
      {
        id: 'change',
        en: 'Change your mind in a sentence',
        ru: 'Передумать одним предложением',
        minutes: 10,
        practice: {
          en: 'Write “I used to think …; after noticing …, I now think …”. A tentative answer is enough.',
          ru: 'Напишите: «Раньше я думал(а) …; заметив …, теперь думаю …». Предварительного ответа достаточно.',
        },
      },
    ],
  },
  {
    id: 'help',
    en: '04 · Being in company',
    ru: '04 · Быть рядом',
    description: {
      en: 'Practice asking, offering and leaving room.',
      ru: 'Практика просьб, предложений и свободного пространства.',
    },
    lessons: [
      {
        id: 'ask',
        en: 'Ask for one specific thing',
        ru: 'Попросить о чём-то конкретном',
        minutes: 10,
        practice: {
          en: 'Draft a small request with a clear scope and room for the other person to decline.',
          ru: 'Составьте небольшую конкретную просьбу, оставляя собеседнику возможность отказаться.',
        },
      },
      {
        id: 'offer',
        en: 'Offer without taking over',
        ru: 'Предложить, не перехватывать',
        minutes: 10,
        practice: {
          en: 'Ask what would actually be useful before offering a complete plan.',
          ru: 'Сначала спросите, что было бы полезно, прежде чем предлагать готовый план.',
        },
      },
      {
        id: 'enough',
        en: 'Call a small thing enough',
        ru: 'Назвать небольшое достаточным',
        minutes: 10,
        practice: {
          en: 'Write one ordinary thing that was enough today. It does not need to become a habit.',
          ru: 'Запишите одну обычную вещь, которой сегодня было достаточно. Ей не обязательно становиться привычкой.',
        },
      },
    ],
  },
];
const DAYS = [
  { id: 'mon', en: 'Mon', ru: 'Пн', lesson: 'notice', format: 'practice' },
  { id: 'tue', en: 'Tue', ru: 'Вт', lesson: 'listen', format: 'listening' },
  { id: 'wed', en: 'Wed', ru: 'Ср', lesson: 'unknown', format: 'reflection' },
  { id: 'thu', en: 'Thu', ru: 'Чт', lesson: 'ask', format: 'practice' },
  { id: 'fri', en: 'Fri', ru: 'Пт', lesson: 'question', format: 'listening' },
  { id: 'sat', en: 'Sat', ru: 'Сб', lesson: 'walk', format: 'practice' },
  { id: 'sun', en: 'Sun', ru: 'Вс', lesson: 'enough', format: 'reflection' },
];
const FORMATS = [
  { id: 'practice', en: 'Practice', ru: 'Практика' },
  { id: 'reading', en: 'Reading', ru: 'Чтение' },
  { id: 'listening', en: 'Listening', ru: 'Слушание' },
  { id: 'reflection', en: 'Reflection', ru: 'Размышление' },
];
const LESSONS = LEARNING_MODULES.flatMap((module) => module.lessons);
const INITIAL_DONE = ['notice', 'pause'];
const RESOURCES = [
  {
    id: 'field',
    en: 'A page for noticing',
    ru: 'Страница наблюдений',
    role: { en: 'A field-note template', ru: 'Шаблон полевой заметки' },
    body: {
      en: 'Where was I? What did I actually notice? What am I assuming? What question would I like to carry into tomorrow?',
      ru: 'Где я был(а)? Что действительно заметил(а)? Что предполагаю? Какой вопрос хочется взять с собой в завтра?',
    },
  },
  {
    id: 'conversation',
    en: 'The listening card',
    ru: 'Карточка слушателя',
    role: { en: 'A small conversation prompt', ru: 'Небольшая подсказка для разговора' },
    body: {
      en: 'Would you like ideas or company? What feels most important to say? Let me check that I understood. Is there something I missed?',
      ru: 'Тебе нужны идеи или компания? Что сейчас важнее всего сказать? Давай проверю, правильно ли я понял(а). Я что-то упустил(а)?',
    },
  },
  {
    id: 'review',
    en: 'A Sunday review',
    ru: 'Воскресный обзор',
    role: { en: 'Three questions, no score', ru: 'Три вопроса без оценки' },
    body: {
      en: 'What became clearer? What remains unknown? What would be a kind, practical next experiment?',
      ru: 'Что стало чуть яснее? Что остаётся неизвестным? Какой следующий эксперимент будет бережным и практичным?',
    },
  },
];

export function learningProgress(completed, lessons = LESSONS) {
  const ids = new Set(completed);
  const done = lessons.filter((lesson) => ids.has(lesson.id)).length;
  return {
    done,
    total: lessons.length,
    percent: lessons.length ? Math.round((done / lessons.length) * 100) : 0,
  };
}
export function learningDay(instant = new Date(), timezone = 'UTC') {
  const date = new Date(instant);
  const safeDate = Number.isNaN(date.getTime()) ? new Date('2026-10-07T12:00:00Z') : date;
  let day;
  try {
    day = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short' })
      .format(safeDate)
      .toLowerCase();
  } catch {
    day = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' })
      .format(safeDate)
      .toLowerCase();
  }
  return DAYS.find((item) => item.id === day)?.id || 'wed';
}
export function validateLearningSession(form) {
  const topic = String(form.topic || '')
    .trim()
    .slice(0, 160);
  const notes = String(form.notes || '')
    .trim()
    .slice(0, 1200);
  const duration = Number(form.duration);
  if (
    (!topic && !notes) ||
    !Number.isInteger(duration) ||
    duration < 1 ||
    duration > 480 ||
    !FORMATS.some((item) => item.id === form.format)
  )
    return null;
  return { topic, notes, duration, format: form.format };
}
function dateLabel(instant, timezone, locale) {
  try {
    return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
      timeZone: timezone,
      day: 'numeric',
      month: 'short',
    }).format(new Date(instant));
  } catch {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      day: 'numeric',
      month: 'short',
    }).format(new Date(instant));
  }
}

export default function LearningWorkspace({
  locale = 'en',
  timezone = 'UTC',
  initialTab = 'overview',
  onNavigate,
  onOpenProject,
}) {
  const l = (en, ru) => text(locale, en, ru);
  const uid = useId().replaceAll(':', '');
  const [tab, setTab] = useState(
    LEARNING_TABS.some((item) => item.id === initialTab) ? initialTab : 'overview'
  );
  const [moduleId, setModuleId] = useState('attention');
  const [lessonId, setLessonId] = useState('walk');
  const [completed, setCompleted] = useStoredState('learning-completed', INITIAL_DONE);
  const [day, setDay] = useState(() => learningDay(new Date(), timezone));
  const [resourceId, setResourceId] = useState('field');
  const [formatFilter, setFormatFilter] = useState('all');
  const [form, setForm] = useState({ topic: '', duration: '15', format: 'practice', notes: '' });
  const [message, setMessage] = useState('');
  const [entries, setEntries] = useStoredState('learning-entries', () => [
    {
      id: 'example-1',
      date: new Date().toISOString(),
      topic: { en: 'A pause between activities', ru: 'Пауза между делами' },
      duration: 10,
      format: 'reflection',
      notes: {
        en: 'Paused before opening the next task.',
        ru: 'Оставлено немного пространства перед следующей задачей.',
      },
      example: true,
    },
    {
      id: 'example-2',
      date: new Date().toISOString(),
      topic: { en: 'Five ordinary things', ru: 'Пять обычных вещей' },
      duration: 10,
      format: 'practice',
      notes: {
        en: 'Noticed the light on the windowsill and the sound of rain.',
        ru: 'Замечены свет на подоконнике и звук дождя.',
      },
      example: true,
    },
  ]);
  const counter = useRef(0);
  const tabRefs = useRef([]);
  const currentModule = LEARNING_MODULES.find((item) => item.id === moduleId);
  const selectedLesson = LESSONS.find((item) => item.id === lessonId);
  const rotation = DAYS.find((item) => item.id === day);
  const dayLesson = LESSONS.find((item) => item.id === rotation.lesson);
  const progress = learningProgress(completed);
  const resource = RESOURCES.find((item) => item.id === resourceId);
  const filteredEntries = entries.filter(
    (entry) => formatFilter === 'all' || entry.format === formatFilter
  );
  const totalMinutes = entries.reduce((sum, entry) => sum + entry.duration, 0);
  const toggleLesson = (id) =>
    setCompleted((old) => (old.includes(id) ? old.filter((item) => item !== id) : [...old, id]));
  const startPractice = (lesson) => {
    setForm({
      topic: label(lesson, locale),
      duration: String(lesson.minutes),
      format: rotation.format,
      notes: '',
    });
    setTab('log');
    setMessage(
      l(
        'Practice selected. Add what you noticed and log the session when you finish.',
        'Практика выбрана. После занятия добавьте наблюдения и сохраните запись.'
      )
    );
  };
  const submit = (event) => {
    event.preventDefault();
    const value = validateLearningSession(form);
    if (!value) {
      setMessage(
        l(
          'Add a topic or note and a whole duration from 1 to 480 minutes.',
          'Добавьте тему или заметку и целое время от 1 до 480 минут.'
        )
      );
      return;
    }
    setEntries((old) => [
      {
        ...value,
        id: `local-${++counter.current}`,
        date: new Date().toISOString(),
        example: false,
      },
      ...old,
    ]);
    setForm((old) => ({ ...old, topic: '', notes: '' }));
    setMessage(
      l(
        'Session added to this demo. Lesson completion remains your choice.',
        'Занятие добавлено в демо. Отмечать ли урок завершённым, решаете вы.'
      )
    );
  };
  const switchTab = (event, index) => {
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % LEARNING_TABS.length;
    if (event.key === 'ArrowLeft') next = (index + LEARNING_TABS.length - 1) % LEARNING_TABS.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = LEARNING_TABS.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    setTab(LEARNING_TABS[next].id);
    tabRefs.current[next]?.focus();
  };
  const renderLogEntry = (entry) => (
    <li key={entry.id} className="learning-workspace-log-entry">
      <div>
        <time dateTime={entry.date}>{dateLabel(entry.date, timezone, locale)}</time>
        <span>
          {entry.duration} {l('min', 'мин')} ·{' '}
          {label(
            FORMATS.find((item) => item.id === entry.format),
            locale
          )}
        </span>
      </div>
      <strong>
        {typeof entry.topic === 'string'
          ? entry.topic || l('Untitled practice', 'Практика без названия')
          : label(entry.topic, locale)}
      </strong>
      {(typeof entry.notes === 'string' ? entry.notes : label(entry.notes, locale)) && (
        <p>{typeof entry.notes === 'string' ? entry.notes : label(entry.notes, locale)}</p>
      )}
      <small>
        {entry.example
          ? l('Fictional example', 'Вымышленный пример')
          : l('Added in this demo', 'Добавлено в демо')}
      </small>
    </li>
  );
  return (
    <div className="learning-workspace">
      <header className="learning-workspace-heading">
        <span className="learning-workspace-eyebrow">
          {l('Learning · a fictional learning project', 'Learning · вымышленный учебный проект')}
        </span>
        <h2>How to be human</h2>
        <p>
          {l(
            'No certification. No final boss. Attention, practice, and a place to remember what happened.',
            'Без сертификата и финального босса. Немного внимания, немного практики и место, чтобы запомнить, что произошло.'
          )}
        </p>
        {onOpenProject && (
          <button
            type="button"
            className="learning-workspace-project-button"
            onClick={onOpenProject}
          >
            {l('Open project note', 'Открыть заметку проекта')}
          </button>
        )}
      </header>
      <section
        className="learning-workspace-stats"
        aria-label={l('Learning progress', 'Прогресс обучения')}
      >
        <div>
          <strong>
            {progress.done}
            <small> / {progress.total}</small>
          </strong>
          <span>{l('lessons completed', 'уроков завершено')}</span>
        </div>
        <div>
          <strong>
            {totalMinutes}
            <small> {l('min', 'мин')}</small>
          </strong>
          <span>{l('in the demo log', 'в демо-журнале')}</span>
        </div>
        <div>
          <strong>{LEARNING_MODULES.length}</strong>
          <span>{l('modules · your own pace', 'модуля · в своём темпе')}</span>
        </div>
        <progress
          max="100"
          value={progress.percent}
          aria-label={l('Curriculum completed', 'Программа завершена')}
        />
      </section>
      <div
        className="learning-workspace-tabs"
        role="tablist"
        aria-label={l('Learning views', 'Разделы Learning')}
      >
        {LEARNING_TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${uid}-${item.id}-tab`}
            aria-controls={`${uid}-${item.id}-panel`}
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => switchTab(event, index)}
          >
            {label(item, locale)}
          </button>
        ))}
      </div>
      {LEARNING_TABS.map((item) => (
        <section
          key={item.id}
          role="tabpanel"
          id={`${uid}-${item.id}-panel`}
          aria-labelledby={`${uid}-${item.id}-tab`}
          hidden={tab !== item.id}
          className="learning-workspace-panel"
        >
          {item.id === 'overview' && (
            <div className="learning-workspace-overview">
              <section className="learning-workspace-card learning-workspace-practice">
                <span className="learning-workspace-eyebrow">
                  {l('Today’s practice', 'Практика дня')} · {label(rotation, locale)}
                </span>
                <h3>{label(dayLesson, locale)}</h3>
                <p>{label(dayLesson.practice, locale)}</p>
                <div className="learning-workspace-actions">
                  <span>
                    {dayLesson.minutes} {l('minutes · optional', 'минут · по желанию')}
                  </span>
                  <button type="button" onClick={() => startPractice(dayLesson)}>
                    {l('Prepare a session', 'Подготовить занятие')}
                  </button>
                </div>
              </section>
              <section className="learning-workspace-card">
                <h3>{l('Continue the curriculum', 'Продолжить программу')}</h3>
                <p>
                  {l(
                    'Attention → Listening → Uncertainty → Company. Lesson checkmarks and session notes are separate: an unfinished experiment still deserves a note.',
                    'Внимание → Слушание → Неопределённость → Быть рядом. Завершённые уроки и записи занятий считаются отдельно: незаконченный эксперимент тоже можно записать.'
                  )}
                </p>
                <button type="button" onClick={() => setTab('curriculum')}>
                  {l('Open modules', 'Открыть модули')}
                </button>
              </section>
              <section className="learning-workspace-card">
                <h3>{l('This week, outside the course', 'На этой неделе, вне курса')}</h3>
                <p>
                  {l(
                    'The fictional Career garden track gives this project somewhere to practice: observe one plant before proposing a fix. “I don’t know yet” is an acceptable field note.',
                    'Вымышленное садовое направление Career даёт место для практики: понаблюдать за одним растением, прежде чем предлагать решение. «Пока не знаю» - допустимая полевая заметка.'
                  )}
                </p>
                <small>
                  {l(
                    'A shared theme, not an automatically synchronized task.',
                    'Общая тема, без автоматической синхронизации задач.'
                  )}
                </small>
              </section>
              <section className="learning-workspace-card">
                <h3>{l('Recent sessions', 'Последние занятия')}</h3>
                <ul className="learning-workspace-log">
                  {entries.slice(0, 3).map(renderLogEntry)}
                </ul>
                <button type="button" onClick={() => setTab('log')}>
                  {l('Open session log', 'Открыть журнал')}
                </button>
              </section>
            </div>
          )}
          {item.id === 'curriculum' && (
            <div className="learning-workspace-curriculum">
              <nav
                className="learning-workspace-modules"
                aria-label={l('Learning modules', 'Учебные модули')}
              >
                {LEARNING_MODULES.map((module) => {
                  const status = learningProgress(completed, module.lessons);
                  return (
                    <button
                      type="button"
                      key={module.id}
                      aria-pressed={moduleId === module.id}
                      onClick={() => {
                        setModuleId(module.id);
                        setLessonId(
                          module.lessons.find((lesson) => !completed.includes(lesson.id))?.id ||
                            module.lessons[0].id
                        );
                      }}
                    >
                      <strong>{label(module, locale)}</strong>
                      <span>
                        {status.done} / {status.total} {l('lessons', 'урока')}
                      </span>
                    </button>
                  );
                })}
              </nav>
              <section className="learning-workspace-card">
                <h3>{label(currentModule, locale)}</h3>
                <p>{label(currentModule.description, locale)}</p>
                <ul className="learning-workspace-lessons">
                  {currentModule.lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <label>
                        <input
                          type="checkbox"
                          checked={completed.includes(lesson.id)}
                          onChange={() => toggleLesson(lesson.id)}
                        />
                        <span
                          className={completed.includes(lesson.id) ? 'learning-workspace-done' : ''}
                        >
                          {label(lesson, locale)}
                        </span>
                      </label>
                      <button
                        type="button"
                        aria-pressed={lessonId === lesson.id}
                        onClick={() => setLessonId(lesson.id)}
                      >
                        {lesson.minutes} {l('min · open', 'мин · открыть')}
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="learning-workspace-lesson-detail">
                  <span className="learning-workspace-eyebrow">
                    {l('Selected lesson', 'Выбранный урок')}
                  </span>
                  <h4>{label(selectedLesson, locale)}</h4>
                  <p>{label(selectedLesson.practice, locale)}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setForm({
                        topic: label(selectedLesson, locale),
                        duration: String(selectedLesson.minutes),
                        format: 'practice',
                        notes: '',
                      });
                      setTab('log');
                      setMessage('');
                    }}
                  >
                    {l('Prepare a practice note', 'Подготовить заметку о практике')}
                  </button>
                </div>
              </section>
            </div>
          )}
          {item.id === 'week' && (
            <div className="learning-workspace-card">
              <h3>{l('A small weekly rotation', 'Небольшой ритм недели')}</h3>
              <p>
                {l(
                  'Choose a day to see its practice. This is a suggested rotation, not a streak or an obligation.',
                  'Выберите день, чтобы увидеть практику. Это предложенный ритм, а не серия достижений и не обязанность.'
                )}
              </p>
              <fieldset
                className="learning-workspace-week"
                aria-label={l('Practice days', 'Дни практики')}
              >
                {DAYS.map((entry) => (
                  <button
                    type="button"
                    key={entry.id}
                    aria-pressed={day === entry.id}
                    onClick={() => setDay(entry.id)}
                  >
                    <strong>{label(entry, locale)}</strong>
                    <span>
                      {label(
                        LESSONS.find((lesson) => lesson.id === entry.lesson),
                        locale
                      )}
                    </span>
                  </button>
                ))}
              </fieldset>
              <div className="learning-workspace-lesson-detail">
                <span className="learning-workspace-eyebrow">
                  {label(rotation, locale)} · {dayLesson.minutes} {l('min', 'мин')}
                </span>
                <h4>{label(dayLesson, locale)}</h4>
                <p>{label(dayLesson.practice, locale)}</p>
                <button type="button" onClick={() => startPractice(dayLesson)}>
                  {l('Prepare this session', 'Подготовить это занятие')}
                </button>
              </div>
            </div>
          )}
          {item.id === 'log' && (
            <div className="learning-workspace-log-layout">
              <form onSubmit={submit} className="learning-workspace-card learning-workspace-form">
                <h3>{l('Log a learning session', 'Записать занятие')}</h3>
                <label>
                  {l('Topic', 'Тема')}
                  <input
                    value={form.topic}
                    maxLength="160"
                    placeholder={l('What did you explore?', 'Что вы исследовали?')}
                    onChange={(event) => setForm((old) => ({ ...old, topic: event.target.value }))}
                  />
                </label>
                <label>
                  {l('Duration, minutes', 'Длительность, минуты')}
                  <input
                    type="number"
                    min="1"
                    max="480"
                    step="1"
                    required
                    value={form.duration}
                    onChange={(event) =>
                      setForm((old) => ({ ...old, duration: event.target.value }))
                    }
                  />
                </label>
                <label>
                  {l('Format', 'Формат')}
                  <select
                    value={form.format}
                    onChange={(event) => setForm((old) => ({ ...old, format: event.target.value }))}
                  >
                    {FORMATS.map((format) => (
                      <option key={format.id} value={format.id}>
                        {label(format, locale)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {l('What stayed with you?', 'Что запомнилось?')}
                  <textarea
                    value={form.notes}
                    maxLength="1200"
                    rows="4"
                    onChange={(event) => setForm((old) => ({ ...old, notes: event.target.value }))}
                  />
                </label>
                <button type="submit">{l('Log session', 'Записать занятие')}</button>
                <p className="learning-workspace-message" role="status">
                  {message}
                </p>
              </form>
              <section className="learning-workspace-card">
                <div className="learning-workspace-log-heading">
                  <h3>{l('Session history', 'История занятий')}</h3>
                  <label>
                    {l('Filter by format', 'Фильтр по формату')}
                    <select
                      value={formatFilter}
                      onChange={(event) => setFormatFilter(event.target.value)}
                    >
                      <option value="all">{l('All formats', 'Все форматы')}</option>
                      {FORMATS.map((format) => (
                        <option key={format.id} value={format.id}>
                          {label(format, locale)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <ul className="learning-workspace-log">{filteredEntries.map(renderLogEntry)}</ul>
                {!filteredEntries.length && (
                  <p>{l('No sessions in this format yet.', 'Занятий в этом формате пока нет.')}</p>
                )}
              </section>
            </div>
          )}
          {item.id === 'resources' && (
            <div className="learning-workspace-resource-layout">
              <div className="learning-workspace-card">
                <h3>{l('Course resources', 'Материалы курса')}</h3>
                <p>
                  {l(
                    'Three original sample cards for this fictional course. Choose one to read it here.',
                    'Три специально написанные карточки для вымышленного курса. Выберите любую, чтобы прочитать её здесь.'
                  )}
                </p>
                {onNavigate && (
                  <button
                    type="button"
                    className="learning-workspace-library-button"
                    onClick={() => onNavigate('library')}
                  >
                    {l('Browse the Library', 'Открыть Library')}
                  </button>
                )}
                <div className="learning-workspace-resources">
                  {RESOURCES.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      aria-pressed={resourceId === entry.id}
                      onClick={() => setResourceId(entry.id)}
                    >
                      <strong>{label(entry, locale)}</strong>
                      <span>{label(entry.role, locale)}</span>
                    </button>
                  ))}
                </div>
              </div>
              <article className="learning-workspace-card learning-workspace-resource-note">
                <span className="learning-workspace-eyebrow">
                  {l('Practice card', 'Карточка практики')}
                </span>
                <h3>{label(resource, locale)}</h3>
                <p>{label(resource.body, locale)}</p>
                <button
                  type="button"
                  onClick={() => {
                    setForm({
                      topic: label(resource, locale),
                      duration: '10',
                      format: 'reflection',
                      notes: '',
                    });
                    setTab('log');
                    setMessage('');
                  }}
                >
                  {l('Reflect on this card', 'Записать размышление')}
                </button>
              </article>
            </div>
          )}
        </section>
      ))}
      <p className="learning-workspace-footer">
        {l(
          'Your choices and sessions are saved in the local workspace database. No external service is changed.',
          'Выбор и записи занятий сохраняются в локальной базе пространства. Внешние сервисы не меняются.'
        )}
      </p>
    </div>
  );
}
