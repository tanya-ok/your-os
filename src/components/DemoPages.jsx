import { useEffect, useRef, useState } from 'react';
import { checkInGuidance } from '../../lib/checkin-guidance.js';
import { useStoredState } from '../hooks/useStoredState.js';
import CareerWorkspace from './CareerWorkspace.jsx';
import EditableCalendar, { calendarLocalDate } from './EditableCalendar.jsx';
import HomeWorkspace from './HomeWorkspace.jsx';
import LearningWorkspace from './LearningWorkspace.jsx';
import LibraryWorkspace from './LibraryWorkspace.jsx';

export { LIBRARY_REFERENCE } from './LibraryWorkspace.jsx';

import MeetingPrep from './MeetingPrep.jsx';
import RhythmGraph from './RhythmGraph.jsx';
import SleepJournal from './SleepJournal.jsx';
import WorkHistory from './WorkHistory.jsx';
import WorkSession from './WorkSession.jsx';

const choose = (locale, en, ru) => (locale === 'ru' ? ru : en);
const valueLabel = (value, locale) =>
  typeof value === 'string' ? value : value[locale] || value.en;
let sequence = 0;
const sessionId = () => `session-${++sequence}`;

function DemoNote({ locale, publicReference = false, persistent = false }) {
  return (
    <div className="demo-notice">
      <span aria-hidden="true">◇</span>
      <p>
        <strong>
          {publicReference
            ? choose(locale, 'Demo shelf', 'Демо-полка')
            : persistent
              ? choose(locale, 'Saved locally', 'Сохраняется локально')
              : choose(locale, 'Sample notes', 'Пример заметок')}
        </strong>{' '}
        ·{' '}
        {choose(
          locale,
          publicReference
            ? 'One real book is included as a public reference. Reading statuses and other entries are examples. Changes reset on reload and do not change your notes.'
            : persistent
              ? 'An example you can shape. Your edits are kept locally; connected services are changed only through an explicit action.'
              : 'A fictional life, with room to try your own choices. Panel edits last until reload; project notes are saved separately.',
          publicReference
            ? 'Одна настоящая книга добавлена как открытая библиографическая запись. Статусы чтения и остальные записи - примеры. Изменения сбрасываются при перезагрузке и не меняют ваши заметки.'
            : persistent
              ? 'Пример, который можно менять под себя. Правки остаются локально; подключённые сервисы меняются только через отдельное действие.'
              : 'Вымышленная история, в которой можно попробовать свои решения. Правки панели живут до перезагрузки; заметки проектов сохраняются отдельно.'
        )}
      </p>
    </div>
  );
}

function Check({ checked, onChange, children, detail, locale, disabled = false }) {
  return (
    <label className={`demo-check-row ${checked ? 'demo-is-checked' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span>
        <strong>{children}</strong>
        {detail && <small>{detail}</small>}
      </span>
      {checked && (
        <span className="demo-done-label" aria-hidden="true">
          {choose(locale, 'Done', 'Готово')}
        </span>
      )}
    </label>
  );
}

function PageHeading({ eyebrow, title, description, children }) {
  return (
    <header className="demo-page-heading">
      <div>
        <span className="demo-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
    </header>
  );
}

function CheckIn({ locale, checkIn, onCheckIn, compact = false }) {
  const l = (en, ru) => choose(locale, en, ru);
  const values = { energy: 3, mood: 7, ...checkIn };
  const guidance = checkInGuidance(values.energy, values.mood, locale);
  const current = { energy: guidance.energy.value, mood: guidance.mood.value };
  return (
    <div className={`rhythm-check-in ${compact ? 'rhythm-compact' : ''}`}>
      <div className="rhythm-check-in-heading">
        <h3>{l('A check-in, on your terms', 'Свериться с собой')}</h3>
        <span>{l('Manual · your choice', 'Вручную · ваш выбор')}</span>
      </div>
      <div className="rhythm-ranges">
        <label
          className="rhythm-range rhythm-energy-range"
          data-band={guidance.energy.band}
          style={{
            '--checkin-color': guidance.energy.color,
            '--checkin-track-color': guidance.energy.trackColor,
          }}
        >
          <span>
            <strong>{l('Energy', 'Энергия')}</strong>
            <output>
              {current.energy} <small>/ 5</small>
            </output>
          </span>
          <input
            type="range"
            aria-label={l('Energy', 'Энергия')}
            min="1"
            max="5"
            step="1"
            value={current.energy}
            onChange={(event) => onCheckIn?.({ ...current, energy: Number(event.target.value) })}
          />
          <span className="rhythm-range-ends">
            <small>{l('Low', 'Мало')}</small>
            <small>{l('High', 'Много')}</small>
          </span>
        </label>
        <label
          className="rhythm-range rhythm-mood-range"
          data-band={guidance.mood.band}
          style={{
            '--checkin-color': guidance.mood.color,
            '--checkin-track-color': guidance.mood.trackColor,
          }}
        >
          <span>
            <strong>{l('Mood', 'Настроение')}</strong>
            <output>
              {current.mood} <small>/ 10</small>
            </output>
          </span>
          <input
            type="range"
            aria-label={l('Mood', 'Настроение')}
            min="1"
            max="10"
            step="1"
            value={current.mood}
            onChange={(event) => onCheckIn?.({ ...current, mood: Number(event.target.value) })}
          />
          <span className="rhythm-range-ends">
            <small>1</small>
            <small>10</small>
          </span>
        </label>
      </div>
      <p className="rhythm-checkin-guidance" data-tier={guidance.tier} aria-live="polite">
        <span>{l('A pace for today', 'Ориентир на сегодня')}</span>
        <strong>{guidance.advice}</strong>
      </p>
      <p>
        {l(
          'You choose these values. The clock and lighting never change them.',
          'Эти значения выбираете вы. Время и освещение не влияют на них.'
        )}
      </p>
    </div>
  );
}

export function MainRhythm({
  locale = 'en',
  phase = 'day',
  checkIn,
  onCheckIn,
  instant,
  timezone = 'UTC',
  motionDisabled = false,
}) {
  return (
    <section className="rhythm-panel" aria-labelledby="rhythm-title">
      <RhythmGraph
        locale={locale}
        phase={phase}
        instant={instant}
        timezone={timezone}
        motionDisabled={motionDisabled}
      />
      <CheckIn locale={locale} checkIn={checkIn} onCheckIn={onCheckIn} compact />
      <p className="rhythm-footnote">
        {choose(
          locale,
          'Your check-in is saved locally for today.',
          'Ваш чек-ин сохраняется локально на сегодня.'
        )}
      </p>
    </section>
  );
}

function WorkTimeBlocks({ locale, timezone }) {
  const l = (en, ru) => choose(locale, en, ru);
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone || 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [blocks, setBlocks] = useStoredState(`main-work-blocks-${date}`, () => [
    {
      id: 'opening',
      start: '08:30',
      end: '09:00',
      title: { en: 'A quiet opening', ru: 'Спокойное начало' },
      type: 'personal',
      note: {
        en: 'Review the day and choose one clear priority.',
        ru: 'Посмотреть планы и выбрать один ясный приоритет.',
      },
      done: true,
    },
    {
      id: 'deep',
      start: '09:00',
      end: '10:30',
      title: { en: 'Focus: outline the field guide', ru: 'Фокус: план полевого справочника' },
      type: 'focus',
      note: {
        en: 'A small draft is enough. Keep the first section in view.',
        ru: 'Достаточно небольшого черновика. Начать с первого раздела.',
      },
      done: false,
    },
    {
      id: 'space',
      start: '10:30',
      end: '11:00',
      title: { en: 'Open space', ru: 'Немного свободного места' },
      type: 'break',
      note: {
        en: 'Unscheduled time. Leave it open, or move something here.',
        ru: 'Свободное время. Можно оставить его пустым или перенести сюда дело.',
      },
      done: false,
    },
    {
      id: 'admin',
      start: '11:00',
      end: '11:30',
      title: { en: 'Messages & loose ends', ru: 'Сообщения и открытые вопросы' },
      type: 'admin',
      note: {
        en: 'Reply to the workshop question and clarify one inbox item.',
        ru: 'Ответить на вопрос о мастерской и разобрать один пункт входящих.',
      },
      done: false,
    },
    {
      id: 'home',
      start: '17:30',
      end: '18:00',
      title: { en: 'Home reset', ru: 'Немного порядка дома' },
      type: 'personal',
      note: {
        en: 'Make tomorrow’s first small step easier.',
        ru: 'Сделать первый шаг завтрашнего дня чуть проще.',
      },
      done: false,
    },
  ]);
  const [selected, setSelected] = useState('deep');
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('14:00');
  const current = blocks.find((block) => block.id === selected);
  const complete = blocks.filter((block) => block.done).length;
  function add(event) {
    event.preventDefault();
    if (!title.trim()) return;
    const id = sessionId();
    setBlocks(
      [
        ...blocks,
        {
          id,
          start: time,
          end: '',
          title: title.trim(),
          type: 'focus',
          note: l('Your session-only time block.', 'Ваш временный блок в этом сеансе.'),
          done: false,
        },
      ].sort((a, b) => a.start.localeCompare(b.start))
    );
    setTitle('');
    setSelected(id);
  }
  return (
    <>
      <PageHeading
        eyebrow={l('WORK · TIME BLOCKS', 'РАБОТА · БЛОКИ ВРЕМЕНИ')}
        title={l('Plan your workday.', 'План рабочего дня.')}
        description={l(
          'Plan a few anchors, leave some space, and choose what comes next.',
          'Наметьте несколько опор, оставьте паузы и выберите следующий шаг.'
        )}
      >
        <span className="demo-large-stat">
          {complete}
          <small>
            / {blocks.length} {l('blocks', 'блоков')}
          </small>
        </span>
      </PageHeading>
      <div className="demo-today-layout">
        <section
          className="demo-card demo-timeline"
          aria-label={l('Work time blocks', 'Рабочие блоки времени')}
        >
          {blocks.map((block) => (
            <button
              key={block.id}
              type="button"
              className={`demo-time-block demo-block-${block.type} ${selected === block.id ? 'demo-selected' : ''} ${block.done ? 'demo-is-checked' : ''}`}
              aria-pressed={selected === block.id}
              onClick={() => setSelected(block.id)}
            >
              <span className="demo-block-time">
                {block.start}
                <small>{block.end || '·'}</small>
              </span>
              <span className="demo-block-line" aria-hidden="true" />
              <span className="demo-block-copy">
                <strong>{valueLabel(block.title, locale)}</strong>
                <small>
                  {l(
                    {
                      focus: 'Focus time',
                      personal: 'Personal',
                      break: 'Open space',
                      admin: 'Small tasks',
                    }[block.type],
                    {
                      focus: 'Время фокуса',
                      personal: 'Личное',
                      break: 'Свободно',
                      admin: 'Небольшие дела',
                    }[block.type]
                  )}
                </small>
              </span>
              <span className="demo-block-check" aria-hidden="true">
                {block.done ? '✓' : '↗'}
              </span>
            </button>
          ))}
        </section>
        <aside className="demo-card demo-block-detail" aria-live="polite">
          <span className="demo-eyebrow">{l('IN FOCUS', 'В ФОКУСЕ')}</span>
          <h3>
            {current ? valueLabel(current.title, locale) : l('Choose a block', 'Выберите блок')}
          </h3>
          {current && (
            <>
              <p>{valueLabel(current.note, locale)}</p>
              <div className="demo-detail-time">
                {current.start}
                {current.end && ` - ${current.end}`}
              </div>
              <button
                type="button"
                className="demo-button"
                onClick={() =>
                  setBlocks(
                    blocks.map((block) =>
                      block.id === current.id ? { ...block, done: !block.done } : block
                    )
                  )
                }
              >
                {current.done
                  ? l('Mark as open', 'Вернуть в планы')
                  : l('Complete this block', 'Завершить блок')}{' '}
                <span aria-hidden="true">✓</span>
              </button>
            </>
          )}
        </aside>
      </div>
      <form className="demo-card demo-inline-form" onSubmit={add}>
        <label className="demo-field">
          <span>{l('Add a time block', 'Добавить блок времени')}</span>
          <input
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={l('A small, specific intention', 'Небольшое конкретное намерение')}
            required
          />
        </label>
        <label className="demo-field demo-time-input">
          <span>{l('Starts', 'Начало')}</span>
          <input
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            required
          />
        </label>
        <button type="submit" className="demo-button demo-secondary">
          {l('Add block', 'Добавить')} +
        </button>
      </form>
    </>
  );
}

function GTD({ locale }) {
  const l = (en, ru) => choose(locale, en, ru);
  const [items, setItems] = useState([
    {
      id: 'g1',
      title: { en: 'A weekend workshop idea', ru: 'Идея мастерской на выходных' },
      status: 'inbox',
      done: false,
    },
    {
      id: 'g2',
      title: {
        en: 'Ask about a room for the reading group',
        ru: 'Узнать о комнате для читательской группы',
      },
      status: 'inbox',
      done: false,
    },
    {
      id: 'g3',
      title: { en: 'Draft three field-guide headings', ru: 'Написать три заголовка справочника' },
      status: 'next',
      done: false,
    },
    {
      id: 'g4',
      title: { en: 'Choose two library books', ru: 'Выбрать две книги в библиотеке' },
      status: 'next',
      done: false,
    },
    {
      id: 'g5',
      title: { en: 'Community room confirmation', ru: 'Подтверждение комнаты для встречи' },
      status: 'waiting',
      done: false,
    },
    {
      id: 'g6',
      title: { en: 'Learn a new printmaking technique', ru: 'Освоить новую технику печати' },
      status: 'someday',
      done: false,
    },
  ]);
  const [tab, setTab] = useState('inbox');
  const [capture, setCapture] = useState('');
  const [clarifying, setClarifying] = useState(null);
  const [nextText, setNextText] = useState('');
  const [destination, setDestination] = useState('next');
  const names = {
    inbox: l('Inbox', 'Входящие'),
    next: l('Next', 'Дальше'),
    waiting: l('Waiting', 'Ожидает'),
    someday: l('Someday', 'Когда-нибудь'),
  };
  function add(event) {
    event.preventDefault();
    if (!capture.trim()) return;
    setItems([...items, { id: sessionId(), title: capture.trim(), status: 'inbox', done: false }]);
    setCapture('');
    setTab('inbox');
  }
  function clarify(item) {
    setClarifying(item.id);
    setNextText(valueLabel(item.title, locale));
    setDestination('next');
  }
  function move(event) {
    event.preventDefault();
    if (!nextText.trim()) return;
    setItems(
      items.map((item) =>
        item.id === clarifying
          ? { ...item, title: nextText.trim(), status: destination, done: false }
          : item
      )
    );
    setClarifying(null);
    setTab(destination);
  }
  return (
    <>
      <PageHeading
        eyebrow={l('GTD · GATHER & CLARIFY', 'GTD · СОБРАТЬ И ПРОЯСНИТЬ')}
        title={l('Give each loose end a place.', 'Найдите место каждому делу.')}
        description={l(
          'Capture first. Then decide what is actionable, waiting, or simply a possibility.',
          'Сначала запишите. Затем решите: действие, ожидание или возможность на будущее.'
        )}
      />
      <form className="demo-card demo-gtd-capture" onSubmit={add}>
        <label className="demo-field">
          <span>{l('Capture into the demo inbox', 'Добавить во входящие демо')}</span>
          <input
            value={capture}
            maxLength={200}
            onChange={(event) => setCapture(event.target.value)}
            placeholder={l(
              'A thought to get out of your head…',
              'Мысль, которую хочется освободить из головы…'
            )}
            required
          />
        </label>
        <button type="submit" className="demo-button">
          {l('Capture', 'Записать')} +
        </button>
      </form>
      <nav className="demo-list-tabs" aria-label={l('GTD lists', 'Списки GTD')}>
        {Object.entries(names).map(([key, name]) => (
          <button
            type="button"
            key={key}
            className={tab === key ? 'demo-active' : ''}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {name}
            <span>{items.filter((item) => item.status === key && !item.done).length}</span>
          </button>
        ))}
      </nav>
      <section className="demo-card demo-gtd-list" aria-labelledby="demo-gtd-title">
        <div className="demo-section-heading">
          <h3 id="demo-gtd-title">{names[tab]}</h3>
          <p>
            {tab === 'inbox'
              ? l('What is it? Is there a next action?', 'Что это? Есть ли здесь следующий шаг?')
              : tab === 'waiting'
                ? l(
                    'Things that need an answer or someone else’s action.',
                    'То, что ожидает ответа или действий других.'
                  )
                : tab === 'someday'
                  ? l(
                      'Possibilities without a promise to do them today.',
                      'Возможности без обещания сделать их сегодня.'
                    )
                  : l(
                      'Concrete, visible actions you can choose from.',
                      'Конкретные действия, из которых можно выбирать.'
                    )}
          </p>
        </div>
        {items
          .filter((item) => item.status === tab)
          .map((item) => (
            <div className="demo-gtd-row" key={item.id}>
              <Check
                locale={locale}
                checked={item.done}
                onChange={() =>
                  setItems(
                    items.map((entry) =>
                      entry.id === item.id ? { ...entry, done: !entry.done } : entry
                    )
                  )
                }
              >
                {valueLabel(item.title, locale)}
              </Check>
              <button type="button" className="demo-text-button" onClick={() => clarify(item)}>
                {tab === 'inbox' ? l('Clarify', 'Прояснить') : l('Move', 'Переместить')} ↗
              </button>
            </div>
          ))}
        {!items.some((item) => item.status === tab) && (
          <p className="demo-empty">
            {l(
              'Clear space. Capture or move something here when needed.',
              'Здесь свободно. Можно записать или перенести сюда дело.'
            )}
          </p>
        )}
      </section>
      {clarifying && (
        <form className="demo-card demo-clarify" onSubmit={move}>
          <span className="demo-eyebrow">{l('ONE THOUGHT AT A TIME', 'ПО ОДНОЙ МЫСЛИ')}</span>
          <h3>{l('What would moving forward look like?', 'Как выглядит следующий шаг?')}</h3>
          <label className="demo-field">
            <span>{l('A clear action or reminder', 'Понятное действие или напоминание')}</span>
            <input
              value={nextText}
              maxLength={200}
              onChange={(event) => setNextText(event.target.value)}
              required
            />
          </label>
          <label className="demo-field">
            <span>{l('Give it a place', 'Выберите место')}</span>
            <select value={destination} onChange={(event) => setDestination(event.target.value)}>
              {['next', 'waiting', 'someday', 'inbox'].map((key) => (
                <option value={key} key={key}>
                  {names[key]}
                </option>
              ))}
            </select>
          </label>
          <div className="demo-form-actions">
            <button
              type="button"
              className="demo-button demo-secondary"
              onClick={() => setClarifying(null)}
            >
              {l('Cancel', 'Отмена')}
            </button>
            <button type="submit" className="demo-button">
              {l('Move to list', 'Перенести в список')} →
            </button>
          </div>
        </form>
      )}
    </>
  );
}

export function demoWeekDates(offset = 0) {
  const monday = new Date(Date.UTC(2026, 9, 5 + Math.trunc(offset) * 7, 12));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + index);
    return date;
  });
}

function Health({ locale, checkIn, onCheckIn, timezone }) {
  const l = (en, ru) => choose(locale, en, ru);
  const [healthDate] = useState(() => calendarLocalDate(new Date(), timezone));
  const [done, setDone] = useStoredState(`main-health-habits-${healthDate}`, {});
  const habits = [
    {
      id: 'hh1',
      title: l('Leave room between tasks', 'Оставить немного места между делами'),
      detail: l(
        'A reminder you can mark or leave open.',
        'Напоминание, которое можно отметить или оставить открытым.'
      ),
    },
    {
      id: 'hh2',
      title: l('Notice the day’s pace', 'Заметить темп дня'),
      detail: l(
        'No target to meet. Just a moment of attention.',
        'Без цели, которую нужно достичь. Просто момент внимания.'
      ),
    },
    {
      id: 'hh3',
      title: l('A quieter end to the evening', 'Более спокойное завершение вечера'),
      detail: l(
        'An optional routine, without a streak.',
        'Рутина по желанию, без серии достижений.'
      ),
    },
  ];
  return (
    <>
      <PageHeading
        eyebrow={l('HEALTH · REST & RECOVERY', 'ЗДОРОВЬЕ · ОТДЫХ И ВОССТАНОВЛЕНИЕ')}
        title={l('Notice, without a verdict.', 'Заметить, не оценивая.')}
        description={l(
          'Illustrative sleep entries and gentle routine prompts. No medical records, diagnosis, or device data.',
          'Пример записей сна и спокойных рутин. Без медицинских записей, диагнозов и данных устройств.'
        )}
      />
      <CheckIn locale={locale} checkIn={checkIn} onCheckIn={onCheckIn} />
      <SleepJournal locale={locale} timezone={timezone} />
      <section className="demo-card demo-habits">
        <div className="demo-section-heading">
          <h3>{l('A few gentle anchors', 'Несколько спокойных опор')}</h3>
          <span className="demo-count">
            {Object.values(done).filter(Boolean).length} / {habits.length}
          </span>
        </div>
        {habits.map((habit) => (
          <Check
            key={habit.id}
            checked={Boolean(done[habit.id])}
            onChange={() => setDone({ ...done, [habit.id]: !done[habit.id] })}
            detail={habit.detail}
            locale={locale}
          >
            {habit.title}
          </Check>
        ))}
      </section>
    </>
  );
}

function Future({ locale }) {
  const l = (en, ru) => choose(locale, en, ru);
  const [exploration, setExploration] = useStoredState('main-future-exploration', {
    horizon: 'next',
    done: {},
    vision: '',
  });
  const { horizon = 'next', done = {}, vision = '' } = exploration;
  const setHorizon = (value) => setExploration((old) => ({ ...old, horizon: value }));
  const setDone = (value) => setExploration((old) => ({ ...old, done: value }));
  const setVision = (value) => setExploration((old) => ({ ...old, vision: value }));
  const horizons = {
    now: l('This season', 'Этот сезон'),
    next: l('Next year', 'Следующий год'),
    later: l('Further ahead', 'Дальше'),
  };
  const plans = {
    now: [
      {
        id: 'f1',
        title: l('Finish one small public guide', 'Завершить один небольшой открытый справочник'),
        detail: l(
          'Milestone: a useful first edition, not a perfect one.',
          'Этап: полезная первая версия, не идеальная.'
        ),
      },
      {
        id: 'f2',
        title: l('Run a first community workshop', 'Провести первую общую мастерскую'),
        detail: l(
          'Milestone: a date, a simple outline, and a small group.',
          'Этап: дата, простой план и небольшая группа.'
        ),
      },
    ],
    next: [
      {
        id: 'f3',
        title: l('Build a repeatable creative practice', 'Сделать творческую практику регулярной'),
        detail: l(
          'Milestone: twelve small experiments worth keeping.',
          'Этап: двенадцать небольших полезных экспериментов.'
        ),
      },
      {
        id: 'f4',
        title: l('Grow the shared garden project', 'Развить проект общего сада'),
        detail: l(
          'Milestone: a seasonal plan that others can join.',
          'Этап: сезонный план, к которому могут присоединиться другие.'
        ),
      },
    ],
    later: [
      {
        id: 'f5',
        title: l('A learning studio', 'Небольшая учебная студия'),
        detail: l(
          'Possibility: a welcoming place to make and share.',
          'Возможность: уютное место, чтобы создавать и делиться.'
        ),
      },
      {
        id: 'f6',
        title: l('An unhurried field notebook series', 'Неторопливая серия полевых заметок'),
        detail: l(
          'Possibility: connect the projects into something lasting.',
          'Возможность: соединить проекты во что-то долговечное.'
        ),
      },
    ],
  };
  return (
    <>
      <PageHeading
        eyebrow={l('FUTURE · HORIZONS', 'БУДУЩЕЕ · ГОРИЗОНТЫ')}
        title={l('A direction, not a deadline.', 'Направление, а не дедлайн.')}
        description={l(
          'Move between near and distant horizons. Milestones make a possibility tangible.',
          'Переключайтесь между близкими и дальними горизонтами. Этапы делают возможность чуть ощутимее.'
        )}
      />
      <section className="demo-future-compass">
        <span aria-hidden="true">✧</span>
        <div>
          <span className="demo-eyebrow">
            {l('A FICTIONAL NORTH STAR', 'ВЫМЫШЛЕННЫЙ ОРИЕНТИР')}
          </span>
          <h3>
            {l(
              'Make useful things. Leave room for a life.',
              'Создавать полезное. Оставлять место для жизни.'
            )}
          </h3>
        </div>
      </section>
      <nav
        className="demo-horizon-tabs"
        aria-label={l('Planning horizon', 'Горизонт планирования')}
      >
        {Object.entries(horizons).map(([key, title]) => (
          <button
            type="button"
            key={key}
            className={horizon === key ? 'demo-active' : ''}
            aria-pressed={horizon === key}
            onClick={() => setHorizon(key)}
          >
            <span>{key === 'now' ? '01' : key === 'next' ? '02' : '03'}</span>
            {title}
          </button>
        ))}
      </nav>
      <section className="demo-card demo-milestones">
        <span className="demo-eyebrow">{horizons[horizon]}</span>
        <h3>
          {horizon === 'later'
            ? l('Possibilities to keep close', 'Возможности, которые хочется сохранить')
            : l(
                'Small milestones, meaningful direction',
                'Небольшие этапы, осмысленное направление'
              )}
        </h3>
        {plans[horizon].map((milestone) => (
          <Check
            key={milestone.id}
            checked={Boolean(done[milestone.id])}
            onChange={() => setDone({ ...done, [milestone.id]: !done[milestone.id] })}
            detail={milestone.detail}
            locale={locale}
          >
            {milestone.title}
          </Check>
        ))}
      </section>
      <section className="demo-card demo-vision">
        <label className="demo-field">
          <span>{'A possibility of your own'}</span>
          <textarea
            rows={3}
            value={vision}
            maxLength={500}
            onChange={(event) => setVision(event.target.value)}
            placeholder={l(
              'Something you would like to make room for…',
              'То, для чего хочется освободить место…'
            )}
          />
        </label>
        <p className="demo-caption">
          {l(
            'A scratchpad, not a commitment. Saved in your Markdown workspace.',
            'Черновик, не обязательство. Этот текст не записывается в заметку.'
          )}
        </p>
      </section>
    </>
  );
}

function Work({ locale, timezone, settings = {} }) {
  const [historyVersion, setHistoryVersion] = useState(0);
  const [logError, setLogError] = useState('');
  const l = (en, ru) => choose(locale, en, ru);
  const [priority, setPriority] = useState('draft');
  const [done, setDone] = useState({});
  const [focusMinutes, setFocusMinutes] = useState(settings.focusMinutes || 60);
  const [remaining, setRemaining] = useState((settings.focusMinutes || 60) * 60);
  const [running, setRunning] = useState(false);
  const deadline = useRef(null);
  const previousDefault = useRef(settings.focusMinutes || 60);
  useEffect(() => {
    const nextDefault = settings.focusMinutes || 60;
    if (previousDefault.current === nextDefault) return;
    previousDefault.current = nextDefault;
    setRunning(false);
    setFocusMinutes(nextDefault);
    setRemaining(nextDefault * 60);
  }, [settings.focusMinutes]);
  const plans = [
    {
      id: 'draft',
      title: l('Choose one next step', 'Выбрать один следующий шаг'),
      size: l('One useful page', 'Одна полезная страница'),
    },
    {
      id: 'review',
      title: l('Review what is ready', 'Посмотреть, что уже готово'),
      size: l('Three clear sections', 'Три ясных раздела'),
    },
    {
      id: 'reply',
      title: l('Clarify one open question', 'Уточнить один открытый вопрос'),
      size: l('One short message', 'Одно короткое сообщение'),
    },
  ];
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) setRunning(false);
    };
    const timer = setInterval(tick, 1000);
    const resume = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [running]);
  const current = plans.find((plan) => plan.id === priority);
  return (
    <>
      <WorkSession
        locale={locale}
        timezone={timezone}
        onChange={() => setHistoryVersion((value) => value + 1)}
      />
      <MeetingPrep locale={locale} timezone={timezone} refreshKey={historyVersion} />
      <WorkHistory
        locale={locale}
        timezone={timezone}
        refreshKey={historyVersion}
        onChange={() => setHistoryVersion((value) => value + 1)}
      />
      {logError && <p role="alert">{logError}</p>}
      <WorkTimeBlocks locale={locale} timezone={timezone} />
      <section className="demo-card demo-work-focus">
        <div className="demo-section-heading">
          <div>
            <span className="demo-eyebrow">
              {l('FICTIONAL FOCUS PLAN', 'ВЫМЫШЛЕННЫЙ ПЛАН ФОКУСА')}
            </span>
            <h2>{l('One useful thing at a time.', 'Одно полезное дело за раз.')}</h2>
          </div>
          <span className="demo-work-mark" aria-hidden="true">
            ◇
          </span>
        </div>
        <div className="demo-work-options">
          {plans.map((plan) => (
            <button
              type="button"
              key={plan.id}
              className={priority === plan.id ? 'demo-active' : ''}
              aria-pressed={priority === plan.id}
              onClick={() => setPriority(plan.id)}
            >
              <span aria-hidden="true">{done[plan.id] ? '✓' : '○'}</span>
              <strong>{plan.title}</strong>
              <small>{plan.size}</small>
            </button>
          ))}
        </div>
        <label className="field">
          <span>{l('Focus duration · minutes', 'Длительность фокуса · минуты')}</span>
          <input
            type="number"
            min="1"
            max="180"
            value={focusMinutes}
            disabled={running}
            onChange={(event) => {
              const value = Number(event.target.value);
              setFocusMinutes(value);
              if (Number.isInteger(value) && value >= 1 && value <= 180) setRemaining(value * 60);
            }}
          />
        </label>
        <div className="demo-focus-timer">
          <div>
            <span className="demo-eyebrow">{l('FOCUS TIME', 'ВРЕМЯ ФОКУСА')}</span>
            <strong aria-live="off">
              {String(Math.floor(remaining / 60)).padStart(2, '0')}
              <span>:</span>
              {String(remaining % 60).padStart(2, '0')}
            </strong>
            <small>
              {running
                ? l('Running in this browser tab', 'Идёт в этой вкладке')
                : l('Session only · no notifications', 'Только в сеансе · без уведомлений')}
            </small>
          </div>
          <div className="demo-timer-actions">
            <button
              type="button"
              className="demo-button"
              disabled={
                remaining === 0 ||
                !Number.isInteger(focusMinutes) ||
                focusMinutes < 1 ||
                focusMinutes > 180
              }
              onClick={() => {
                if (running) setRunning(false);
                else {
                  deadline.current = Date.now() + remaining * 1000;
                  setRunning(true);
                }
              }}
            >
              {running ? l('Pause', 'Пауза') : l('Start', 'Начать')}
            </button>
            <button
              type="button"
              className="demo-text-button"
              onClick={() => {
                setRunning(false);
                setRemaining(focusMinutes * 60);
              }}
            >
              {l('Reset', 'Сбросить')}
            </button>
          </div>
        </div>
        <Check
          checked={Boolean(done[priority])}
          onChange={async () => {
            if (done[priority]) return;
            setLogError('');
            try {
              const date = new Intl.DateTimeFormat('en-CA', {
                timeZone: timezone,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
              }).format(new Date());
              const response = await fetch('/api/work/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date, text: current.title }),
              });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || 'Could not save');
              setDone({ ...done, [priority]: true });
              setHistoryVersion((value) => value + 1);
            } catch (reason) {
              setLogError(reason.message);
            }
          }}
          detail={l(
            'Completed steps are saved in the daily work history.',
            'Завершённые шаги сохраняются в истории рабочего дня.'
          )}
          locale={locale}
        >
          {l('Complete this focus step', 'Завершить этот шаг')}: {current.title}
        </Check>
      </section>
    </>
  );
}

export default function DemoPages({
  page,
  locale = 'en',
  checkIn,
  onCheckIn,
  timezone = 'UTC',
  onNavigate,
  onOpenProject,
  settings,
}) {
  const pages = {
    gtd: GTD,
    calendar: EditableCalendar,
    home: HomeWorkspace,
    health: Health,
    future: Future,
    career: CareerWorkspace,
    learning: LearningWorkspace,
    library: LibraryWorkspace,
    work: Work,
  };
  const Page = pages[page];
  if (!Page) return null;
  return (
    <div className={`demo-page demo-page-${page}`}>
      <DemoNote
        locale={locale}
        publicReference={false}
        persistent={[
          'home',
          'career',
          'learning',
          'calendar',
          'work',
          'health',
          'library',
        ].includes(page)}
      />
      <Page
        locale={locale}
        checkIn={checkIn}
        onCheckIn={onCheckIn}
        timezone={timezone}
        onNavigate={onNavigate}
        onOpenProject={onOpenProject}
        settings={settings}
      />
    </div>
  );
}
