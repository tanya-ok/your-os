import { useId, useState } from 'react';
import { useStoredState } from '../hooks/useStoredState.js';
import { calendarLocalDate } from './EditableCalendar.jsx';

export function createGardenExamples(date) {
  return {
    interests: [
      {
        id: 'garden',
        title: { en: 'Gardening for beginners', ru: 'Садоводство для начинающих' },
        link: 'career',
      },
      { id: 'human', title: { en: 'How to be human', ru: 'How to be human' }, link: 'learning' },
      { id: 'reading', title: { en: 'Quiet reading', ru: 'Спокойное чтение' }, link: 'library' },
    ],
    entries: [
      {
        id: 'demo-garden-entry',
        interestId: 'garden',
        date,
        minutes: 20,
        note: {
          en: 'Noticed where the morning shade falls. A field note, not a status report.',
          ru: 'Заметила, куда падает утренняя тень. Полевая заметка, а не статус-репорт.',
        },
      },
    ],
  };
}

export function gardenPracticeTotals(entries, interestId, date) {
  const matching = entries.filter((entry) => entry.interestId === interestId);
  const sum = (rows) => rows.reduce((total, entry) => total + Number(entry.minutes || 0), 0);
  return {
    today: sum(matching.filter((entry) => entry.date === date)),
    total: sum(matching),
    sessions: matching.length,
  };
}

export default function MainGarden({ locale = 'en', timezone = 'UTC', onNavigate }) {
  const l = (en, ru) => (locale === 'ru' ? ru : en);
  const label = (value) => (typeof value === 'string' ? value : value?.[locale] || value?.en || '');
  const uid = useId().replaceAll(':', '');
  const [date] = useState(() => calendarLocalDate(new Date(), timezone));
  const [garden, setGarden] = useStoredState('main-garden', () => createGardenExamples(date));
  const [day, setDay] = useStoredState(`main-habits-${date}`, { habits: {}, support: [] });
  const [todayOnly, setTodayOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [practiceId, setPracticeId] = useState(null);
  const [practice, setPractice] = useState({ minutes: 20, note: '' });
  const [historyId, setHistoryId] = useState(null);
  const [lastRemoved, setLastRemoved] = useState(null);
  const [removedPractice, setRemovedPractice] = useState(null);
  const [status, setStatus] = useState('');
  const [supportOpen, setSupportOpen] = useState(false);
  const [support, setSupport] = useState({ intensity: 'some', choice: 'smaller', note: '' });
  const interests = garden.interests || [];
  const entries = garden.entries || [];
  const shown = todayOnly
    ? interests.filter((interest) =>
        entries.some((entry) => entry.interestId === interest.id && entry.date === date)
      )
    : interests;
  const addInterest = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    if (interests.length >= 30) {
      setStatus(
        l(
          'This garden has 30 interests. Rename or remove one before adding another.',
          'В этом саду уже 30 интересов. Переименуйте или удалите один перед добавлением.'
        )
      );
      return;
    }
    setGarden((previous) => ({
      ...previous,
      interests: [
        ...previous.interests,
        { id: crypto.randomUUID(), title: name.trim(), link: null },
      ],
    }));
    setName('');
    setAdding(false);
    setTodayOnly(false);
    setStatus(l('Interest added locally.', 'Интерес добавлен локально.'));
  };
  const saveName = (event) => {
    event.preventDefault();
    if (!name.trim()) return;
    setGarden((previous) => ({
      ...previous,
      interests: previous.interests.map((interest) =>
        interest.id === editingId ? { ...interest, title: name.trim() } : interest
      ),
    }));
    setEditingId(null);
    setName('');
    setStatus(l('Interest renamed.', 'Интерес переименован.'));
  };
  const removeInterest = (interest) => {
    setLastRemoved({
      interest,
      entries: entries.filter((entry) => entry.interestId === interest.id),
    });
    setGarden((previous) => ({
      interests: previous.interests.filter((item) => item.id !== interest.id),
      entries: previous.entries.filter((entry) => entry.interestId !== interest.id),
    }));
    if (practiceId === interest.id) setPracticeId(null);
    if (editingId === interest.id) setEditingId(null);
    setStatus(
      l(
        'Interest and its practice history removed. Undo is available below.',
        'Интерес и его история практики удалены. Ниже доступна отмена.'
      )
    );
  };
  const restore = () => {
    setGarden((previous) => ({
      interests: [...previous.interests, lastRemoved.interest],
      entries: [...previous.entries, ...lastRemoved.entries],
    }));
    setLastRemoved(null);
    setTodayOnly(false);
    setStatus(
      l('Interest and practice history restored.', 'Интерес и история практики восстановлены.')
    );
  };
  const savePractice = (event) => {
    event.preventDefault();
    const minutes = Number(practice.minutes);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 480) return;
    if (entries.length >= 100) {
      setStatus(
        l(
          'The local garden log holds 100 sessions. Remove an old session explicitly before adding another.',
          'Локальный журнал сада вмещает 100 занятий. Перед добавлением удалите старую запись явно.'
        )
      );
      return;
    }
    setGarden((previous) => ({
      ...previous,
      entries: [
        {
          id: crypto.randomUUID(),
          interestId: practiceId,
          date,
          minutes,
          note: practice.note.trim(),
        },
        ...previous.entries,
      ],
    }));
    setPracticeId(null);
    setPractice({ minutes: 20, note: '' });
    setStatus(l('Practice saved for today.', 'Практика сохранена за сегодня.'));
  };
  const recordSupport = (event) => {
    event.preventDefault();
    setDay((previous) => ({
      ...previous,
      support: [
        ...previous.support,
        { ...support, id: crypto.randomUUID(), at: new Date().toISOString() },
      ],
    }));
    setSupportOpen(false);
    setSupport((previous) => ({ ...previous, note: '' }));
    setStatus(
      l(
        'Your choice was saved. Nothing was inferred or changed in the plan.',
        'Ваш выбор сохранён. Ничего не определено автоматически и планы не изменены.'
      )
    );
  };
  const habitItems = [
    ['outside', 'A moment outside', 'Немного времени снаружи'],
    ['water', 'A glass of water', 'Стакан воды'],
    ['pause', 'A pause away from the screen', 'Пауза без экрана'],
  ];
  const supportChoices = {
    smaller: l('Make the next step smaller', 'Уменьшить следующий шаг'),
    company: l('Ask someone for company', 'Попросить кого-то побыть рядом'),
    pause: l('Leave room for a pause', 'Оставить место для паузы'),
  };
  return (
    <div className="main-garden">
      <section className="main-garden-interests" aria-labelledby={`${uid}-title`}>
        <header className="main-garden-heading">
          <div>
            <span className="demo-eyebrow">
              {l('WHAT I AM GROWING', 'ТО, ЧТО Я РАЩУ')} · {date}
            </span>
            <h2 id={`${uid}-title`}>{l('My Garden', 'Мой сад')}</h2>
            <p>
              {l(
                'Interests can have a season. Garden, not a sprint.',
                'У интересов может быть свой сезон. Сад, а не спринт.'
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAdding(!adding);
              setEditingId(null);
              setName('');
            }}
          >
            {adding ? l('Cancel', 'Отмена') : l('Add interest', 'Добавить интерес')} +
          </button>
        </header>
        <fieldset
          className="main-garden-filter"
          aria-label={l('Interest filter', 'Фильтр интересов')}
        >
          <button type="button" aria-pressed={!todayOnly} onClick={() => setTodayOnly(false)}>
            {l('All interests', 'Все интересы')} · {interests.length}
          </button>
          <button type="button" aria-pressed={todayOnly} onClick={() => setTodayOnly(true)}>
            {l('Practised today', 'Практиковала сегодня')}
          </button>
        </fieldset>
        {adding && (
          <form className="main-garden-name-form" onSubmit={addInterest}>
            <label>
              {l('New interest', 'Новый интерес')}
              <input
                required
                maxLength="80"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button type="submit" disabled={!name.trim()}>
              {l('Add', 'Добавить')}
            </button>
          </form>
        )}
        <div className="main-garden-interest-list">
          {shown.map((interest) => {
            const totals = gardenPracticeTotals(entries, interest.id, date);
            const history = entries
              .filter((entry) => entry.interestId === interest.id)
              .sort((left, right) => right.date.localeCompare(left.date));
            return (
              <article className="main-garden-interest" key={interest.id}>
                <div className="main-garden-interest-heading">
                  <div>
                    {editingId === interest.id ? (
                      <form className="main-garden-name-form" onSubmit={saveName}>
                        <label>
                          {l('Interest name', 'Название интереса')}
                          <input
                            required
                            maxLength="80"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                          />
                        </label>
                        <button type="submit" disabled={!name.trim()}>
                          {l('Save name', 'Сохранить название')}
                        </button>
                        <button type="button" onClick={() => setEditingId(null)}>
                          {l('Cancel', 'Отмена')}
                        </button>
                      </form>
                    ) : (
                      <h3>{label(interest.title)}</h3>
                    )}
                    <span>
                      {l('Today', 'Сегодня')}: {totals.today} {l('min', 'мин')} ·{' '}
                      {l('All time', 'За всё время')}: {totals.total} {l('min', 'мин')}
                    </span>
                  </div>
                  <div className="main-garden-interest-menu">
                    {interest.link && (
                      <button
                        type="button"
                        onClick={() => onNavigate?.(interest.link)}
                        aria-label={l(
                          `Open ${label(interest.title)}`,
                          `Открыть ${label(interest.title)}`
                        )}
                      >
                        ↗
                      </button>
                    )}
                    <button
                      type="button"
                      aria-label={l(
                        `Rename ${label(interest.title)}`,
                        `Переименовать ${label(interest.title)}`
                      )}
                      onClick={() => {
                        setEditingId(interest.id);
                        setAdding(false);
                        setName(label(interest.title));
                      }}
                    >
                      {l('Rename', 'Переименовать')}
                    </button>
                    <button
                      type="button"
                      aria-label={l(
                        `Remove ${label(interest.title)}`,
                        `Удалить ${label(interest.title)}`
                      )}
                      onClick={() => removeInterest(interest)}
                    >
                      {l('Remove', 'Удалить')}
                    </button>
                  </div>
                </div>
                <div className="main-garden-interest-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setPracticeId(practiceId === interest.id ? null : interest.id);
                      setPractice({ minutes: 20, note: '' });
                    }}
                  >
                    {l('Log practice', 'Записать практику')} +
                  </button>
                  <button
                    type="button"
                    aria-expanded={historyId === interest.id}
                    aria-controls={`${uid}-history-${interest.id}`}
                    onClick={() => setHistoryId(historyId === interest.id ? null : interest.id)}
                  >
                    {l('History', 'История')} · {totals.sessions}
                  </button>
                </div>
                {practiceId === interest.id && (
                  <form className="main-garden-practice-form" onSubmit={savePractice}>
                    <label>
                      {l('Minutes of practice', 'Минуты практики')}
                      <input
                        type="number"
                        min="1"
                        max="480"
                        step="1"
                        required
                        value={practice.minutes}
                        onChange={(event) =>
                          setPractice((previous) => ({ ...previous, minutes: event.target.value }))
                        }
                      />
                    </label>
                    <label>
                      {l('Observation or note', 'Наблюдение или заметка')}
                      <textarea
                        rows="2"
                        maxLength="500"
                        value={practice.note}
                        onChange={(event) =>
                          setPractice((previous) => ({ ...previous, note: event.target.value }))
                        }
                      />
                    </label>
                    <button type="submit">{l('Save practice', 'Сохранить практику')}</button>
                  </form>
                )}
                {historyId === interest.id && (
                  <div className="main-garden-history" id={`${uid}-history-${interest.id}`}>
                    {history.length ? (
                      history.map((entry) => (
                        <div key={entry.id}>
                          <div>
                            <small>
                              {entry.date} · {entry.minutes} {l('min', 'мин')}
                            </small>
                            <p>
                              {label(entry.note) ||
                                l('Practice without a note.', 'Практика без заметки.')}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={l(
                              `Delete practice on ${entry.date}`,
                              `Удалить практику за ${entry.date}`
                            )}
                            onClick={() => {
                              setRemovedPractice(entry);
                              setGarden((previous) => ({
                                ...previous,
                                entries: previous.entries.filter((item) => item.id !== entry.id),
                              }));
                              setStatus(l('Practice entry removed.', 'Запись о практике удалена.'));
                            }}
                          >
                            {l('Delete', 'Удалить')}
                          </button>
                        </div>
                      ))
                    ) : (
                      <p>
                        {l(
                          'The first observation can be small.',
                          'Первое наблюдение может быть маленьким.'
                        )}
                      </p>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {shown.length === 0 && (
            <p>
              {todayOnly
                ? l(
                    'No practice recorded today. All interests are still under “All interests”.',
                    'Сегодня практика ещё не записана. Все интересы остаются в разделе «Все интересы».'
                  )
                : l(
                    'Add an interest you would like to make room for.',
                    'Добавьте интерес, которому хочется оставить место.'
                  )}
            </p>
          )}
        </div>
        {lastRemoved && (
          <button type="button" onClick={restore}>
            {l('Undo removal and restore history', 'Отменить удаление и восстановить историю')}
          </button>
        )}
        {removedPractice &&
          interests.some((interest) => interest.id === removedPractice.interestId) && (
            <button
              type="button"
              onClick={() => {
                setGarden((previous) => ({
                  ...previous,
                  entries: [...previous.entries, removedPractice],
                }));
                setRemovedPractice(null);
                setStatus(l('Practice entry restored.', 'Запись о практике восстановлена.'));
              }}
            >
              {l('Undo last practice deletion', 'Отменить удаление последней практики')}
            </button>
          )}
      </section>
      <section className="main-garden-care">
        <div>
          <span className="demo-eyebrow">{l('DAILY ANCHORS', 'МАЛЕНЬКИЕ ОПОРЫ СЕГОДНЯ')}</span>
          <h2>{l('Care, by your own measure', 'Забота по своей мерке')}</h2>
          <p>
            {l(
              'Mark only what you chose to do. A clear box is not a failure.',
              'Отмечайте только то, что выбрали сделать. Пустая клетка не означает неудачу.'
            )}
          </p>
          <div className="main-garden-habits">
            {habitItems.map(([key, en, ru]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={!!day.habits?.[key]}
                  onChange={() =>
                    setDay((previous) => ({
                      ...previous,
                      habits: { ...previous.habits, [key]: !previous.habits?.[key] },
                    }))
                  }
                />
                <span>{l(en, ru)}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="main-garden-support">
          <h3>{l('Too much at once?', 'Слишком много сразу?')}</h3>
          <p>
            {l(
              'Choose what would help. The dashboard will not guess or rearrange your day.',
              'Выберите, что могло бы помочь. Дашборд не угадывает и не перестраивает день.'
            )}
          </p>
          <button
            type="button"
            aria-expanded={supportOpen}
            aria-controls={`${uid}-support`}
            onClick={() => setSupportOpen((value) => !value)}
          >
            {l('Note what would help', 'Отметить, что поможет')}
          </button>
          {supportOpen && (
            <form id={`${uid}-support`} onSubmit={recordSupport}>
              <label>
                {l('How much is going on? · manual', 'Сколько всего сейчас? · вручную')}
                <select
                  value={support.intensity}
                  onChange={(event) =>
                    setSupport((previous) => ({ ...previous, intensity: event.target.value }))
                  }
                >
                  <option value="some">{l('Some', 'Немного')}</option>
                  <option value="much">{l('A lot', 'Много')}</option>
                  <option value="too-much">{l('Too much', 'Слишком много')}</option>
                </select>
              </label>
              <label>
                {l('My choice', 'Мой выбор')}
                <select
                  value={support.choice}
                  onChange={(event) =>
                    setSupport((previous) => ({ ...previous, choice: event.target.value }))
                  }
                >
                  {Object.entries(supportChoices).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {l('A few words · optional', 'Пара слов · необязательно')}
                <textarea
                  rows="2"
                  maxLength="500"
                  value={support.note}
                  onChange={(event) =>
                    setSupport((previous) => ({ ...previous, note: event.target.value }))
                  }
                />
              </label>
              <button type="submit">{l('Save my choice', 'Сохранить мой выбор')}</button>
            </form>
          )}
          {day.support?.length > 0 && (
            <div className="main-garden-support-history">
              <small>
                {l('Chosen today', 'Выбрано сегодня')} · {day.support.length}
              </small>
              {day.support.slice(-3).map((entry) => (
                <p key={entry.id}>
                  {supportChoices[entry.choice]}
                  {entry.note && ` · ${entry.note}`}
                </p>
              ))}
            </div>
          )}
        </div>
      </section>
      <p className="main-garden-footnote">
        {l(
          'Interests, practice history and daily checks are saved locally. The initial interests and one practice entry are fictional examples; manual choices do not infer health or energy.',
          'Интересы, история практики и ежедневные отметки сохраняются локально. Начальные интересы и одна запись практики вымышлены; ручные отметки не определяют здоровье или энергию.'
        )}
      </p>
      <p className="main-garden-status" role="status">
        {status}
      </p>
    </div>
  );
}
