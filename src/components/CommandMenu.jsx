import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { NAV_GROUPS, PAGE_COPY, UTILITIES } from '../navigation.js';

const LABELS_RU = {
  main: 'Главная',
  today: 'Сегодня',
  gtd: 'GTD · Дела',
  calendar: 'Календарь',
  work: 'Работа',
  home: 'Дом',
  health: 'Здоровье',
  future: 'Будущее',
  career: 'Карьера',
  learning: 'Обучение',
  library: 'Библиотека',
  agent: 'AI Agent · ИИ-агент',
  graph: 'Граф',
  projects: 'Проекты',
  review: 'Обзор недели',
  setup: 'Настройки',
};
export const COMMAND_ROUTES = [
  ...NAV_GROUPS.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label }))),
  ...UTILITIES.map((item) => ({ ...item, group: 'Workspace tools' })),
];
const l = (locale, en, ru) => (locale === 'ru' ? ru : en);
export function filterCommands(query, locale = 'en') {
  const words = String(query || '')
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return COMMAND_ROUTES.filter((item) => {
    const haystack = [
      item.id,
      item.label,
      LABELS_RU[item.id],
      item.group,
      PAGE_COPY.en[item.id]?.title,
      PAGE_COPY.ru[item.id]?.title,
    ]
      .join(' ')
      .toLocaleLowerCase();
    return words.every((word) => haystack.includes(word));
  }).map((item) => ({
    ...item,
    displayLabel: locale === 'ru' ? LABELS_RU[item.id] || item.label : item.label,
  }));
}
export function editableTarget(target) {
  return Boolean(
    target?.isContentEditable ||
      target?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]')
  );
}
export function shortcutCommand(event, editable = false) {
  if (event.isComposing || event.repeat || event.defaultPrevented) return null;
  const key = String(event.key || '').toLowerCase();
  const code = String(event.code || '');
  const primary = event.metaKey || event.ctrlKey;
  if (primary && !event.altKey && (key === 'k' || code === 'KeyK'))
    return { type: event.shiftKey ? 'navigate-menu' : 'capture' };
  if (editable) return null;
  if (!primary && event.altKey && !event.shiftKey) {
    const digit = /^[1-9]$/.test(key)
      ? Number(key)
      : /^Digit[1-9]$/.test(code)
        ? Number(code.slice(5))
        : 0;
    const route = COMMAND_ROUTES.filter((item) => item.number)[digit - 1];
    if (route) return { type: 'navigate', id: route.id };
  }
  if (primary && event.shiftKey && !event.altKey) {
    const map = { d: 'today', p: 'projects', r: 'review', a: 'agent' };
    const letter = /^Key[A-Z]$/.test(code) ? code.slice(3).toLowerCase() : key;
    if (map[letter]) return { type: 'navigate', id: map[letter] };
  }
  if (key === '?' && !primary && !event.altKey) return { type: 'help' };
  return null;
}

export default function CommandMenu({
  locale = 'en',
  projects = [],
  onNavigate,
  onPreview,
  onCaptureNote,
  writable = false,
  busy = false,
  enabled = true,
}) {
  const t = (en, ru) => l(locale, en, ru);
  const uid = useId().replaceAll(':', '');
  const dialog = useRef(null);
  const search = useRef(null);
  const capture = useRef(null);
  const closeButton = useRef(null);
  const previousFocus = useRef(null);
  const [mode, setMode] = useState(null);
  const [query, setQuery] = useState('');
  const [projectId, setProjectId] = useState('');
  const [selected, setSelected] = useState(0);
  const [captureType, setCaptureType] = useState('note');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState('next');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const commands = useMemo(() => filterCommands(query, locale), [query, locale]);
  const working = busy || submitting;
  const dismiss = useCallback(() => {
    setMode(null);
    setError('');
  }, []);
  const open = useCallback((nextMode) => {
    if (!dialog.current?.open) previousFocus.current = document.activeElement;
    setMode(nextMode);
    setError('');
    if (nextMode === 'navigation') {
      setQuery('');
      setSelected(0);
    }
  }, []);
  const navigate = useCallback(
    (id) => {
      dismiss();
      onNavigate?.(id);
    },
    [dismiss, onNavigate]
  );
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (mode) {
      if (!element.open) element.showModal();
      const target =
        mode === 'navigation'
          ? search.current
          : mode === 'capture'
            ? capture.current
            : closeButton.current;
      target?.focus();
    } else if (element.open) {
      element.close();
      if (previousFocus.current?.isConnected) previousFocus.current.focus();
    }
    return undefined;
  }, [mode]);
  useEffect(() => {
    if (!enabled) return;
    const listener = (event) => {
      if (event.key === 'Escape' && dialog.current?.open) {
        event.preventDefault();
        dismiss();
        return;
      }
      const command = shortcutCommand(event, editableTarget(event.target));
      if (!command) return;
      if (dialog.current?.open && command.type === 'navigate') return;
      event.preventDefault();
      if (command.type === 'capture') {
        if (mode === 'capture') dismiss();
        else open('capture');
      } else if (command.type === 'navigate-menu') open('navigation');
      else if (command.type === 'help') open('help');
      else navigate(command.id);
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [enabled, mode, dismiss, open, navigate]);
  useEffect(() => {
    const captureRequest = () => open('capture');
    window.addEventListener('personal-os-capture', captureRequest);
    return () => window.removeEventListener('personal-os-capture', captureRequest);
  }, [open]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Selected result and query changes scroll the active option into view.
  useEffect(() => {
    if (mode === 'navigation')
      dialog.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [mode, selected, query]);
  const submit = async (event) => {
    event.preventDefault();
    if (working || !writable) return;
    const text = draft.trim();
    const taskText = text.replace(/\s+/g, ' ');
    if (!text) {
      setError(t('Write something first.', 'Сначала напишите что-нибудь.'));
      return;
    }
    if (captureType === 'task' && taskText.length > 500) {
      setError(
        t(
          'A task can contain at most 500 characters. Keep longer text as a note.',
          'Задача может содержать до 500 символов. Длинный текст сохраните как заметку.'
        )
      );
      return;
    }
    if (
      captureType === 'task' &&
      projectId &&
      !projects.some((project) => project.id === projectId)
    ) {
      setError(
        t(
          'This project is no longer active. Choose another project or no project.',
          'Проект больше не активен. Выберите другой проект или уберите связь.'
        )
      );
      return;
    }
    const callback = captureType === 'note' ? onCaptureNote : onPreview;
    if (!callback) {
      setError(
        t('This capture destination is not available.', 'Это место для записи пока недоступно.')
      );
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const result = await callback(
        captureType === 'note'
          ? { text }
          : { type: 'capture', text: taskText, status, ...(projectId ? { projectId } : {}) }
      );
      if (result === false) {
        setError(
          t(
            'Could not prepare the preview. Your draft is kept.',
            'Не удалось подготовить просмотр. Черновик сохранён.'
          )
        );
        return;
      }
      dismiss();
    } catch {
      setError(
        t(
          'Could not prepare the preview. Your draft is kept.',
          'Не удалось подготовить просмотр. Черновик сохранён.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };
  const trapFocus = (event) => {
    if (event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [
      ...dialog.current.querySelectorAll(
        'button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[href],[tabindex]:not([tabindex="-1"])'
      ),
    ].filter((item) => item.tabIndex >= 0 && item.getClientRects().length);
    const first = items[0],
      last = items.at(-1);
    if (!first) {
      event.preventDefault();
      dialog.current.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="command-menu">
      <dialog
        ref={dialog}
        className="command-menu-dialog"
        aria-labelledby={`${uid}-title`}
        onCancel={(event) => {
          event.preventDefault();
          dismiss();
        }}
        onClose={() => setMode(null)}
        onKeyDown={trapFocus}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          const box = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < box.left ||
            event.clientX > box.right ||
            event.clientY < box.top ||
            event.clientY > box.bottom
          )
            dismiss();
        }}
      >
        <div className="command-menu-dialog-heading">
          <h2 id={`${uid}-title`}>
            {mode === 'capture'
              ? t('What’s on your mind?', 'Что сейчас на уме?')
              : mode === 'help'
                ? t('Keyboard shortcuts', 'Горячие клавиши')
                : t('Find a page', 'Найти страницу')}
          </h2>
          <button
            ref={closeButton}
            type="button"
            className="command-menu-close"
            aria-label={t('Close dialog', 'Закрыть окно')}
            onClick={dismiss}
          >
            ×
          </button>
        </div>
        {mode === 'capture' && (
          <form className="command-menu-capture" onSubmit={submit}>
            <fieldset
              className="command-menu-capture-types"
              aria-label={t('Capture type', 'Тип записи')}
            >
              {[
                ['note', 'Note', 'Заметка'],
                ['task', 'Task', 'Задача'],
              ].map(([key, en, ru]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={captureType === key}
                  disabled={working}
                  onClick={() => setCaptureType(key)}
                >
                  {t(en, ru)}
                </button>
              ))}
            </fieldset>
            <label className="command-menu-draft-label" htmlFor={`${uid}-draft`}>
              {captureType === 'note'
                ? t('Note to Inbox', 'Заметка во входящие')
                : t('Next action', 'Следующее действие')}
            </label>
            <textarea
              ref={capture}
              id={`${uid}-draft`}
              value={draft}
              maxLength={12000}
              rows={captureType === 'note' ? 7 : 3}
              placeholder={t(
                'Put it here. Organize it later.',
                'Запишите здесь. Разобраться можно потом.'
              )}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.isComposing || event.repeat) return;
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  submit(event);
                }
              }}
            />
            {captureType === 'task' && (
              <label className="command-menu-status">
                {t('List', 'Список')}
                <select
                  value={status}
                  disabled={working}
                  onChange={(event) => setStatus(event.target.value)}
                >
                  <option value="inbox">{t('Inbox', 'Входящие')}</option>
                  <option value="next">{t('Next', 'Следующее')}</option>
                  <option value="waiting">{t('Waiting', 'Ожидание')}</option>
                  <option value="someday">{t('Someday', 'Когда-нибудь')}</option>
                </select>
              </label>
            )}
            {captureType === 'task' && (
              <label className="command-menu-status">
                {t('Project', 'Проект')}
                <select
                  value={projectId}
                  disabled={working}
                  onChange={(event) => setProjectId(event.target.value)}
                >
                  <option value="">{t('No project', 'Без проекта')}</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title || project.id}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p className="command-menu-explainer">
              {captureType === 'note'
                ? t(
                    'Append a note to Inbox.md. Review the change before applying it.',
                    'Подготовьте заметку в выбранном пространстве. Проверьте изменение перед сохранением.'
                  )
                : t(
                    'Prepare a task preview. It is added only after you apply the change.',
                    'Подготовьте просмотр задачи. Она появится только после подтверждения изменения.'
                  )}
            </p>
            {!writable && (
              <p className="command-menu-readonly">
                {t(
                  'Workspace is read-only. Your draft stays here until reload.',
                  'Пространство доступно только для чтения. Черновик останется здесь до перезагрузки.'
                )}
              </p>
            )}
            {error && (
              <p className="command-menu-error" role="alert">
                {error}
              </p>
            )}
            <div className="command-menu-capture-footer">
              <button
                type="button"
                disabled={working || !draft}
                className="command-menu-clear"
                onClick={() => {
                  setDraft('');
                  setError('');
                }}
              >
                {t('Clear draft', 'Очистить черновик')}
              </button>
              <button type="submit" disabled={working || !writable || !draft.trim()}>
                {working ? t('Preparing…', 'Подготовка…') : t('Preview', 'Просмотреть')}{' '}
                <kbd>⌘ / Ctrl ↵</kbd>
              </button>
            </div>
            <small className="command-menu-draft-help">
              {t(
                'Draft remains available when you reopen this window; clear it when finished. Reload clears the draft.',
                'Черновик останется при повторном открытии; очистите его, когда закончите. Перезагрузка удалит черновик.'
              )}
            </small>
          </form>
        )}
        {mode === 'navigation' && (
          <div className="command-menu-navigation">
            <label className="command-menu-search-label" htmlFor={`${uid}-search`}>
              {t('Search in English or Russian', 'Поиск на английском или русском')}
            </label>
            <input
              ref={search}
              id={`${uid}-search`}
              type="search"
              role="combobox"
              autoComplete="off"
              value={query}
              aria-expanded="true"
              aria-controls={`${uid}-results`}
              aria-activedescendant={
                commands[selected] ? `${uid}-option-${commands[selected].id}` : undefined
              }
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(0);
              }}
              onKeyDown={(event) => {
                if (event.isComposing || event.repeat) return;
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  event.preventDefault();
                  setSelected((index) =>
                    commands.length
                      ? (index + (event.key === 'ArrowDown' ? 1 : -1) + commands.length) %
                        commands.length
                      : 0
                  );
                } else if (event.key === 'Enter' && commands[selected]) {
                  event.preventDefault();
                  navigate(commands[selected].id);
                }
              }}
            />
            <div
              id={`${uid}-results`}
              role="listbox"
              aria-label={t('Pages', 'Страницы')}
              className="command-menu-results"
            >
              {commands.map((item, index) => (
                <div key={item.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    id={`${uid}-option-${item.id}`}
                    aria-selected={selected === index}
                    tabIndex={-1}
                    onMouseEnter={() => setSelected(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => navigate(item.id)}
                  >
                    <span>
                      <small>{item.number || '◇'}</small>
                      {item.displayLabel}
                    </span>
                    <span className="command-menu-result-group">{item.group || 'AI Agent'}</span>
                  </button>
                </div>
              ))}
            </div>
            {!commands.length && (
              <p className="command-menu-empty" role="status">
                {t('No matching pages.', 'Подходящих страниц нет.')}
              </p>
            )}
            <div className="command-menu-navigation-footer">
              <span>↑ ↓ · Enter · Esc</span>
              <button type="button" onClick={() => open('help')}>
                {t('Shortcut help', 'Горячие клавиши')}
              </button>
            </div>
          </div>
        )}
        {mode === 'help' && (
          <div className="command-menu-help">
            <p>
              {t(
                'Use Ctrl instead of ⌘ on Windows and Linux. Navigation shortcuts leave text fields alone.',
                'На Windows и Linux используйте Ctrl вместо ⌘. Навигационные сочетания не работают во время ввода текста.'
              )}
            </p>
            <dl>
              {[
                ['⌘ / Ctrl K', 'Quick capture: note or task', 'Быстрая запись: заметка или задача'],
                ['⌘ / Ctrl Shift K', 'Find a page', 'Найти страницу'],
                ['Alt 1…9', 'First nine menu pages', 'Первые девять страниц меню'],
                ['⌘ / Ctrl Shift D', 'Today', 'Сегодня'],
                ['⌘ / Ctrl Shift P', 'Projects', 'Проекты'],
                ['⌘ / Ctrl Shift R', 'Review', 'Обзор'],
                ['⌘ / Ctrl Shift A', 'AI Agent', 'AI Agent'],
                ['?', 'Shortcut help, outside text fields', 'Справка вне текстовых полей'],
                ['Esc', 'Close this window', 'Закрыть окно'],
              ].map(([key, en, ru]) => (
                <div key={key}>
                  <dt>
                    <kbd>{key}</kbd>
                  </dt>
                  <dd>{t(en, ru)}</dd>
                </div>
              ))}
            </dl>
            <button type="button" onClick={() => open('navigation')}>
              {t('Find a page', 'Найти страницу')}
            </button>
          </div>
        )}
      </dialog>
    </div>
  );
}
