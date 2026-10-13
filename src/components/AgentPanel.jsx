import { useEffect, useRef, useState } from 'react';
import {
  contextNoteTitle,
  contextSource,
  conversationMarkdown,
  handoffMarkdown,
  parseContextPreview,
} from './agent-export.js';
import { parseSession, serializeSession } from './agent-session.js';
import NoteContent from './NoteContent.jsx';

async function call(path, body, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(path, {
      method: method || (body === undefined ? 'GET' : 'POST'),
      credentials: 'same-origin',
      signal: controller.signal,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  } catch (error) {
    if (error.name === 'AbortError')
      throw new Error('The model took too long to respond. Try again.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function ContextPreview({ context, locale = 'en' }) {
  const tr = (en, ru) => (locale === 'ru' ? ru : en);
  const preview = parseContextPreview(context.text);
  return (
    <div className="agent-readable-context">
      {preview ? (
        <>
          <div className="agent-context-request">
            <h3>{tr('Your request', 'Ваш запрос')}</h3>
            <p>
              {preview.instruction ||
                tr('No additional request.', 'Дополнительный запрос не задан.')}
            </p>
          </div>
          <div className="agent-context-boundary">
            <h3>{tr('How these sources are used', 'Как используются источники')}</h3>
            <p>
              {tr(
                'Notes are source material. They do not authorize changes, actions or sharing.',
                'Заметки - материал для работы. Они не разрешают изменения, действия или передачу данных.'
              )}
            </p>
            {preview.notice && <p>{preview.notice}</p>}
          </div>
          <div className="agent-context-notes">
            {preview.notes.length ? (
              preview.notes.map((note) => (
                <article
                  className="agent-context-note"
                  key={`${note.vault || 'main'}:${note.path}:${note.startLine || 0}`}
                >
                  <header>
                    <h3>{contextNoteTitle(note)}</h3>
                    <p className="agent-context-source">{contextSource(note, locale)}</p>
                  </header>
                  <NoteContent text={note.text} title={contextNoteTitle(note)} />
                  <details className="agent-note-original">
                    <summary>{tr('Exact source text', 'Точный текст источника')}</summary>
                    <pre>{note.text}</pre>
                  </details>
                </article>
              ))
            ) : (
              <p>{tr('No source passages selected.', 'Фрагменты источников не выбраны.')}</p>
            )}
          </div>
        </>
      ) : (
        <p role="alert">
          {tr(
            'This context format cannot be displayed. Inspect the original in Advanced before sharing.',
            'Этот формат контекста не удалось отобразить. Перед передачей проверьте оригинал в дополнительных данных.'
          )}
        </p>
      )}
      <details className="agent-context-audit">
        <summary>
          {tr('Advanced: exact context JSON', 'Дополнительно: точный JSON контекста')}
        </summary>
        <label className="agent-label">
          {tr('Original payload, read only', 'Исходные данные, только чтение')}
          <textarea className="agent-context-text" readOnly rows={8} value={context.text} />
        </label>
      </details>
    </div>
  );
}

export default function AgentPanel({ workspace, locale, isDemo = false }) {
  const ru = locale === 'ru';
  const tr = (en, russian) => (ru ? russian : en);
  const [providers, setProviders] = useState([]);
  const [provider, setProvider] = useState('local');
  const [model, setModel] = useState('');
  const [reasoningEffort, setReasoningEffort] = useState('none');
  const [localModels, setLocalModels] = useState([]);
  const [checkingModels, setCheckingModels] = useState(false);
  const [modelsChecked, setModelsChecked] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [projectIds, setProjectIds] = useState([]);
  const [recordPaths, setRecordPaths] = useState([]);
  const [recordCatalog, setRecordCatalog] = useState([]);
  const [vaultProjects, setVaultProjects] = useState([]);
  const [vaultClaims, setVaultClaims] = useState([]);
  const [modelVaults, setModelVaults] = useState([]);
  const [includeInbox, setIncludeInbox] = useState(false);
  const [includeTasks, setIncludeTasks] = useState(false);
  const [includeReview, setIncludeReview] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [query, setQuery] = useState(isDemo ? 'garden observation listening' : '');
  const [context, setContext] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [sessionText, setSessionText] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [expired, setExpired] = useState(false);
  const importRef = useRef(null);
  const selected = providers.find((item) => item.id === provider);
  const projects = workspace?.projects || [];
  useEffect(() => {
    let active = true;
    Promise.all([call('/api/agent/providers'), call('/api/profile'), call('/api/vaults')])
      .then(([data, profile, catalog]) => {
        setModelVaults(catalog.vaults.filter((vault) => vault.id !== 'main'));
        setRecordCatalog(catalog.vaults.find((vault) => vault.id === 'main')?.records || []);
        if (!active) return;
        setProviders(data.providers);
        setEnabled(profile.agent.enabled);
        setModel(data.providers.find((item) => item.id === 'local')?.model || '');
      })
      .catch((reason) => {
        if (active) setError(reason.message);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!context) {
      setExpired(false);
      return;
    }
    const check = () => setExpired(Date.now() >= context.expiresAt);
    check();
    const timer = setInterval(check, 10000);
    return () => clearInterval(timer);
  }, [context]);
  function invalidate() {
    setContext(null);
    setConsent(false);
    setNotice('');
  }
  async function checkLocalModels() {
    if (checkingModels || busy || provider !== 'local' || !selected?.configured) return;
    setCheckingModels(true);
    setModelsError('');
    setModelsChecked(false);
    setLocalModels([]);
    try {
      const result = await call('/api/agent/models');
      setLocalModels(result.models);
      setModelsChecked(true);
    } catch {
      setModelsError(
        tr(
          'Could not check local models. Start your local model server, confirm its endpoint in .env, and try again.',
          'Не удалось проверить локальные модели. Запустите локальный сервер, проверьте его адрес в .env и повторите.'
        )
      );
    } finally {
      setCheckingModels(false);
    }
  }
  async function toggleEnabled(value) {
    setBusy(true);
    setError('');
    try {
      const data = await call('/api/profile', { profile: { agent: { enabled: value } } });
      setEnabled(data.agent.enabled);
      setConsent(false);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }
  async function prepare(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await call('/api/agent/context', {
        projectIds,
        recordPaths,
        vaultProjects,
        vaultClaims,
        includeInbox,
        includeTasks,
        includeReview,
        instruction,
        query,
      });
      setContext(data);
      setConsent(false);
      setNotice(
        tr(
          'Context ready. Review every line before sending or exporting.',
          'Контекст готов. Проверьте каждую строку перед отправкой или экспортом.'
        )
      );
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }
  async function send(event) {
    event.preventDefault();
    if (!context || expired || !enabled || !consent || !draft.trim()) return;
    const next = [...messages, { role: 'user', content: draft.trim(), uiId: crypto.randomUUID() }];
    if (
      next.length > 19 ||
      new TextEncoder().encode(JSON.stringify(next.map(({ role, content }) => ({ role, content }))))
        .length > 32000
    ) {
      setError(
        tr(
          'This session is full. Export it, then start a new session.',
          'Сессия заполнена. Экспортируйте её и начните новую.'
        )
      );
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data = await call('/api/agent/chat', {
        provider,
        model: model.trim(),
        ...(provider === 'local' && reasoningEffort ? { reasoningEffort } : {}),
        messages: next.map(({ role, content }) => ({ role, content })),
        contextId: context.contextId,
        consent: true,
      });
      setMessages([...next, { ...data.message, uiId: crypto.randomUUID() }]);
      setDraft('');
      setConsent(false);
      setNotice(
        tr(
          'Reply received. Nothing was written to your notes.',
          'Ответ получен. Заметки не изменены.'
        )
      );
    } catch (reason) {
      setError(reason.message);
      setConsent(false);
    } finally {
      setBusy(false);
    }
  }
  function handoff() {
    if (!context) return '';
    return handoffMarkdown({ context, provider, model, messages }, locale);
  }
  async function saveMarkdownSession() {
    if (busy || !messages.length) return;
    setBusy(true);
    setError('');
    try {
      const data = JSON.parse(serializeSession({ provider, model: model.trim(), messages }));
      const key = `main-agent-session-${crypto.randomUUID()}`;
      const saved = await call(`/api/state/${key}`, { data, revision: 0, hash: null }, 'PUT');
      setNotice(`Conversation saved locally: ${saved.path}. Excluded from retrieval by default.`);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }
  function exportSession() {
    setError('');
    try {
      const exportModel = /^[a-zA-Z0-9][a-zA-Z0-9_.:/+-]{0,119}$/.test(model.trim())
        ? model.trim()
        : '';
      const text = serializeSession({ provider, model: exportModel, messages });
      setSessionText(text);
      setShowTransfer(true);
      download('personal-os-session.json', text, 'application/json');
      setNotice(
        tr(
          'Conversation prepared. Copy the JSON below if downloading is unavailable. Selected note context is omitted.',
          'Диалог подготовлен. Если скачивание недоступно, скопируйте JSON ниже. Выбранные заметки в него не входят.'
        )
      );
    } catch (reason) {
      setError(reason.message);
    }
  }
  function loadSessionText(text) {
    const data = parseSession(text);
    setMessages(
      data.messages.map(({ role, content }) => ({ role, content, uiId: crypto.randomUUID() }))
    );
    invalidate();
    setError('');
    setNotice(
      tr(
        'Transcript imported. Select notes and prepare fresh context to continue with your local model.',
        'Диалог импортирован. Выберите заметки и подготовьте свежий контекст, чтобы продолжить с любой моделью.'
      )
    );
  }
  async function importSession(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      if (file.size > 64000)
        throw new Error(
          tr('Session file is too large (64 KB maximum).', 'Файл слишком большой (максимум 64 КБ).')
        );
      loadSessionText(await file.text());
    } catch (reason) {
      setError(
        reason instanceof SyntaxError
          ? tr('Invalid JSON session file.', 'Некорректный JSON файл.')
          : reason.message
      );
    }
  }
  function newSession() {
    if (
      messages.length &&
      !window.confirm(
        tr(
          'Clear this in-memory conversation? Export it first if you want to keep it.',
          'Очистить текущий диалог? Сначала экспортируйте его, если хотите сохранить.'
        )
      )
    )
      return;
    setMessages([]);
    setSessionText('');
    setShowTransfer(false);
    setDraft('');
    invalidate();
    setError('');
  }
  return (
    <div
      className="agent-panel"
      aria-busy={busy}
      data-preserve-preview={messages.length > 0 || Boolean(draft.trim())}
    >
      <section className="card agent-intro">
        <span className="eyebrow">{tr('Bring your own model', 'Ваша модель и ваш выбор')}</span>
        <h2>{tr('A thinking partner, on your terms', 'Помощник на ваших условиях')}</h2>
        <p>
          {tr(
            'Prepare a small, visible context and continue with your configured local model. Review any exported material before sharing it outside this workspace.',
            'Prepare a small, visible context and continue with your configured local model. Review any exported material before sharing it outside this workspace.'
          )}
        </p>
        <p className="agent-note">
          {tr(
            'No model runs automatically. Replies are suggestions; note changes still use the normal preview and apply flow. Conversation stays in this tab until you explicitly save or export it. Reloading or closing the browser tab clears it.',
            'Модель не запускается автоматически. Ответы служат предложениями; изменения заметок проходят обычный предпросмотр. Диалог хранится в этой вкладке до явного экспорта. Перезагрузка или закрытие вкладки браузера его очистит.'
          )}
        </p>
        <label className="agent-checkbox">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => toggleEnabled(event.target.checked)}
            disabled={busy}
          />
          {tr(
            'Enable model requests for this workspace',
            'Разрешить запросы к модели для этого пространства'
          )}
        </label>
      </section>
      {error && (
        <div className="agent-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="agent-notice" role="status">
          {notice}
        </div>
      )}
      <form className="card agent-context" onSubmit={prepare}>
        <div className="section-heading">
          <h2>{tr('1. Choose the context', '1. Выберите контекст')}</h2>
          <span className="count-pill">{projectIds.length}</span>
        </div>
        <fieldset disabled={busy}>
          <legend>Saved Markdown records</legend>
          <p>
            Choose only the records needed for this request. Settings and migration archives are
            excluded.
          </p>
          {recordCatalog.length ? (
            recordCatalog.map((record) => (
              <label className="agent-checkbox" key={record.path}>
                <input
                  type="checkbox"
                  checked={recordPaths.includes(record.path)}
                  onChange={(event) => {
                    setRecordPaths((paths) =>
                      event.target.checked
                        ? [...paths, record.path]
                        : paths.filter((path) => path !== record.path)
                    );
                    invalidate();
                  }}
                />
                <span>
                  {record.title}
                  <small>{record.path}</small>
                </span>
              </label>
            ))
          ) : (
            <p>
              No saved records yet. Records appear here after a page is saved or storage is
              migrated.
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              try {
                const catalog = await call('/api/vaults');
                setRecordCatalog(
                  catalog.vaults.find((vault) => vault.id === 'main')?.records || []
                );
                invalidate();
              } catch (reason) {
                setError(reason.message);
              }
            }}
          >
            Refresh saved records
          </button>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>{tr('Projects to include', 'Какие проекты включить')}</legend>
          <div className="agent-project-list">
            {projects.length ? (
              projects.map((project) => (
                <label className="agent-checkbox" key={project.id}>
                  <input
                    type="checkbox"
                    checked={projectIds.includes(project.id)}
                    onChange={(event) => {
                      setProjectIds((ids) =>
                        event.target.checked
                          ? [...ids, project.id]
                          : ids.filter((id) => id !== project.id)
                      );
                      invalidate();
                    }}
                  />
                  <span>
                    {project.title}
                    <small>
                      {project.area} · {project.status}
                    </small>
                  </span>
                </label>
              ))
            ) : (
              <p>
                {tr(
                  'No projects yet. You can still prepare an interview prompt.',
                  'Пока нет проектов. Можно подготовить запрос для интервью.'
                )}
              </p>
            )}
          </div>
          <div className="agent-optional">
            <label className="agent-checkbox">
              <input
                type="checkbox"
                checked={includeTasks}
                onChange={(event) => {
                  setIncludeTasks(event.target.checked);
                  invalidate();
                }}
              />
              {tr('Include task lists', 'Включить списки задач')}
            </label>
            <label className="agent-checkbox">
              <input
                type="checkbox"
                checked={includeReview}
                onChange={(event) => {
                  setIncludeReview(event.target.checked);
                  invalidate();
                }}
              />
              {tr('Include weekly review', 'Включить обзор недели')}
            </label>
          </div>
          <div className="agent-model-vaults">
            {modelVaults.map((vault) => (
              <fieldset key={vault.id}>
                <legend>{vault.title}</legend>
                {vault.configured
                  ? vault.projects.map((project) => (
                      <label key={project.id}>
                        <input
                          type="checkbox"
                          checked={vaultProjects.some(
                            (item) => item.vault === vault.id && item.id === project.id
                          )}
                          onChange={(event) => {
                            setVaultProjects((previous) =>
                              event.target.checked
                                ? [...previous, { vault: vault.id, id: project.id }]
                                : previous.filter(
                                    (item) => !(item.vault === vault.id && item.id === project.id)
                                  )
                            );
                            invalidate();
                          }}
                        />
                        {project.title}
                      </label>
                    ))
                  : null}
                {vault.configured &&
                  (vault.claims || []).map((claim) => (
                    <label key={claim.id}>
                      <input
                        type="checkbox"
                        checked={vaultClaims.some(
                          (item) => item.vault === vault.id && item.id === claim.id
                        )}
                        onChange={(event) => {
                          setVaultClaims((previous) =>
                            event.target.checked
                              ? [...previous, { vault: vault.id, id: claim.id }]
                              : previous.filter(
                                  (item) => !(item.vault === vault.id && item.id === claim.id)
                                )
                          );
                          invalidate();
                        }}
                      />
                      {tr('Accepted claim', 'Принятое утверждение')}: {claim.title}
                    </label>
                  ))}
                {vault.configured ? null : <small>{tr('Not configured', 'Не настроен')}</small>}
              </fieldset>
            ))}
          </div>
          <label>
            <input
              type="checkbox"
              checked={includeInbox}
              onChange={(event) => {
                setIncludeInbox(event.target.checked);
                invalidate();
              }}
            />
            {tr('Include Main Vault inbox', 'Включить входящие Main Vault')}
          </label>
          <label className="agent-label">
            {tr(
              'Find passages in selected notes (RAG)',
              'Найти фрагменты в выбранных заметках (RAG)'
            )}
            <input
              value={query}
              maxLength={500}
              onChange={(event) => {
                setQuery(event.target.value);
                invalidate();
              }}
              placeholder={tr('garden, listening, observation', 'сад, слушать, наблюдение')}
            />
            <small>
              {tr(
                'Local SQLite search. Only checked notes are indexed. Leave blank to include whole notes.',
                'Локальный поиск SQLite. Индексируются только отмеченные заметки. Пустой запрос включает заметки целиком.'
              )}
            </small>
          </label>
          <label className="agent-label">
            {tr('What should the agent help with?', 'С чем должен помочь агент?')}
            <textarea
              rows={3}
              maxLength={1500}
              value={instruction}
              onChange={(event) => {
                setInstruction(event.target.value);
                invalidate();
              }}
              placeholder={tr(
                'Help me connect my week theme, chosen project and review. Ask what matters today before suggesting one manageable step.',
                'Помоги связать тему недели, выбранный проект и обзор. Сначала спроси, что важно сегодня, затем предложи один посильный шаг.'
              )}
            />
          </label>
        </fieldset>
        <button className="button primary" type="submit" disabled={busy}>
          {busy
            ? tr('Working…', 'Подготовка…')
            : tr('Prepare context preview', 'Подготовить предпросмотр')}
        </button>
      </form>
      {context && (
        <section className="card agent-preview">
          <h2>{tr('2. Review and take it with you', '2. Проверьте и перенесите')}</h2>
          {context.retrieval && (
            <div className="agent-retrieval">
              <strong>{tr('Retrieved sources', 'Найденные источники')} · SQLite FTS5</strong>
              <p>
                {context.retrieval.indexedNotes} {tr('notes indexed', 'заметок в индексе')} ·{' '}
                {context.retrieval.sources.length} {tr('passages found', 'фрагментов найдено')}
              </p>
              {context.retrieval.sources.length ? (
                <ul>
                  {context.retrieval.sources.map((source) => (
                    <li key={`${source.vault}:${source.path}:${source.startLine}`}>
                      {source.vault} · {source.path} · {source.startLine}-{source.endLine}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>
                  {tr(
                    'No matches. Change the query or selected notes; no unrelated notes were added.',
                    'Совпадений нет. Измените запрос или выбор заметок; посторонние заметки не добавляются.'
                  )}
                </p>
              )}
            </div>
          )}
          <p className="agent-note">
            {tr(
              'This exact context will accompany each request. It expires after 10 minutes; changed notes require a fresh preview. Export contains selected note content.',
              'Именно этот контекст сопровождает каждый запрос. Он действует 10 минут; после изменения заметок нужен новый предпросмотр. Экспорт содержит выбранные заметки.'
            )}
          </p>
          {expired && (
            <p role="status">
              {tr(
                'Context expired. Prepare it again before sending.',
                'Контекст устарел. Подготовьте его заново перед отправкой.'
              )}
            </p>
          )}
          <ContextPreview context={context} locale={locale} />
          <div className="agent-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => download('personal-os-handoff.md', handoff(), 'text/markdown')}
            >
              {tr('Export context + conversation (.md)', 'Экспорт контекста и диалога (.md)')}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(handoff());
                  setNotice(
                    tr('Context and conversation copied.', 'Контекст и диалог скопированы.')
                  );
                } catch {
                  setError(
                    tr(
                      'Clipboard unavailable. Export the handoff file instead.',
                      'Буфер обмена недоступен. Экспортируйте файл.'
                    )
                  );
                }
              }}
            >
              {tr('Copy handoff', 'Скопировать контекст')}
            </button>
          </div>
        </section>
      )}
      <section className="card agent-chat">
        <div className="section-heading">
          <h2>{tr('3. Continue a session', '3. Продолжите сессию')}</h2>
          <button type="button" className="text-button" onClick={newSession} disabled={busy}>
            {tr('New session', 'Новая сессия')}
          </button>
        </div>
        <div className="agent-provider-fields">
          <label className="agent-label">
            {tr('Provider', 'Провайдер')}
            <select
              value={provider}
              disabled={busy}
              onChange={(event) => {
                setProvider(event.target.value);
                setModelsError('');
                setModel(providers.find((item) => item.id === event.target.value)?.model || '');
                setConsent(false);
              }}
            >
              {providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.id === 'local' ? tr('Local LLM', 'Локальная LLM') : item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="agent-label">
            {tr('Model ID', 'Идентификатор модели')}
            <input
              value={model}
              maxLength={120}
              disabled={busy}
              onChange={(event) => {
                setModel(event.target.value);
                setConsent(false);
              }}
              placeholder={tr(
                'Enter an installed or available model ID',
                'Введите установленную или доступную модель'
              )}
            />
          </label>
        </div>
        {provider === 'local' && (
          <label className="agent-label">
            {tr('Reasoning effort · local model', 'Режим рассуждения · локальная модель')}
            <select
              value={reasoningEffort}
              disabled={busy}
              onChange={(event) => {
                setReasoningEffort(event.target.value);
                setConsent(false);
              }}
            >
              <option value="">
                {tr('Default · let the server decide', 'По умолчанию · решает сервер')}
              </option>
              <option value="none">
                {tr('None · direct answer', 'Без рассуждений · прямой ответ')}
              </option>
              <option value="low">{tr('Low', 'Низкий')}</option>
              <option value="medium">{tr('Medium', 'Средний')}</option>
              <option value="high">{tr('High', 'Высокий')}</option>
            </select>
            <small className="agent-note">
              {tr(
                'Starts at None for a direct local reply. If your compatible server rejects this option, choose Default to omit it. Reasoning modes may take longer.',
                'Начальный режим - без рассуждений для прямого локального ответа. Если сервер не поддерживает параметр, выберите «По умолчанию», чтобы не отправлять его. Рассуждение может занять больше времени.'
              )}
            </small>
          </label>
        )}
        <p className="agent-note">
          {selected?.endpoint || tr('Loading provider settings…', 'Загружаем настройки…')}
          <br />
          {selected?.configured
            ? tr(
                'Endpoint configured. Check local model IDs explicitly, or review context before sending; choose a downloaded model for offline use.',
                'Адрес настроен. Явно проверьте список моделей или просмотрите контекст перед отправкой; для офлайн выберите скачанную модель.'
              )
            : tr(
                'Configure the local model endpoint in .env and restart the app. Notes stay in the selected local context.',
                'Configure the local model endpoint in .env and restart the app. Notes stay in the selected local context.'
              )}
        </p>
        {provider === 'local' && (
          <div className="agent-local-models">
            <button
              type="button"
              className="text-button"
              disabled={busy || checkingModels || !selected?.configured}
              onClick={checkLocalModels}
            >
              {checkingModels
                ? tr('Checking local models…', 'Проверяем локальные модели…')
                : tr('Check local models', 'Проверить локальные модели')}
            </button>
            <p className="agent-note">
              {tr(
                'This explicitly reads only the local server’s model list. Notes and conversation are not sent.',
                'Проверка запрашивает только список моделей локального сервера. Заметки и диалог не отправляются.'
              )}
            </p>
            {modelsError && (
              <p className="agent-error" role="alert">
                {modelsError}
              </p>
            )}
            {modelsChecked && localModels.length === 0 && (
              <p className="agent-note" role="status">
                {tr(
                  'No installed models were returned. Install a model in your local server, then check again.',
                  'Сервер не вернул установленных моделей. Установите модель в локальном сервере и повторите проверку.'
                )}
              </p>
            )}
            {localModels.length > 0 && (
              <label className="agent-label">
                {tr('Installed local models', 'Установленные локальные модели')}
                <select
                  value={localModels.includes(model) ? model : ''}
                  disabled={busy || checkingModels}
                  onChange={(event) => {
                    if (event.target.value) {
                      setModel(event.target.value);
                      setConsent(false);
                    }
                  }}
                >
                  <option value="">
                    {tr('Choose a returned model ID', 'Выберите модель из списка')}
                  </option>
                  {localModels.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        )}
        <div
          className="agent-transcript"
          role="log"
          aria-label={tr('Conversation', 'Диалог')}
          aria-live="polite"
          aria-busy={busy}
        >
          {messages.length ? (
            messages.map((message) => (
              <article className={`agent-message agent-message-${message.role}`} key={message.uiId}>
                <span className="eyebrow">
                  {message.role === 'user' ? tr('You', 'Вы') : tr('Agent', 'Агент')}
                </span>
                <p>{message.content}</p>
              </article>
            ))
          ) : (
            <p className="agent-note">
              {tr(
                'Start fresh or import an exported conversation to continue with your local model.',
                'Начните новый диалог или импортируйте сохранённый. Можно сменить провайдера, сохранив видимую историю.'
              )}
            </p>
          )}
        </div>
        <form onSubmit={send} className="agent-compose">
          <label className="agent-label">
            {tr('Message', 'Сообщение')}
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={6000}
              rows={4}
              disabled={busy}
              placeholder={tr('Help me choose the next step…', 'Помоги выбрать следующий шаг…')}
            />
          </label>
          <label className="agent-checkbox">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
              disabled={busy || !context || expired || !enabled}
            />
            <span>
              {provider === 'local'
                ? tr(
                    'Send the previewed context, visible history and message to my configured local model.',
                    'Отправить проверенный контекст, видимую историю и сообщение выбранной локальной модели.'
                  )
                : tr(
                    'Send the previewed context, visible history and message to this cloud provider. API usage may be billed.',
                    'Отправить проверенный контекст, видимую историю и сообщение облачному провайдеру. Использование API может быть платным.'
                  )}
            </span>
          </label>
          <button
            type="submit"
            className="button primary"
            disabled={
              busy ||
              !enabled ||
              !context ||
              expired ||
              !consent ||
              !model.trim() ||
              !draft.trim() ||
              !selected?.configured
            }
          >
            {busy
              ? tr('Waiting for model…', 'Ожидаем модель…')
              : tr('Send to model', 'Отправить модели')}
          </button>
        </form>
        <div className="agent-session-actions">
          <button type="button" onClick={saveMarkdownSession} disabled={busy || !messages.length}>
            Save conversation to Markdown
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy || !messages.length}
            onClick={() =>
              download(
                'personal-os-conversation.md',
                conversationMarkdown({ provider, model, messages, context }, locale),
                'text/markdown'
              )
            }
          >
            {tr('Export conversation (.md)', 'Экспорт диалога (.md)')}
          </button>
        </div>
        <details className="agent-session-backup">
          <summary>
            {tr(
              'Advanced: session backup and restore',
              'Дополнительно: резервная копия и восстановление сессии'
            )}
          </summary>
          <div className="agent-session-actions">
            <button
              type="button"
              className="text-button"
              onClick={exportSession}
              disabled={busy || !messages.length}
            >
              {tr('Export conversation JSON', 'Экспорт диалога JSON')}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => importRef.current?.click()}
              disabled={busy}
            >
              {tr('Import conversation JSON', 'Импорт диалога JSON')}
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setShowTransfer((value) => !value)}
              disabled={busy}
            >
              {tr('Paste session JSON', 'Вставить JSON сессии')}
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={importSession}
            />
          </div>
          {showTransfer && (
            <div className="agent-transfer">
              <label className="agent-label">
                {tr(
                  'Session JSON: copy or paste to import',
                  'JSON сессии: скопируйте или вставьте для импорта'
                )}
                <textarea
                  rows={8}
                  value={sessionText}
                  maxLength={64000}
                  onChange={(event) => setSessionText(event.target.value)}
                />
              </label>
              <div className="agent-actions">
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy || !sessionText.trim()}
                  onClick={() => {
                    try {
                      loadSessionText(sessionText);
                    } catch (reason) {
                      setError(reason.message);
                    }
                  }}
                >
                  {tr('Load pasted session', 'Загрузить вставленную сессию')}
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={!sessionText}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(sessionText);
                      setNotice(tr('Session JSON copied.', 'JSON сессии скопирован.'));
                    } catch {
                      setError(
                        tr(
                          'Select and copy the JSON text manually.',
                          'Выделите и скопируйте JSON вручную.'
                        )
                      );
                    }
                  }}
                >
                  {tr('Copy session JSON', 'Скопировать JSON сессии')}
                </button>
              </div>
            </div>
          )}
        </details>
      </section>
    </div>
  );
}
