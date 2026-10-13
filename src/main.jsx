import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import AgentPanel from './components/AgentPanel.jsx';
import CommandMenu from './components/CommandMenu.jsx';
import { copy } from './components/copy.js';
import DailySources from './components/DailySources.jsx';
import DemoPages, { MainRhythm } from './components/DemoPages.jsx';
import Lighthouse from './components/Lighthouse.jsx';
import LivePreview from './components/LivePreview.jsx';
import MainDecisions from './components/MainDecisions.jsx';
import MainGarden from './components/MainGarden.jsx';
import MarkdownView from './components/MarkdownView.jsx';
import NativeConnections from './components/NativeConnections.jsx';
import ObservationReview from './components/ObservationReview.jsx';
import OwnerPasskey from './components/OwnerPasskey.jsx';
import PreviewDialog from './components/PreviewDialog.jsx';
import ReviewForm from './components/ReviewForm.jsx';
import VaultOverview from './components/VaultOverview.jsx';
import WindowScene from './components/WindowScene.jsx';
import WorkspaceGraph from './components/WorkspaceGraph.jsx';
import { resolveDayPhase } from './environment/day-phase.js';
import { interpolateLighting } from './environment/lighting-tokens.js';
import Lighting from './features/Lighting.jsx';
import Setup from './features/Setup.jsx';
import SetupHub, { DashboardPreferences } from './features/SetupHub.jsx';
import { useStoredState } from './hooks/useStoredState.js';
import { getPageCopy, NAV_GROUPS, UTILITIES } from './navigation.js';

const DEFAULT_AREAS = [
  { id: 'home', title: 'Home' },
  { id: 'future', title: 'Future' },
  { id: 'learning', title: 'Learning' },
  { id: 'career', title: 'Career' },
  { id: 'work', title: 'Work' },
];
const UNIVERSAL_COPY = {
  en: {
    main: 'Main',
    work: 'Work',
    graph: 'Graph',
    agent: 'AI agent',
    mainTitle: 'The bigger picture.',
    workTitle: 'Room for good work.',
    graphTitle: 'Find the connections.',
    mainIntro: 'A place for every part of life. Keep the projects that matter within reach.',
    workIntro: 'Mark the beginning and end of work, with room for pauses.',
    graphIntro: 'Explore the connections already present in this workspace.',
    agentIntro: 'Choose what to share, inspect the context, and bring your own agent.',
    yourAreas: 'Your areas',
    allAreas: 'All areas',
    area: 'Area',
    areaProjects: 'projects',
    areaSteps: 'open steps',
    currentProjects: 'Current projects',
    manageProjects: 'Manage projects',
    createProject: 'New project',
    editProject: 'Edit project',
    projectTitle: 'Project title',
    projectId: 'File name',
    projectIdHelp:
      'A short, unique name using lowercase letters, numbers, and hyphens. It stays the same after creation.',
    projectBody: 'Project notes',
    projectBodyHelp: 'Plain Markdown. The complete file change will be shown in the preview.',
    projectStatus: 'Status',
    previewProject: 'Preview project',
    createHeading: 'Give an idea a place.',
    editHeading: 'Edit this project.',
    archiveProject: 'Archive project',
    restoreProject: 'Restore project',
    archived: 'Archived',
    archiveHelp: 'Archiving keeps the note and linked tasks. You can restore it later.',
    showArchived: 'Include archived projects',
    noAreaProjects: 'No projects in this area yet.',
    noAreaProjectsHelp: 'Create a project when an idea is ready for attention.',
    workEmpty: 'Your Work area has no projects yet.',
    workEmptyHelp: 'Create a project in Work, or assign an existing project to this area.',
    workTasksHelp: 'Tasks linked to projects in the Work area.',
    projectNotes: 'Project notes',
    noProjectNotes: 'No notes yet. Add context when it helps.',
    editCancel: 'Close editor',
    areasSettings: 'Make room for your own areas',
    areasSettingsHelp: 'Rename areas or add your own. Your notes keep their current assignments.',
    areaName: 'Area name',
    areaId: 'Area ID',
    addArea: 'Add area',
    removeArea: 'Remove area',
    areaUsed: 'Projects use this area; move them before removing it.',
    saveAreas: 'Save areas',
    areasSaved: 'Your areas are saved.',
    areaInvalid:
      'Use a unique ID with lowercase letters, numbers, and hyphens, and give the area a name.',
    areaMinimum: 'Keep at least one area.',
    profileSaved: 'Preferences saved.',
    projectCount: 'projects',
    noAgentConnected: 'Your context, your choice',
    workUnavailable: 'Add an area with ID work in Setup to use this focused view.',
    filterLabel: 'Filter projects by area',
  },
  ru: {
    main: 'Главная',
    work: 'Работа',
    graph: 'Граф',
    agent: 'ИИ-агент',
    mainTitle: 'Общая картина.',
    workTitle: 'Место для хорошей работы.',
    graphTitle: 'Увидеть связи.',
    mainIntro: 'Место для каждой стороны жизни. Важные проекты всегда под рукой.',
    workIntro: 'Отмечайте начало и окончание работы, оставляя место для пауз.',
    graphIntro: 'Исследуйте связи, которые уже есть в этом пространстве.',
    agentIntro: 'Выберите, чем поделиться, проверьте контекст и подключите своего агента.',
    yourAreas: 'Ваши области',
    allAreas: 'Все области',
    area: 'Область',
    areaProjects: 'проектов',
    areaSteps: 'открытых шагов',
    currentProjects: 'Текущие проекты',
    manageProjects: 'Управление проектами',
    createProject: 'Новый проект',
    editProject: 'Изменить проект',
    projectTitle: 'Название проекта',
    projectId: 'Имя файла',
    projectIdHelp:
      'Короткое уникальное имя: латинские буквы, цифры и дефисы. После создания оно не меняется.',
    projectBody: 'Заметки проекта',
    projectBodyHelp: 'Обычный Markdown. Предпросмотр покажет полное изменение файла.',
    projectStatus: 'Статус',
    previewProject: 'Предпросмотр проекта',
    createHeading: 'Дайте идее своё место.',
    editHeading: 'Немного заботы об этом проекте.',
    archiveProject: 'В архив',
    restoreProject: 'Восстановить проект',
    archived: 'В архиве',
    archiveHelp: 'Архив сохраняет заметку и связанные задачи. Проект можно восстановить.',
    showArchived: 'Показывать архив',
    noAreaProjects: 'В этой области пока нет проектов.',
    noAreaProjectsHelp: 'Создайте проект, когда что-то будет готово к вашему вниманию.',
    workEmpty: 'В области Work пока нет проектов.',
    workEmptyHelp: 'Создайте проект в Work или перенесите сюда существующий.',
    workTasksHelp: 'Задачи, связанные с проектами области Work.',
    projectNotes: 'Заметки проекта',
    noProjectNotes: 'Заметок пока нет. Добавьте контекст, когда это будет полезно.',
    editCancel: 'Закрыть редактор',
    areasSettings: 'Место для ваших собственных областей',
    areasSettingsHelp: 'Переименуйте области или добавьте свои. Назначения заметок сохранятся.',
    areaName: 'Название области',
    areaId: 'ID области',
    addArea: 'Добавить область',
    removeArea: 'Удалить область',
    areaUsed: 'Сначала перенесите проекты из этой области в другую.',
    saveAreas: 'Сохранить области',
    areasSaved: 'Ваши области сохранены.',
    areaInvalid: 'Укажите название и уникальный ID: латинские строчные буквы, цифры и дефисы.',
    areaMinimum: 'Оставьте хотя бы одну область.',
    profileSaved: 'Настройки сохранены.',
    projectCount: 'проектов',
    noAgentConnected: 'Ваш контекст, ваш выбор',
    workUnavailable: 'Добавьте область с ID work в настройках, чтобы использовать этот раздел.',
    filterLabel: 'Фильтр проектов по области',
  },
};

const DEFAULT_PROFILE = {
  areas: DEFAULT_AREAS,
  version: 1,
  locale: 'en',
  firstOutcome: '',
  workflow: 'simple',
  availableMinutes: 15,
  reviewDay: 0,
  reviewTime: '17:00',
  lighting: {
    mode: 'schedule',
    manualPhase: 'day',
    schedule: { wake: '07:00', day: '09:00', evening: '18:00', sleep: '22:30' },
    coordinates: null,
    timezone: 'UTC',
  },
  accessibility: { reduceMotion: false, highContrast: false, staticScene: false },
  agent: { enabled: false, persistTranscript: false },
  onboardingComplete: false,
};
const DEMO_PAGES = [
  'today',
  'gtd',
  'calendar',
  'work',
  'home',
  'health',
  'future',
  'career',
  'learning',
  'library',
];

async function request(path, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      credentials: 'same-origin',
      signal: controller.signal,
      ...(body === undefined
        ? {}
        : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status})`);
    return result;
  } catch (error) {
    if (error.name === 'AbortError')
      throw new Error('The local app took too long to respond. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function Icon({ name, size = 20 }) {
  const paths = {
    main: (
      <>
        <path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7" />
      </>
    ),
    work: (
      <>
        <rect x="3" y="7" width="18" height="14" rx="2" />
        <path d="M8 7V3h8v4M3 12q9 5 18 0M12 12v4" />
      </>
    ),
    graph: (
      <>
        <circle cx="12" cy="4" r="2" />
        <circle cx="4" cy="17" r="2" />
        <circle cx="20" cy="17" r="2" />
        <path d="m11 6-6 9m8-9 6 9M6 17h12" />
      </>
    ),
    agent: (
      <>
        <rect x="4" y="7" width="16" height="13" rx="3" />
        <path d="M12 3v4M8 16h8" />
        <circle cx="8" cy="12" r="1" />
        <circle cx="16" cy="12" r="1" />
      </>
    ),
    today: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    projects: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </>
    ),
    review: (
      <>
        <path d="M8 3H5v18h14V3h-3M9 2h6v4H9Z" />
        <path d="m8 12 2 2 5-5m-7 9h8" />
      </>
    ),
    setup: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" fill="var(--panel)" />
        <circle cx="15" cy="17" r="3" fill="var(--panel)" />
      </>
    ),
    leaf: (
      <>
        <path d="M19 4C9 3 3 8 5 16c8 3 15-2 14-12ZM5 20 15 9" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name] || paths.today}
    </svg>
  );
}

function ProjectEditor({ project, areas, onPreview, onCancel, t, busy, writable }) {
  const [draft, setDraft] = useState(project);
  const editorRef = useRef(null);
  useEffect(() => {
    editorRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
    editorRef.current?.querySelector('input')?.focus({ preventScroll: true });
  }, []);
  function patch(values) {
    setDraft((previous) => ({ ...previous, ...values }));
  }
  function submit(event) {
    event.preventDefault();
    const common = {
      id: draft.id.trim(),
      title: draft.title.trim(),
      area: draft.area,
      body: draft.body || '',
    };
    onPreview(
      draft.creating
        ? { type: 'project-create', ...common }
        : { type: 'project-update', ...common, status: draft.status }
    );
  }
  return (
    <form className="card project-editor" onSubmit={submit} ref={editorRef}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t(draft.creating ? 'createProject' : 'editProject')}</span>
          <h2>{t(draft.creating ? 'createHeading' : 'editHeading')}</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label={t('editCancel')}
          onClick={onCancel}
          disabled={busy}
        >
          ×
        </button>
      </div>
      <label className="field">
        <span>{t('projectTitle')}</span>
        <input
          autoComplete="off"
          maxLength={160}
          value={draft.title}
          onChange={(event) => patch({ title: event.target.value })}
          required
          disabled={!writable || busy}
        />
      </label>
      <label className="field">
        <span>{t('projectId')}</span>
        <input
          autoComplete="off"
          spellCheck={false}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={80}
          value={draft.id}
          onChange={(event) => patch({ id: event.target.value.toLowerCase() })}
          readOnly={!draft.creating}
          disabled={!writable || busy}
          required
        />
        <small>{t('projectIdHelp')}</small>
      </label>
      <div className="fields-row">
        <label className="field">
          <span>{t('area')}</span>
          <select
            value={draft.area}
            onChange={(event) => patch({ area: event.target.value })}
            disabled={!writable || busy}
          >
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.title}
              </option>
            ))}
          </select>
        </label>
        {!draft.creating && (
          <label className="field">
            <span>{t('projectStatus')}</span>
            <select
              value={draft.status}
              onChange={(event) => patch({ status: event.target.value })}
              disabled={!writable || busy}
            >
              {['active', 'paused', 'archived'].map((status) => (
                <option key={status} value={status}>
                  {t(status)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label className="field">
        <span>{t('projectBody')}</span>
        <textarea
          rows={7}
          maxLength={12000}
          value={draft.body || ''}
          onChange={(event) => patch({ body: event.target.value })}
          disabled={!writable || busy}
        />
        <small>{t('projectBodyHelp')}</small>
      </label>
      {!draft.creating && <p className="field-help">{t('archiveHelp')}</p>}
      <div className="editor-actions">
        <button type="button" className="button secondary" onClick={onCancel} disabled={busy}>
          {t('cancel')}
        </button>
        <button
          type="submit"
          className="button primary"
          disabled={!writable || busy || !draft.title.trim() || !draft.id.trim()}
        >
          {t('previewProject')} <span aria-hidden="true">↗</span>
        </button>
      </div>
    </form>
  );
}

function AreasManager({ areas, projects, onSave, busy, t }) {
  const [draft, setDraft] = useState(areas);
  const [newTitle, setNewTitle] = useState('');
  const [newId, setNewId] = useState('');
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(areas);
  function add(event) {
    event.preventDefault();
    if (
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(newId) ||
      !newTitle.trim() ||
      draft.some((area) => area.id === newId)
    ) {
      setError(t('areaInvalid'));
      return;
    }
    setDraft([...draft, { id: newId, title: newTitle.trim() }]);
    setNewTitle('');
    setNewId('');
    setError('');
  }
  async function save() {
    setError('');
    try {
      await onSave(draft);
    } catch (reason) {
      setError(reason.message);
    }
  }
  return (
    <section className="card areas-manager" aria-labelledby="areas-settings-title">
      <div className="section-heading">
        <h2 id="areas-settings-title">{t('areasSettings')}</h2>
        <span className="count-pill">{draft.length}/100</span>
      </div>
      <p className="card-description">{t('areasSettingsHelp')}</p>
      <div className="area-edit-list">
        {draft.map((area) => {
          const used = projects.some((project) => project.area === area.id);
          return (
            <div className="area-edit-row" key={area.id}>
              <label className="field">
                <span>
                  {t('areaName')} · <code>{area.id}</code>
                </span>
                <input
                  value={area.title}
                  maxLength={80}
                  required
                  disabled={busy}
                  onChange={(event) =>
                    setDraft(
                      draft.map((entry) =>
                        entry.id === area.id ? { ...entry, title: event.target.value } : entry
                      )
                    )
                  }
                />
              </label>
              <button
                type="button"
                className="icon-button"
                disabled={busy || used || draft.length <= 1}
                title={
                  used ? t('areaUsed') : draft.length <= 1 ? t('areaMinimum') : t('removeArea')
                }
                aria-label={`${t('removeArea')}: ${area.title}`}
                onClick={() => setDraft(draft.filter((entry) => entry.id !== area.id))}
              >
                ×
              </button>
              {used && <small>{t('areaUsed')}</small>}
            </div>
          );
        })}
      </div>
      <form className="new-area-form" onSubmit={add}>
        <div className="fields-row">
          <label className="field">
            <span>{t('areaName')}</span>
            <input
              value={newTitle}
              maxLength={80}
              onChange={(event) => setNewTitle(event.target.value)}
              disabled={busy || draft.length >= 100}
              placeholder={t('areaName')}
            />
          </label>
          <label className="field">
            <span>{t('areaId')}</span>
            <input
              value={newId}
              maxLength={80}
              spellCheck={false}
              onChange={(event) => setNewId(event.target.value.toLowerCase())}
              disabled={busy || draft.length >= 100}
              placeholder="my-area"
            />
          </label>
        </div>
        <button
          type="submit"
          className="button secondary"
          disabled={busy || draft.length >= 100 || !newTitle.trim() || !newId.trim()}
        >
          {t('addArea')} <span aria-hidden="true">+</span>
        </button>
      </form>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="button primary"
        disabled={busy || !dirty || draft.some((area) => !area.title.trim())}
        onClick={save}
      >
        {busy ? t('saving') : t('saveAreas')}
      </button>
    </section>
  );
}

function App() {
  const [tab, setTab] = useState('main');
  const [menuOpen, setMenuOpen] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [storageStatuses, setStorageStatuses] = useState({});
  useEffect(() => {
    const listener = (event) => setStorageError(event.detail);
    window.addEventListener('personal-os-storage-error', listener);
    return () => window.removeEventListener('personal-os-storage-error', listener);
  }, []);
  useEffect(() => {
    const status = (event) =>
      setStorageStatuses((previous) => ({ ...previous, [event.detail.key]: event.detail.phase }));
    window.addEventListener('personal-os-storage-status', status);
    return () => window.removeEventListener('personal-os-storage-status', status);
  }, []);
  const pendingStorage = Object.values(storageStatuses).some((phase) =>
    ['pending', 'saving'].includes(phase)
  );
  const unsavedStorage = pendingStorage || Object.values(storageStatuses).includes('error');
  useEffect(() => {
    const beforeUnload = (event) => {
      if (unsavedStorage) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [unsavedStorage]);
  const [checkIn, setCheckIn] = useStoredState(
    `checkin-${new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())}`,
    { energy: 3, mood: 7 }
  );
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [lighting, setLighting] = useState(DEFAULT_PROFILE.lighting);
  const [workspace, setWorkspace] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);
  const [areaFilter, setAreaFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [previewTime, setPreviewTime] = useState(null);
  const [now, setNow] = useState(new Date());
  const [systemDark, setSystemDark] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [systemMotion, setSystemMotion] = useState(
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const focusHeading = useRef(null);
  const pendingType = useRef(null);
  const locale = 'en';
  const t = useCallback(
    (key) => UNIVERSAL_COPY[locale][key] || copy[locale][key] || copy.en[key] || key,
    []
  );
  const pageCopy = getPageCopy(locale, tab);
  const activeLabel =
    [...NAV_GROUPS.flatMap((group) => group.items), ...UTILITIES].find((item) => item.id === tab)
      ?.label || 'Main';
  const isDemo = workspace?.mode === 'demo';
  const writable = workspace?.writable === true;
  const tasks = workspace?.tasks || [];
  const projects = workspace?.projects || [];
  const areas = profile.areas || DEFAULT_AREAS;
  const currentProjects = projects.filter((project) => project.status !== 'archived');
  const workProjects = currentProjects.filter((project) => project.area === 'work');
  const latestAction = workspace?.recentActions?.[0];
  const lightDirty = JSON.stringify(lighting) !== JSON.stringify(profile.lighting);

  const load = useCallback(async () => {
    setLoadState('loading');
    setLoadError('');
    try {
      const [status, data, saved] = await Promise.all([
        request('/api/status'),
        request('/api/workspace'),
        request('/api/profile'),
      ]);
      const nextProfile = { ...DEFAULT_PROFILE, ...saved, locale: 'en' };
      setProfile(nextProfile);
      setLighting(nextProfile.lighting);
      setWorkspace({ ...data, writable: status.writable && data.writable });
      setLoadState('ready');
    } catch (reason) {
      setLoadError(reason.message);
      setLoadState('error');
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30000);
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const darkChange = (event) => setSystemDark(event.matches);
    const motionChange = (event) => setSystemMotion(event.matches);
    const resume = () => {
      if (!document.hidden) setNow(new Date());
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    dark.addEventListener('change', darkChange);
    motion.addEventListener('change', motionChange);
    return () => {
      clearInterval(tick);
      dark.removeEventListener('change', darkChange);
      motion.removeEventListener('change', motionChange);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = `${activeLabel} · Personal OS`;
  }, [activeLabel]);

  const phaseState = useMemo(() => {
    let date = now;
    if (previewTime && !['manual', 'system'].includes(lighting.mode)) {
      let parts;
      try {
        parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: lighting.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(now);
      } catch {
        parts = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'UTC',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(now);
      }
      const hour = Number(parts.find((part) => part.type === 'hour').value);
      const minute = Number(parts.find((part) => part.type === 'minute').value);
      const [targetHour, targetMinute] = previewTime.split(':').map(Number);
      date = new Date(now.getTime() + ((targetHour - hour) * 60 + targetMinute - minute) * 60000);
    }
    if (lighting.mode === 'system')
      return {
        ...resolveDayPhase(date, {
          ...lighting,
          mode: 'manual',
          manualPhase: systemDark ? 'night' : 'day',
        }),
        source: 'system',
      };
    return resolveDayPhase(date, lighting);
  }, [lighting, now, previewTime, systemDark]);
  const tokens = interpolateLighting(phaseState, {
    highContrast: profile.accessibility.highContrast,
  });
  const style = Object.fromEntries(
    Object.entries(tokens)
      .filter(([, value]) => typeof value === 'string' || typeof value === 'number')
      .map(([key, value]) => [
        `--${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        value,
      ])
  );
  const reduced = profile.accessibility.reduceMotion || systemMotion;
  const isSimulation = Boolean(previewTime && !['manual', 'system'].includes(lighting.mode));
  let dateLabel;
  try {
    dateLabel = new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: lighting.timezone,
    }).format(now);
  } catch {
    dateLabel = new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(now);
  }

  function navigate(nextTab, projectId = null) {
    setMenuOpen(false);
    setTab(nextTab);
    setSelectedProject(projectId);
    setEditingProject(null);
    setError('');
    requestAnimationFrame(() => focusHeading.current?.focus());
  }
  async function refreshWorkspace() {
    const data = await request('/api/workspace');
    setWorkspace(data);
  }
  async function startPreview(action) {
    if (busy || !writable) return;
    setError('');
    setNotice('');
    setPreviewError('');
    setBusy(true);
    try {
      const result = await request('/api/actions/preview', action);
      pendingType.current = action.type;
      setPreview(result);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }
  const closePreview = useCallback(() => {
    setPreview(null);
    setPreviewError('');
  }, []);
  async function apply() {
    if (!preview || busy) return;
    setBusy(true);
    setPreviewError('');
    let applied = false;
    try {
      const result = await request('/api/actions/apply', { previewId: preview.previewId });
      applied = true;
      setPreview(null);
      if (pendingType.current?.startsWith('project-')) setEditingProject(null);
      setNotice(`${t('changed')} ${result.label}`);
      await refreshWorkspace();
    } catch (reason) {
      if (applied) setError(reason.message);
      else setPreviewError(reason.message);
    } finally {
      setBusy(false);
    }
  }
  async function undo() {
    if (!latestAction || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await request('/api/actions/undo', { actionId: latestAction.id });
      await refreshWorkspace();
      setNotice(t('undone'));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile(nextProfile, fromSetup = false) {
    setProfileBusy(true);
    setError('');
    try {
      const result = await request('/api/profile', { profile: { ...nextProfile, locale: 'en' } });
      setProfile(result);
      setLighting(result.lighting);
      setNotice(fromSetup ? (copy[result.locale] || copy.en).setupSaved : t('profileSaved'));
      if (fromSetup) navigate('main');
      const data = await request('/api/workspace');
      setWorkspace(data);
      return result;
    } finally {
      setProfileBusy(false);
    }
  }
  async function saveLighting() {
    try {
      await saveProfile({ lighting });
    } catch (reason) {
      setError(reason.message);
    }
  }
  const selected = projects.find((project) => project.id === selectedProject);
  const visibleTasks = selected ? tasks.filter((task) => task.projectId === selected.id) : tasks;

  function newProject(area = 'work') {
    setTab('projects');
    setSelectedProject(null);
    setEditingProject({
      creating: true,
      id: '',
      title: '',
      area: areas.some((entry) => entry.id === area) ? area : areas[0].id,
      body: '',
      status: 'active',
    });
  }
  function archiveProject(project) {
    startPreview({
      type: 'project-update',
      id: project.id,
      title: project.title,
      area: project.area,
      body: project.body || '',
      status: project.status === 'archived' ? 'active' : 'archived',
    });
  }
  async function saveAreas(nextAreas) {
    await saveProfile({ areas: nextAreas });
    setNotice(t('areasSaved'));
    if (!nextAreas.some((area) => area.id === areaFilter)) setAreaFilter('all');
  }
  function areaProjectOverview() {
    const filtered =
      areaFilter === 'all'
        ? currentProjects
        : currentProjects.filter((project) => project.area === areaFilter);
    return (
      <section className="project-page" aria-labelledby="main-projects-title">
        <div className="section-heading">
          <h2 id="main-projects-title">{t('currentProjects')}</h2>
          <button
            type="button"
            className="text-button"
            disabled={!writable || busy}
            onClick={() => newProject(areaFilter === 'all' ? 'work' : areaFilter)}
          >
            {t('createProject')} <span aria-hidden="true">+</span>
          </button>
        </div>
        <label className="field area-filter">
          <span className="sr-only">{t('filterLabel')}</span>
          <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value)}>
            <option value="all">{t('allAreas')}</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.title}
              </option>
            ))}
          </select>
        </label>
        {filtered.length ? (
          <div className="project-grid">{filtered.map((project) => projectCard(project))}</div>
        ) : (
          <div className="card empty-state">
            <Icon name="projects" size={30} />
            <h3>{t('noAreaProjects')}</h3>
            <p>{t('noAreaProjectsHelp')}</p>
          </div>
        )}
      </section>
    );
  }

  function projectCard(project, compact = false) {
    const linked = tasks.filter((task) => task.projectId === project.id);
    const completed = linked.filter((task) => task.checked).length;
    return (
      <button
        type="button"
        key={project.id}
        className={`project-card ${compact ? 'compact-project' : ''} ${selectedProject === project.id ? 'selected-project' : ''}`}
        onClick={() => navigate('projects', project.id)}
        aria-label={`${t('openProject')}: ${project.title}`}
      >
        <div className="project-top">
          <span className="project-symbol" aria-hidden="true">
            {project.title.charAt(0).toUpperCase()}
          </span>
          <span className="project-status">{t(project.status)}</span>
          <span className="project-arrow" aria-hidden="true">
            ↗
          </span>
        </div>
        <h3>{project.title}</h3>
        <span className="project-area">
          {areas.find((area) => area.id === project.area)?.title || project.area || 'Work'}
        </span>
        <div className="project-bottom">
          <span>
            {linked.length} {t('projectTasks')}
          </span>
          {linked.length > 0 && (
            <span>
              {completed}/{linked.length}
            </span>
          )}
        </div>
        <div className="project-progress" aria-hidden="true">
          <span style={{ width: `${linked.length ? (completed / linked.length) * 100 : 0}%` }} />
        </div>
      </button>
    );
  }
  function displayTaskText(task) {
    if (!task.projectId) return task.text;
    return task.text
      .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, (match, target) =>
        target === `Projects/${task.projectId}` || target === `Projects/${task.projectId}.md`
          ? ''
          : match
      )
      .replace(/\s+/g, ' ')
      .trim();
  }
  function taskGroups(list, statuses = ['next', 'waiting', 'someday'], heading) {
    return (
      <section className="card task-card" aria-labelledby="tasks-title">
        <div className="section-heading">
          <div>
            <h2 id="tasks-title">{selected?.title || heading || t('nextSteps')}</h2>
            <p className="card-description">
              {heading
                ? locale === 'ru'
                  ? 'Эти списки сохраняются в заметках. Изменения проходят предпросмотр и подтверждение.'
                  : 'These lists are saved in notes. Changes use a preview and confirmation.'
                : t('taskDescription')}
            </p>
          </div>
          <span className="count-pill">
            {list.filter((task) => !task.checked).length} {t('open')}
          </span>
        </div>
        {statuses.map((status) => {
          const group = list.filter((task) => task.status === status);
          return (
            <section
              className={`task-group group-${status}`}
              key={status}
              aria-labelledby={`group-${status}`}
            >
              <div className="group-heading">
                <h3 id={`group-${status}`}>
                  <span className="group-marker" aria-hidden="true" />
                  {t(status)} <span>{group.filter((task) => !task.checked).length}</span>
                </h3>
                <small>{t(`${status}Hint`)}</small>
              </div>
              {group.length ? (
                <ul className="task-list">
                  {group.map((task) => (
                    <li key={task.id} className={task.checked ? 'task-row checked' : 'task-row'}>
                      <button
                        type="button"
                        className="task-check"
                        aria-label={`${t(task.checked ? 'reopenTask' : 'completeTask')}: ${displayTaskText(task)}`}
                        disabled={!writable || busy}
                        onClick={() => startPreview({ type: 'toggle', taskId: task.id })}
                      >
                        <span aria-hidden="true">{task.checked ? '✓' : ''}</span>
                      </button>
                      <div className="task-copy">
                        <span className="task-text">{displayTaskText(task)}</span>
                        {task.projectId && (
                          <button
                            type="button"
                            className="task-project"
                            onClick={() => navigate('projects', task.projectId)}
                          >
                            {projects.find((project) => project.id === task.projectId)?.title ||
                              task.projectId}
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-group">{selected ? t('noLinkedTasks') : t('noTasks')}</p>
              )}
            </section>
          );
        })}
      </section>
    );
  }

  return (
    <div
      className={`app-shell ${reduced ? 'reduce-motion' : ''} ${profile.accessibility.highContrast ? 'high-contrast' : ''}`}
      style={style}
      data-page={tab}
    >
      <LivePreview />
      <a className="skip-link" href="#main">
        {t('mainLabel')}
      </a>
      <aside className={`sidebar movement-sidebar ${menuOpen ? 'menu-open' : ''}`}>
        <button
          type="button"
          className="brand"
          aria-label="Personal OS"
          onClick={() => navigate('main')}
        >
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </span>
          <span>
            personal<span className="brand-os">OS</span>
          </span>
        </button>
        <p className="brand-caption">A space for what matters.</p>
        <button
          type="button"
          className="sidebar-capture-hint"
          onClick={() => window.dispatchEvent(new CustomEvent('personal-os-capture'))}
        >
          Quick capture <kbd>⌘K / Ctrl K</kbd>
        </button>
        <button
          type="button"
          className="menu-toggle"
          aria-expanded={menuOpen}
          aria-controls="workspace-menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? 'Close menu' : 'Open menu'} <span aria-hidden="true">☰</span>
        </button>
        <nav id="workspace-menu" className="movement-nav" aria-label={t('navLabel')}>
          {NAV_GROUPS.map((group, groupIndex) => (
            <section
              className="movement-group"
              key={group.label || 'agent'}
              aria-label={group.label || 'AI Agent'}
            >
              {group.label && <h2 className="movement-label">{group.label}</h2>}
              {group.items.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`nav-item movement-item ${tab === item.id ? 'active' : ''} ${groupIndex === 3 ? 'agent-nav-item' : ''}`}
                  aria-current={tab === item.id ? 'page' : undefined}
                  onClick={() => navigate(item.id)}
                >
                  <span className="movement-number" aria-hidden="true">
                    {item.number}
                  </span>
                  <span>{item.label}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>
        <nav className="utility-nav" aria-label="Workspace tools">
          {UTILITIES.map((item) => (
            <button
              type="button"
              key={item.id}
              className={`utility-item ${tab === item.id ? 'active' : ''}`}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => navigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-icon">
            <Icon name="leaf" />
          </div>
          <strong>{t('localFirst')}</strong>
          <p>{t('localHelp')}</p>
          <span className="sidebar-version">
            PERSONAL OS <span>v0.2</span>
          </span>
        </div>
      </aside>
      <main id="main" className="main" aria-label={t('mainLabel')}>
        <header className="topbar">
          <span className="breadcrumb">
            {t('workspace')} <span aria-hidden="true">/</span> <strong>{activeLabel}</strong>
          </span>
          <div className="workspace-badge">
            <span className="status-dot" />
            {t(workspace?.mode === 'vault' ? 'vault' : 'demo')}
          </div>
        </header>
        <div className="page-content">
          <header className={`page-heading ${tab === 'today' ? 'today-heading' : ''}`}>
            <div>
              <span className="eyebrow date-label">{dateLabel}</span>
              <h1 tabIndex={-1} ref={focusHeading}>
                {pageCopy.title}
              </h1>
              <p>{pageCopy.intro}</p>
            </div>
            <div className="heading-symbol" aria-hidden="true">
              ✳
            </div>
          </header>
          <div className="feedback-region" aria-live="polite">
            {notice && (
              <div className="notice">
                <span>{notice}</span>
                <button type="button" aria-label={t('dismiss')} onClick={() => setNotice('')}>
                  ×
                </button>
              </div>
            )}
          </div>
          {error && (
            <div role="alert" className="error-banner">
              <span>{error}</span>
              <button type="button" aria-label={t('dismiss')} onClick={() => setError('')}>
                ×
              </button>
            </div>
          )}
          {loadState === 'loading' && (
            <div className="loading-state" role="status">
              <div className="loading-circle" />
              <p>{t('loading')}</p>
            </div>
          )}
          {loadState === 'error' && (
            <section className="card load-error" role="alert">
              <Icon name="leaf" size={32} />
              <h2>{t('loadError')}</h2>
              <p>{loadError}</p>
              <p>{t('offlineHelp')}</p>
              <button type="button" className="button primary" onClick={load}>
                {t('retry')}
              </button>
            </section>
          )}
          {loadState === 'ready' && (
            <>
              {!writable && <p className="readonly-banner">{t('readOnlyHelp')}</p>}
              <div className="workspace-grid page-workspace">
                <div className="main-column">
                  <div className="main-overview" hidden={tab !== 'main'}>
                    {isDemo && (
                      <MainRhythm
                        locale={locale}
                        phase={phaseState.phase}
                        instant={now}
                        timezone={lighting.timezone}
                        motionDisabled={reduced || profile.accessibility.staticScene}
                        checkIn={checkIn}
                        onCheckIn={setCheckIn}
                      />
                    )}
                    <MainDecisions
                      locale={locale}
                      timezone={lighting.timezone}
                      workspace={workspace}
                      onNavigate={navigate}
                      onPreview={startPreview}
                    />
                    <MainGarden
                      locale={locale}
                      timezone={lighting.timezone}
                      workspace={workspace}
                      onNavigate={navigate}
                    />
                    <div className="main-opening">
                      <section className="hero-card card">
                        <div className="hero-copy">
                          <span className="eyebrow">{t('intentionLabel')}</span>
                          <h2>{profile.firstOutcome || t('welcomeFoot')}</h2>
                          <div className="hero-meta">
                            <span className="minute-ring" aria-hidden="true">
                              ◷
                            </span>
                            <span>
                              <strong>
                                {profile.availableMinutes} {t('minutes')}
                              </strong>
                              <small>{t('dailyMinutes')}</small>
                            </span>
                          </div>
                          <div className="hero-phase">
                            <span className="phase-swatch" />
                            <span>
                              {t(phaseState.phase)} <span aria-hidden="true">·</span>{' '}
                              {isSimulation
                                ? `${t('simulation')} ${previewTime}`
                                : t(`source${phaseState.source}`)}
                            </span>
                          </div>
                        </div>
                        <WindowScene
                          phase={phaseState.phase}
                          staticScene={profile.accessibility.staticScene || reduced}
                          label={t('windowLabel')}
                        />
                      </section>
                      {!profile.onboardingComplete && (
                        <section className="setup-nudge">
                          <div className="nudge-icon" aria-hidden="true">
                            ✧
                          </div>
                          <div>
                            <h2>{t('setupNudge')}</h2>
                            <p>{t('setupNudgeText')}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => navigate('setup')}
                            className="text-button"
                          >
                            {t('beginSetup')} <span aria-hidden="true">→</span>
                          </button>
                        </section>
                      )}
                    </div>
                    <Lighthouse
                      locale={locale}
                      staticScene={profile.accessibility.staticScene || reduced}
                    />
                    {areaProjectOverview()}
                    <section className="ritual-card main-review">
                      <span className="eyebrow">{t('reviewSchedule')}</span>
                      <h2>
                        {t(`weekday${profile.reviewDay}`)} <span>{profile.reviewTime}</span>
                      </h2>
                      <p>{t('reviewNoReminder')}</p>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => navigate('review')}
                      >
                        {t('review')} →
                      </button>
                    </section>
                  </div>
                  <CommandMenu
                    locale={locale}
                    projects={currentProjects}
                    onNavigate={navigate}
                    onPreview={startPreview}
                    onCaptureNote={({ text }) => startPreview({ type: 'note-append', text })}
                    writable={writable}
                    busy={busy}
                    enabled={profile.dashboard?.keyboardShortcuts !== false}
                  />
                  {storageError && <p role="alert">{storageError}</p>}
                  {pendingStorage && (
                    <p role="status" data-preserve-preview="true">
                      Saving to Markdown. Keep this tab open until the save completes.
                    </p>
                  )}
                  {DEMO_PAGES.map((page) => (
                    <div key={page} hidden={tab !== page} className="demo-page-slot">
                      {isDemo ? (
                        <DemoPages
                          page={page}
                          locale={locale}
                          timezone={lighting.timezone}
                          checkIn={checkIn}
                          onCheckIn={setCheckIn}
                          settings={profile.dashboard}
                          onNavigate={navigate}
                          onOpenProject={(() => {
                            const id = {
                              home: 'reading-corner',
                              career: 'career-roadmap',
                              learning: 'field-guide',
                            }[page];
                            return id && workspace.projects.some((project) => project.id === id)
                              ? () => navigate('projects', id)
                              : undefined;
                          })()}
                        />
                      ) : (
                        <section className="card demo-unmapped">
                          <h2>{getPageCopy(locale, page).title}</h2>
                          <p>
                            {locale === 'ru'
                              ? 'Демо-сценарий отключён для настоящего хранилища. Настройте соответствие вашим заметкам с помощью интервью и промптов адаптации.'
                              : 'The fictional scenario is disabled for a real vault. Use the interview and adaptation prompts to map this page to your own notes.'}
                          </p>
                        </section>
                      )}
                    </div>
                  ))}
                  {tab === 'today' && (
                    <DailySources
                      locale={locale}
                      timezone={lighting.timezone}
                      settings={profile.dashboard}
                      onNavigateSetup={() => navigate('setup')}
                    />
                  )}
                  {tab === 'calendar' && (
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => navigate('setup')}
                    >
                      {locale === 'ru'
                        ? 'Подключить Google или Apple Calendar в Setup'
                        : 'Connect Google or Apple Calendar in Setup'}{' '}
                      ↗
                    </button>
                  )}
                  {tab === 'gtd' && (
                    <NativeConnections
                      locale={locale}
                      timezone={lighting.timezone}
                      mode="gtd"
                      onNavigateSetup={() => navigate('setup')}
                    />
                  )}
                  {tab === 'today' &&
                    taskGroups(
                      tasks.filter((task) => task.status === 'next'),
                      ['next']
                    )}
                  {tab === 'gtd' &&
                    taskGroups(
                      tasks,
                      ['next', 'waiting', 'someday'],
                      locale === 'ru' ? 'Сохранённые списки задач' : 'Saved task lists'
                    )}
                  {['home', 'future', 'career', 'learning'].includes(tab) &&
                    currentProjects.some((project) => project.area === tab) && (
                      <section className="domain-projects" aria-label="Related projects">
                        <span className="eyebrow">Related projects</span>
                        <div className="domain-project-links">
                          {currentProjects
                            .filter((project) => project.area === tab)
                            .map((project) => (
                              <button
                                type="button"
                                className="project-reference"
                                key={project.id}
                                onClick={() => navigate('projects', project.id)}
                              >
                                <span>{project.title}</span>
                                <span aria-hidden="true">↗</span>
                              </button>
                            ))}
                        </div>
                      </section>
                    )}
                  {tab === 'work' && (
                    <section className="project-page" aria-labelledby="work-projects-title">
                      <div className="section-heading">
                        <h2 id="work-projects-title">{t('currentProjects')}</h2>
                        <button
                          type="button"
                          className="button secondary"
                          disabled={!writable || busy || !areas.some((area) => area.id === 'work')}
                          onClick={() => newProject('work')}
                        >
                          {t('createProject')} <span aria-hidden="true">+</span>
                        </button>
                      </div>
                      {workProjects.length ? (
                        <div className="project-grid">
                          {workProjects.map((project) => projectCard(project))}
                        </div>
                      ) : (
                        <div className="card empty-state">
                          <Icon name="work" size={32} />
                          <h3>{t('workEmpty')}</h3>
                          <p>
                            {t(
                              areas.some((area) => area.id === 'work')
                                ? 'workEmptyHelp'
                                : 'workUnavailable'
                            )}
                          </p>
                        </div>
                      )}
                    </section>
                  )}
                  {tab === 'projects' && (
                    <>
                      <section className="project-page" aria-labelledby="projects-title">
                        <div className="section-heading">
                          <h2 id="projects-title">{t('manageProjects')}</h2>
                          <button
                            type="button"
                            className="button primary"
                            disabled={!writable || busy}
                            onClick={() => newProject()}
                          >
                            {t('createProject')} <span aria-hidden="true">+</span>
                          </button>
                        </div>
                        <div className="project-filters">
                          <label className="field area-filter">
                            <span className="sr-only">{t('filterLabel')}</span>
                            <select
                              value={areaFilter}
                              onChange={(event) => setAreaFilter(event.target.value)}
                            >
                              <option value="all">{t('allAreas')}</option>
                              {areas.map((area) => (
                                <option key={area.id} value={area.id}>
                                  {area.title}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="archive-filter">
                            <input
                              type="checkbox"
                              checked={showArchived}
                              onChange={(event) => setShowArchived(event.target.checked)}
                            />
                            {t('showArchived')}
                          </label>
                        </div>
                        {projects.filter(
                          (project) =>
                            (showArchived || project.status !== 'archived') &&
                            (areaFilter === 'all' || project.area === areaFilter)
                        ).length ? (
                          <div className="project-grid">
                            {projects
                              .filter(
                                (project) =>
                                  (showArchived || project.status !== 'archived') &&
                                  (areaFilter === 'all' || project.area === areaFilter)
                              )
                              .map((project) => projectCard(project))}
                          </div>
                        ) : (
                          <div className="card empty-state">
                            <Icon name="projects" size={30} />
                            <h3>{t('noAreaProjects')}</h3>
                            <p>{t('noAreaProjectsHelp')}</p>
                          </div>
                        )}
                      </section>
                      {editingProject && (
                        <ProjectEditor
                          key={`${editingProject.id}-${editingProject.creating ? 'new' : 'edit'}`}
                          project={editingProject}
                          areas={areas}
                          onPreview={startPreview}
                          onCancel={() => setEditingProject(null)}
                          t={t}
                          busy={busy}
                          writable={writable}
                        />
                      )}
                      {selected && (
                        <>
                          <section className="card project-detail">
                            <div className="section-heading">
                              <div>
                                <span className="eyebrow">
                                  {areas.find((area) => area.id === selected.area)?.title ||
                                    selected.area}{' '}
                                  · {t(selected.status)}
                                </span>
                                <h2>{selected.title}</h2>
                              </div>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={t('allProjects')}
                                onClick={() => {
                                  setSelectedProject(null);
                                  setEditingProject(null);
                                }}
                              >
                                ×
                              </button>
                            </div>
                            <MarkdownView
                              text={selected.body || t('noProjectNotes')}
                              title={selected.title}
                              onProject={setSelectedProject}
                            />
                            <div className="project-detail-actions">
                              <button
                                type="button"
                                className="button secondary"
                                disabled={!writable || busy}
                                onClick={() => setEditingProject({ ...selected, creating: false })}
                              >
                                {t('editProject')}
                              </button>
                              <button
                                type="button"
                                className="text-button"
                                disabled={!writable || busy}
                                onClick={() => archiveProject(selected)}
                              >
                                {t(
                                  selected.status === 'archived'
                                    ? 'restoreProject'
                                    : 'archiveProject'
                                )}{' '}
                                <span aria-hidden="true">↗</span>
                              </button>
                            </div>
                            <p className="field-help">{t('archiveHelp')}</p>
                          </section>
                          {taskGroups(visibleTasks)}
                        </>
                      )}
                    </>
                  )}
                  {tab === 'graph' && (
                    <WorkspaceGraph
                      graph={workspace.graph}
                      areas={areas}
                      locale={locale}
                      onOpenProject={(id) => navigate('projects', id)}
                    />
                  )}
                  <div className="agent-page" hidden={tab !== 'agent'}>
                    <AgentPanel workspace={workspace} locale={locale} />
                  </div>
                  {tab === 'review' && (
                    <>
                      <ReviewForm
                        text={workspace.review?.text || ''}
                        locale={locale}
                        projects={projects}
                        busy={busy}
                        writable={writable}
                        onPreview={startPreview}
                      />
                      <ObservationReview locale={locale} onOpenSetup={() => navigate('setup')} />
                    </>
                  )}
                  {tab === 'setup' && (
                    <SetupHub
                      start={
                        <Setup
                          key={JSON.stringify(profile)}
                          profile={profile}
                          onSave={(nextProfile) =>
                            saveProfile(
                              Object.fromEntries(
                                Object.entries(nextProfile).filter(
                                  ([key]) => key !== 'agent' && key !== 'areas'
                                )
                              ),
                              true
                            )
                          }
                          t={t}
                          busy={profileBusy}
                        />
                      }
                      workspace={
                        <DashboardPreferences
                          key={JSON.stringify(profile.dashboard)}
                          value={profile.dashboard}
                          onSave={(dashboard) => saveProfile({ dashboard })}
                          busy={profileBusy}
                        />
                      }
                      appearance={
                        <Lighting
                          lighting={lighting}
                          onChange={setLighting}
                          onSave={saveLighting}
                          dirty={lightDirty}
                          busy={profileBusy}
                          state={phaseState}
                          previewTime={previewTime}
                          onPreviewTime={setPreviewTime}
                          t={t}
                        />
                      }
                      vaults={<VaultOverview locale={locale} />}
                      confirmation={<OwnerPasskey />}
                      connections={
                        <>
                          <NativeConnections locale={locale} timezone={lighting.timezone} />
                          <DailySources locale={locale} timezone={lighting.timezone} settingsOnly />
                        </>
                      }
                      areas={
                        <AreasManager
                          key={JSON.stringify(areas)}
                          areas={areas}
                          projects={projects}
                          onSave={saveAreas}
                          busy={profileBusy}
                          t={t}
                        />
                      }
                    />
                  )}
                  {latestAction && (
                    <div className="undo-bar">
                      <span>{latestAction.label}</span>
                      <button type="button" onClick={undo} disabled={busy || !writable}>
                        {busy ? t('undoing') : t('undo')} <span aria-hidden="true">↶</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <footer className="page-footer">
                <span>
                  <Icon name="leaf" size={15} /> {t('welcomeFoot')}
                </span>
                <span>
                  {isDemo
                    ? locale === 'ru'
                      ? 'Локальная версия personal-os'
                      : 'Local personal-os workspace'
                    : t('writable')}{' '}
                  <span aria-hidden="true">·</span> {t('noAgentConnected')}
                </span>
              </footer>
            </>
          )}
        </div>
      </main>
      {preview && (
        <PreviewDialog
          preview={preview}
          busy={busy}
          error={previewError}
          onClose={closePreview}
          onApply={apply}
          t={t}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
