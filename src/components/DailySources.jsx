import { useEffect, useId, useState } from 'react';

async function sourceCall(path, options = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not update sources');
  return data;
}
export function normalizeCalendarFeedURL(value) {
  return value.trim().replace(/^webcal:\/\//i, 'https://');
}
const CONNECTIONS = [
  { id: 'google', title: 'Google Calendar', type: 'calendar' },
  { id: 'apple', title: 'Apple Calendar', type: 'calendar' },
  { id: 'ics', title: 'Other calendar · ICS', ru: 'Другой календарь · ICS', type: 'calendar' },
  { id: 'rss', title: 'RSS / Atom', type: 'rss' },
];
export default function DailySources({
  locale = 'en',
  timezone = 'UTC',
  settings = {},
  settingsOnly = false,
  onNavigateSetup,
}) {
  const l = (en, ru) => (locale === 'ru' ? ru : en);
  const uid = useId().replaceAll(':', '');
  const [data, setData] = useState({ sources: [], events: [], news: [], warnings: [] });
  const [connection, setConnection] = useState('google');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [revision, setRevision] = useState(0);
  const selected = CONNECTIONS.find((item) => item.id === connection);
  // biome-ignore lint/correctness/useExhaustiveDependencies: Revision reloads local subscription metadata after an explicit action; this GET never fetches external feeds.
  useEffect(() => {
    const controller = new AbortController();
    sourceCall(`/api/today/sources?timezone=${encodeURIComponent(timezone)}`, {
      signal: controller.signal,
    })
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      });
    return () => controller.abort();
  }, [timezone, revision]);
  useEffect(() => {
    const reload = () => setRevision((value) => value + 1);
    window.addEventListener('personal-os-sources-changed', reload);
    return () => window.removeEventListener('personal-os-sources-changed', reload);
  }, []);
  const perform = async (path, options) => {
    if (busy) return false;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await sourceCall(path, options);
      window.dispatchEvent(new Event('personal-os-sources-changed'));
      return true;
    } catch (reason) {
      setError(reason.message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async (event) => {
    event.preventDefault();
    const address = normalizeCalendarFeedURL(url);
    if (!/^https:\/\//i.test(address)) {
      setError(
        l(
          'Use an HTTPS feed address. Apple webcal links are converted to HTTPS.',
          'Нужен HTTPS-адрес ленты. Ссылки Apple webcal преобразуются в HTTPS.'
        )
      );
      return;
    }
    if (
      await perform('/api/today/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: selected.type, title: title.trim(), url: address }),
      })
    ) {
      setTitle('');
      setUrl('');
      setStatus(
        l(
          'Connection saved locally. Use Refresh below to load its events or articles.',
          'Подключение сохранено локально. Нажмите «Обновить» ниже, чтобы загрузить события или статьи.'
        )
      );
    }
  };
  const time = (value) => {
    try {
      return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value));
    } catch {
      return '-';
    }
  };
  return (
    <section
      className={`daily-sources card ${settingsOnly ? 'daily-sources-settings' : 'daily-sources-today'}`}
      aria-labelledby={`${uid}-title`}
    >
      <header className="daily-sources-heading">
        <div>
          <span className="eyebrow">
            {settingsOnly
              ? l('CONNECTIONS', 'ПОДКЛЮЧЕНИЯ')
              : l('A CONNECTION TO TODAY', 'СВЯЗЬ С СЕГОДНЯШНИМ ДНЁМ')}
          </span>
          <h2 id={`${uid}-title`}>
            {settingsOnly
              ? l('Calendars & reading sources', 'Календари и источники чтения')
              : l('Today, in the world', 'Сегодня вокруг')}
          </h2>
        </div>
        <small>{l('Saved locally', 'Сохраняется локально')}</small>
      </header>
      {settingsOnly ? (
        <div className="daily-sources-management">
          <p className="daily-sources-intro">
            {l(
              'Connect a calendar feed or a reading source. Google and Apple subscriptions are read-only; local events remain editable in Calendar.',
              'Подключите календарную ленту или источник чтения. Подписки Google и Apple доступны для чтения; локальные события редактируются в Calendar.'
            )}
          </p>
          <fieldset className="daily-source-connection-types">
            <legend>{l('Choose a connection', 'Выберите подключение')}</legend>
            <div>
              {CONNECTIONS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={connection === item.id}
                  onClick={() => {
                    setConnection(item.id);
                    setError('');
                    setStatus('');
                  }}
                >
                  {locale === 'ru' && item.ru ? item.ru : item.title}
                  <small>
                    {item.type === 'calendar'
                      ? l('Calendar subscription', 'Подписка на календарь')
                      : l('Articles and news', 'Статьи и новости')}
                  </small>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="daily-source-instructions" aria-live="polite">
            {connection === 'google' && (
              <>
                <h3>
                  {l(
                    'Connect Google Calendar through iCal',
                    'Подключить Google Calendar через iCal'
                  )}
                </h3>
                <ol>
                  <li>
                    {l(
                      'Open Google Calendar in a browser → Settings.',
                      'Откройте Google Calendar в браузере → Настройки.'
                    )}
                  </li>
                  <li>
                    {l(
                      'Choose the calendar → Integrate calendar → Secret address in iCal format.',
                      'Выберите календарь → Интеграция календаря → Закрытый адрес в формате iCal.'
                    )}
                  </li>
                  <li>
                    {l(
                      'Copy that address and paste it below. Keep the secret link private.',
                      'Скопируйте адрес и вставьте ниже. Сохраняйте закрытую ссылку в тайне.'
                    )}
                  </li>
                </ol>
                <p>
                  {l(
                    'This subscribes to a calendar feed. Google account sign-in and two-way synchronization are not implemented.',
                    'Это подписка на календарную ленту. Вход в аккаунт Google и двусторонняя синхронизация пока не реализованы.'
                  )}
                </p>
                <a
                  href="https://support.google.com/calendar/answer/37648"
                  target="_blank"
                  rel="noreferrer"
                >
                  {l('Google’s instructions', 'Инструкция Google')} ↗
                </a>
              </>
            )}
            {connection === 'apple' && (
              <>
                <h3>
                  {l('Connect an Apple / iCloud calendar', 'Подключить календарь Apple / iCloud')}
                </h3>
                <ol>
                  <li>
                    {l(
                      'In iCloud Calendar, open the sharing options for the chosen calendar.',
                      'В календаре iCloud откройте настройки общего доступа нужного календаря.'
                    )}
                  </li>
                  <li>
                    {l(
                      'For a calendar you are comfortable sharing publicly, enable Public Calendar and copy its link.',
                      'Для календаря, который вы готовы открыть по публичной ссылке, включите «Открытый календарь» и скопируйте ссылку.'
                    )}
                  </li>
                  <li>
                    {l(
                      'Paste the webcal:// link below. Personal OS converts its prefix to https:// before saving.',
                      'Вставьте ссылку webcal:// ниже. Personal OS заменит начало на https:// перед сохранением.'
                    )}
                  </li>
                </ol>
                <p>
                  {l(
                    'Anyone with this public link can read that calendar. This method does not connect your Apple account or read the Calendar app on your Mac.',
                    'Любой обладатель публичной ссылки сможет читать этот календарь. Этот способ не подключает аккаунт Apple и не читает приложение Calendar на Mac.'
                  )}
                </p>
                <a
                  href="https://support.apple.com/guide/icloud/share-a-calendar-mm6b1a9479/icloud"
                  target="_blank"
                  rel="noreferrer"
                >
                  {l('Apple’s sharing instructions', 'Инструкция Apple по общему доступу')} ↗
                </a>
              </>
            )}
            {connection === 'ics' && (
              <>
                <h3>{l('Connect another calendar', 'Подключить другой календарь')}</h3>
                <p>
                  {l(
                    'Use the calendar provider’s HTTPS subscription address in iCalendar / ICS format. A calendar website or a downloaded file is not a live subscription address.',
                    'Используйте HTTPS-адрес подписки в формате iCalendar / ICS от поставщика календаря. Страница сайта или скачанный файл не являются адресом живой подписки.'
                  )}
                </p>
              </>
            )}
            {connection === 'rss' && (
              <>
                <h3>{l('Connect a reading source', 'Подключить источник чтения')}</h3>
                <p>
                  {l(
                    'Paste the publication’s HTTPS RSS or Atom feed address. Refresh loads its latest articles into Today.',
                    'Вставьте HTTPS-адрес RSS или Atom издания. Обновление загрузит последние статьи в Today.'
                  )}
                </p>
              </>
            )}
          </div>
          <form className="daily-source-form" onSubmit={add}>
            <label>
              <span>{l('Connection name', 'Название подключения')}</span>
              <input
                required
                maxLength="80"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={
                  connection === 'rss'
                    ? l('A publication I follow', 'Издание, которое я читаю')
                    : l('My calendar', 'Мой календарь')
                }
              />
            </label>
            <label className="daily-source-url">
              <span>
                {connection === 'apple'
                  ? l(
                      'iCloud calendar address · webcal or HTTPS',
                      'Адрес календаря iCloud · webcal или HTTPS'
                    )
                  : l('HTTPS feed address', 'HTTPS-адрес ленты')}
              </span>
              <input
                required
                type="url"
                maxLength="2048"
                autoComplete="off"
                spellCheck="false"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder={connection === 'apple' ? 'webcal://…' : 'https://…'}
              />
            </label>
            <button
              type="submit"
              className="daily-source-add-button"
              disabled={busy || !title.trim() || !url.trim()}
            >
              {busy ? l('Saving…', 'Сохранение…') : l('Add connection', 'Добавить подключение')}
            </button>
          </form>
          <section className="daily-source-saved">
            <h3>{l('Saved connections', 'Сохранённые подключения')}</h3>
            {data.sources.length === 0 ? (
              <p>
                {l(
                  'No connections yet. Choose a source above to begin.',
                  'Подключений пока нет. Выберите источник выше.'
                )}
              </p>
            ) : (
              <ul className="daily-source-subscriptions">
                {data.sources.map((source) => (
                  <li key={source.id}>
                    <div>
                      <strong>{source.title}</strong>
                      <small>
                        {source.kind === 'calendar'
                          ? l('Calendar feed · read-only', 'Календарная лента · чтение')
                          : 'RSS / Atom'}{' '}
                        ·{' '}
                        {source.lastFetched
                          ? l('Cached locally', 'Загружено локально')
                          : l('Not loaded yet', 'Пока не загружено')}
                      </small>
                      {source.error && (
                        <p role="status">
                          {l(
                            'Refresh failed. The last saved version is kept.',
                            'Не удалось обновить. Последняя загруженная версия сохранена.'
                          )}
                        </p>
                      )}
                    </div>
                    <div className="daily-source-saved-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await perform(
                              `/api/today/sources/${encodeURIComponent(source.id)}/refresh`,
                              { method: 'POST' }
                            )
                          )
                            setStatus(
                              l(
                                'Source refreshed. Open Today or Calendar to see the saved results.',
                                'Источник обновлён. Сохранённые результаты доступны в Today или Calendar.'
                              )
                            );
                        }}
                      >
                        {l('Refresh', 'Обновить')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`${l('Remove connection', 'Удалить подключение')}: ${source.title}`}
                        onClick={() =>
                          perform(`/api/today/sources/${encodeURIComponent(source.id)}`, {
                            method: 'DELETE',
                          })
                        }
                      >
                        {l('Remove', 'Удалить')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="daily-sources-footnote">
            {l(
              'Adding a connection saves its address locally. Only Refresh contacts that source. No account is connected automatically.',
              'Добавление сохраняет адрес локально. Только «Обновить» обращается к источнику. Аккаунты не подключаются автоматически.'
            )}
          </p>
          {data.warnings.map((warning) => (
            <p key={`${warning.sourceId}-${warning.message}`} className="field-help">
              {warning.message}
            </p>
          ))}
        </div>
      ) : (
        <>
          <div className="daily-sources-grid">
            {settings.showCalendar !== false && (
              <section>
                <h3>{l('Calendar events', 'События календаря')}</h3>
                {data.events.length ? (
                  <ol className="daily-feed-list">
                    {data.events.map((event) => (
                      <li key={event.id}>
                        <time>{event.allDay ? l('All day', 'Весь день') : time(event.start)}</time>
                        <strong>{event.title}</strong>
                        <small>
                          {event.sourceId === 'local'
                            ? l('Your local calendar', 'Локальный календарь')
                            : data.sources.find((source) => source.id === event.sourceId)?.title}
                          {event.location ? ` · ${event.location}` : ''}
                        </small>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>
                    {l(
                      'No events for today. Connect a calendar in Setup or create a local event in Calendar.',
                      'На сегодня событий нет. Подключите календарь в Setup или создайте локальное событие в Calendar.'
                    )}
                  </p>
                )}
              </section>
            )}
            {settings.showNews !== false && (
              <section>
                <h3>{l('From your reading sources', 'Из ваших источников')}</h3>
                {data.news.length ? (
                  <ul className="daily-feed-list">
                    {data.news.slice(0, settings.newsLimit || 5).map((item) => (
                      <li key={item.id}>
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noreferrer">
                            {item.title} ↗
                          </a>
                        ) : (
                          <strong>{item.title}</strong>
                        )}
                        <small>
                          {data.sources.find((source) => source.id === item.sourceId)?.title}
                          {item.publishedAt
                            ? ` · ${new Date(item.publishedAt).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB')}`
                            : ''}
                        </small>
                        <p>{item.description}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    {l(
                      'Your saved reading sources will appear here after you refresh them in Setup.',
                      'Материалы из подключённых источников появятся после обновления в Setup.'
                    )}
                  </p>
                )}
              </section>
            )}
          </div>
          <button type="button" className="daily-sources-setup-link" onClick={onNavigateSetup}>
            {l(
              'Connect or manage calendars and news in Setup',
              'Подключить или настроить календари и новости в Setup'
            )}{' '}
            ↗
          </button>
        </>
      )}
      {status && (
        <p role="status" className="daily-sources-status">
          {status}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
