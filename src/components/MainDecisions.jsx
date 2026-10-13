import { useId, useState } from 'react';
import { useStoredState } from '../hooks/useStoredState.js';
import { careerISOWeek } from './CareerWorkspace.jsx';
import { calendarLocalDate } from './EditableCalendar.jsx';

export function createMainDecisions(locale, date) {
  const ru = locale === 'ru';
  return [
    {
      id: 'demo-slow-down',
      date,
      domain: 'Pace',
      status: 'active',
      text: ru ? 'Замедлиться.' : 'Slow down.',
      why: ru
        ? 'Оставить место между делами. Одного полезного шага достаточно.'
        : 'Leave room between commitments. One useful step is enough.',
    },
    {
      id: 'demo-grow',
      date,
      domain: 'Career',
      status: 'active',
      text: ru
        ? 'Сначала попробовать садоводство на маленьком участке.'
        : 'Try gardening in one small growing space first.',
      why: ru
        ? 'Весну нельзя запустить через kubectl apply. Сначала почва, свет и маленький эксперимент.'
        : 'You cannot kubectl apply spring. Start with soil, light and a small experiment.',
    },
    {
      id: 'demo-room',
      date,
      domain: 'Home',
      status: 'active',
      text: ru
        ? 'Оставить один вечер недели без обязательств.'
        : 'Keep one evening of the week free of commitments.',
      why: ru
        ? 'Планы должны оставлять место для обычной жизни.'
        : 'A plan should leave room for ordinary life.',
    },
    {
      id: 'demo-learn',
      date,
      domain: 'Learning',
      status: 'past',
      text: ru
        ? 'Учиться небольшими подходами и записывать наблюдения.'
        : 'Learn in small sessions and keep observations.',
      why: ru
        ? 'Не каждой идее нужен собственный backlog.'
        : 'Not every idea needs its own backlog.',
    },
  ];
}

export default function MainDecisions({
  locale = 'en',
  timezone = 'UTC',
  workspace = {},
  onNavigate,
  onPreview,
}) {
  const l = (en, ru) => (locale === 'ru' ? ru : en);
  const uid = useId().replaceAll(':', '');
  const [date] = useState(() => calendarLocalDate(new Date(), timezone));
  const [week] = useState(() => careerISOWeek(new Date(), timezone));
  const tasks = workspace.tasks || [];
  const projects = workspace.projects || [];
  const openTasks = tasks.filter((task) => !task.checked);
  const [priorityIds, setPriorityIds] = useStoredState(`main-priorities-${week.key}`, () =>
    tasks
      .filter((task) => !task.checked && !['waiting', 'someday'].includes(task.status))
      .slice(0, 3)
      .map((task) => task.id)
  );
  const priorities = priorityIds.map((id) => tasks.find((task) => task.id === id)).filter(Boolean);
  const [context, setContext] = useStoredState(`main-context-${date}`, '');
  const [contextDraft, setContextDraft] = useState('');
  const [editingContext, setEditingContext] = useState(false);
  const [decisions, setDecisions] = useStoredState('main-decisions', () =>
    createMainDecisions(locale, date)
  );
  const [draft, setDraft] = useState(null);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [weekExpanded, setWeekExpanded] = useState(true);
  const [transitionCount, setTransitionCount] = useStoredState(`main-transitions-${date}`, 0);
  const [lastDeleted, setLastDeleted] = useState(null);
  const [status, setStatus] = useState('');
  const active = decisions.filter((decision) => decision.status === 'active');
  const past = decisions.filter((decision) => decision.status === 'past');
  const projectFor = (task) => projects.find((project) => project.id === task.projectId);
  const taskTitle = (task) => {
    const text = task.text || task.title || '';
    const project = projectFor(task);
    const title = text
      .replace(/\[\[Projects\/([^|\]]+)(?:\|([^\]]+))?\]\]/g, (_link, id, alias) =>
        project?.id === id ? '' : alias || id.replaceAll('-', ' ')
      )
      .replace(/\s+/g, ' ')
      .trim();
    return title || project?.title || l('Untitled task', 'Задача без названия');
  };
  const addPriority = (id) => {
    const validIds = priorityIds.filter((key) => tasks.some((task) => task.id === key));
    if (!id || validIds.includes(id) || validIds.length >= 3) return;
    setPriorityIds([...validIds, id]);
  };
  const movePriority = (index, delta) => {
    const next = priorities.map((task) => task.id);
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setPriorityIds(next);
  };
  const saveDecision = (event) => {
    event.preventDefault();
    if (!draft.text.trim()) return;
    if (draft.id)
      setDecisions((previous) =>
        previous.map((decision) =>
          decision.id === draft.id
            ? { ...decision, text: draft.text.trim(), why: draft.why.trim(), domain: draft.domain }
            : decision
        )
      );
    else {
      setDecisions((previous) => [
        {
          ...draft,
          id: `decision-${crypto.randomUUID()}`,
          text: draft.text.trim(),
          why: draft.why.trim(),
          date,
          status: 'active',
        },
        ...previous,
      ]);
    }
    setDraft(null);
    setStatus(l('Decision saved locally.', 'Решение сохранено локально.'));
  };
  const changeStatus = (decision) =>
    setDecisions((previous) =>
      previous.map((item) =>
        item.id === decision.id
          ? { ...item, status: item.status === 'active' ? 'past' : 'active' }
          : item
      )
    );
  const removeDecision = (decision) => {
    setLastDeleted(decision);
    setDecisions((previous) => previous.filter((item) => item.id !== decision.id));
    setStatus(l('Decision removed. Undo is available.', 'Решение удалено. Можно отменить.'));
  };
  const decisionRow = (decision) => (
    <article className="main-decisions-entry" key={decision.id}>
      <div className="main-decisions-entry-meta">
        <span>{decision.domain}</span>
        <time dateTime={decision.date}>{decision.date}</time>
      </div>
      <h4>{decision.text}</h4>
      {decision.why && (
        <p>
          <strong>{l('Why', 'Почему')}:</strong> {decision.why}
        </p>
      )}
      <div className="main-decisions-entry-actions">
        <button type="button" onClick={() => changeStatus(decision)}>
          {decision.status === 'active'
            ? l('Internalized → past', 'Усвоено → в историю')
            : l('Return to active', 'Вернуть в активные')}
        </button>
        <button type="button" onClick={() => setDraft({ ...decision })}>
          {l('Edit', 'Изменить')}
        </button>
        <button
          type="button"
          aria-label={l(`Delete decision: ${decision.text}`, `Удалить решение: ${decision.text}`)}
          onClick={() => removeDecision(decision)}
        >
          {l('Delete', 'Удалить')}
        </button>
      </div>
    </article>
  );
  return (
    <div className="main-decisions">
      <section className="main-decisions-journal">
        <div className="main-decisions-section-heading">
          <div>
            <span className="demo-eyebrow">{l('THINGS I CHOOSE', 'ТО, ЧТО Я ВЫБИРАЮ')}</span>
            <h2>{l('Decisions', 'Решения')}</h2>
          </div>
          <button type="button" onClick={() => setDraft({ text: '', why: '', domain: 'General' })}>
            {l('Add decision', 'Добавить решение')} +
          </button>
        </div>
        {draft && (
          <form className="main-decisions-form" onSubmit={saveDecision}>
            <label>
              {l('Decision', 'Решение')}
              <input
                required
                maxLength="500"
                value={draft.text}
                onChange={(event) =>
                  setDraft((previous) => ({ ...previous, text: event.target.value }))
                }
              />
            </label>
            <div className="main-decisions-form-grid">
              <label>
                {l('Why it matters', 'Почему это важно')}
                <textarea
                  rows="2"
                  maxLength="1000"
                  value={draft.why}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, why: event.target.value }))
                  }
                />
              </label>
              <label>
                {l('Area', 'Область')}
                <select
                  value={draft.domain}
                  onChange={(event) =>
                    setDraft((previous) => ({ ...previous, domain: event.target.value }))
                  }
                >
                  {['General', 'Home', 'Career', 'Learning', 'Work', 'Future'].map((domain) => (
                    <option key={domain}>{domain}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="main-decisions-entry-actions">
              <button type="submit" disabled={!draft.text.trim()}>
                {l('Save decision', 'Сохранить решение')}
              </button>
              <button type="button" onClick={() => setDraft(null)}>
                {l('Cancel', 'Отмена')}
              </button>
            </div>
          </form>
        )}
        <div className="main-decisions-active">
          {active.map(decisionRow)}
          {active.length === 0 && (
            <p>
              {l(
                'No active decisions. Leave room for the next one.',
                'Нет активных решений. Можно оставить место для следующего.'
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          className="main-decisions-disclosure"
          aria-expanded={pastExpanded}
          aria-controls={`${uid}-past`}
          onClick={() => setPastExpanded((value) => !value)}
        >
          {pastExpanded ? '▾' : '▸'} {l('Past · internalized', 'История · усвоено')} · {past.length}
        </button>
        {pastExpanded && <div id={`${uid}-past`}>{past.map(decisionRow)}</div>}
        {lastDeleted && (
          <button
            type="button"
            onClick={() => {
              setDecisions((previous) => [lastDeleted, ...previous]);
              setLastDeleted(null);
              setStatus(l('Decision restored.', 'Решение восстановлено.'));
            }}
          >
            {l('Undo last deletion', 'Отменить последнее удаление')}
          </button>
        )}
      </section>
      <div className="main-decisions-day-tools">
        <section className="main-decisions-context">
          <div className="main-decisions-section-heading">
            <div>
              <span className="demo-eyebrow">
                {l('TODAY’S CONTEXT', 'КОНТЕКСТ СЕГОДНЯ')} · {date}
              </span>
              <h2>{l('What matters around the plan?', 'Что важно вокруг планов?')}</h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingContext(!editingContext);
                setContextDraft(context);
              }}
            >
              {editingContext
                ? l('Cancel', 'Отмена')
                : context
                  ? l('Edit', 'Изменить')
                  : l('Add context', 'Добавить контекст')}
            </button>
          </div>
          {editingContext ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setContext(contextDraft.trim());
                setEditingContext(false);
                setStatus(l('Context updated locally.', 'Контекст обновлён локально.'));
              }}
            >
              <label>
                {l(
                  'A reminder about the shape of your day',
                  'Напоминание о том, какой сегодня день'
                )}
                <textarea
                  rows="2"
                  maxLength="1000"
                  value={contextDraft}
                  onChange={(event) => setContextDraft(event.target.value)}
                  placeholder={l(
                    'For example: a quiet afternoon and one thing to finish.',
                    'Например: спокойный день и одно дело, которое хочется закончить.'
                  )}
                />
              </label>
              <button type="submit">{l('Keep context', 'Сохранить контекст')}</button>
            </form>
          ) : (
            <p>
              {context ||
                l(
                  'Add a constraint, a change of plan or something that would help today. No one has to be Senior IT specialist of everything here.',
                  'Можно записать ограничение, перемену планов или небольшую заботу о себе. Здесь не обязательно быть Senior IT specialist of everything.'
                )}
            </p>
          )}
        </section>
        <section className="main-decisions-transition">
          <span className="demo-eyebrow">{l('BETWEEN THINGS', 'МЕЖДУ ДЕЛАМИ')}</span>
          <h3>{l('A small transition', 'Маленький переход')}</h3>
          <p>
            {l(
              'Stand up, look away from the screen, take a sip of water. Choose your own pause.',
              'Встать, отвести взгляд от экрана, выпить воды. Выбрать свою паузу.'
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              setTransitionCount((value) => value + 1);
              setStatus(l('Transition noted locally.', 'Переход отмечен локально.'));
            }}
          >
            {l('Mark a transition', 'Отметить переход')} · {transitionCount}
          </button>
        </section>
      </div>
      <section className="main-decisions-week">
        <div className="main-decisions-section-heading">
          <button
            className="main-decisions-disclosure"
            type="button"
            aria-expanded={weekExpanded}
            aria-controls={`${uid}-priorities`}
            onClick={() => setWeekExpanded((value) => !value)}
          >
            <span aria-hidden="true">{weekExpanded ? '▾' : '▸'}</span>
            <span>
              {l('This week', 'Эта неделя')} · {week.key}
            </span>
          </button>
          <button type="button" onClick={() => onNavigate?.('home')}>
            {l('Week theme & review', 'Тема недели и обзор')} ↗
          </button>
        </div>
        {weekExpanded && (
          <div id={`${uid}-priorities`}>
            <p className="main-decisions-week-intro">
              {l(
                'Choose up to three real next steps from this workspace. A small garden grows with regular care, not a larger sprint.',
                'Выберите до трёх настоящих шагов из этого пространства. Маленький сад растёт от регулярной заботы, а не от увеличения спринта.'
              )}
            </p>
            <ol className="main-decisions-priorities">
              {priorities.map((task, index) => {
                const project = projectFor(task);
                return (
                  <li key={task.id}>
                    <div className="main-decisions-priority-row">
                      <button
                        type="button"
                        className="main-decisions-task-check"
                        aria-pressed={task.checked}
                        aria-label={l(
                          `Preview completion: ${taskTitle(task)}`,
                          `Предпросмотр выполнения: ${taskTitle(task)}`
                        )}
                        disabled={!onPreview}
                        onClick={() => onPreview?.({ type: 'toggle', taskId: task.id })}
                      >
                        {task.checked ? '✓' : '○'}
                      </button>
                      <div
                        className={`main-decisions-priority-body ${task.checked ? 'main-decisions-task-complete' : ''}`}
                      >
                        <strong>{taskTitle(task)}</strong>
                        {project && (
                          <button
                            type="button"
                            className="main-decisions-project-link"
                            onClick={() => onNavigate?.('projects', project.id)}
                          >
                            {project.title || project.id} ↗
                          </button>
                        )}
                      </div>
                      <div className="main-decisions-priority-controls">
                        <button
                          type="button"
                          disabled={index === 0}
                          aria-label={l(`Move up: ${taskTitle(task)}`, `Выше: ${taskTitle(task)}`)}
                          onClick={() => movePriority(index, -1)}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={index === priorities.length - 1}
                          aria-label={l(
                            `Move down: ${taskTitle(task)}`,
                            `Ниже: ${taskTitle(task)}`
                          )}
                          onClick={() => movePriority(index, 1)}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          aria-label={l(
                            `Remove priority: ${taskTitle(task)}`,
                            `Убрать приоритет: ${taskTitle(task)}`
                          )}
                          onClick={() =>
                            setPriorityIds((previous) => previous.filter((id) => id !== task.id))
                          }
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
            {priorities.length < 3 && (
              <label className="main-decisions-priority-picker">
                {l('Choose a weekly priority', 'Выбрать приоритет недели')}
                <select value="" onChange={(event) => addPriority(event.target.value)}>
                  <option value="">
                    {l('Select an existing task…', 'Выбрать существующую задачу…')}
                  </option>
                  {openTasks
                    .filter((task) => !priorityIds.includes(task.id))
                    .map((task) => (
                      <option value={task.id} key={task.id}>
                        {taskTitle(task)}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <p className="main-decisions-scope">
              {l(
                'Priority order is saved locally; completing a task opens the usual Markdown preview.',
                'Порядок приоритетов сохраняется локально; выполнение задачи открывает обычный предпросмотр Markdown.'
              )}
            </p>
          </div>
        )}
      </section>
      <p className="main-decisions-scope">
        {l(
          'The starting decisions are fictional. Context, decisions, priorities and transition counts are saved locally. Task and Inbox changes use the workspace preview and confirmation.',
          'Начальные примеры решений вымышлены. Контекст, решения, приоритеты и переходы сохраняются локально. Задачи и входящие меняются через предпросмотр и подтверждение.'
        )}
      </p>
      <p role="status" className="main-decisions-status">
        {status}
      </p>
    </div>
  );
}
