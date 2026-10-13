import { useEffect, useId, useState } from 'react';
import NoteContent from './NoteContent.jsx';

const SPACE_ROLES = {
  main: {
    en: 'Actions and projects',
    ru: 'Действия и проекты',
    detailEn: 'Everyday notes, projects, tasks and reviews.',
    detailRu: 'Повседневные заметки, проекты, задачи и обзоры.',
  },
  self: {
    en: 'Your own measure',
    ru: 'Своя мера',
    detailEn: 'Your preferences, current context and observations about yourself.',
    detailRu: 'Ваши предпочтения, текущий контекст и наблюдения о себе.',
  },
  ai: {
    en: 'Your agent, your rules',
    ru: 'Ваш агент, ваши правила',
    detailEn: 'A separate place for the agent’s working agreements and boundaries.',
    detailRu: 'Отдельное место для рабочих договорённостей и границ агента.',
  },
};
export default function VaultOverview({ locale = 'en', initialVaults = [] }) {
  const uid = useId().replaceAll(':', '');
  const [vaults, setVaults] = useState(initialVaults);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(initialVaults.length === 0);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/vaults', { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not read the vault configuration.');
        return data;
      })
      .then((data) => {
        if (!controller.signal.aborted) setVaults(data.vaults);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  const l = (en, ru) => (locale === 'ru' ? ru : en);
  return (
    <section className="vault-settings" aria-labelledby={`${uid}-title`}>
      <header className="vault-settings-heading">
        <div>
          <span className="eyebrow">{l('WORKSPACE STRUCTURE', 'УСТРОЙСТВО ПРОСТРАНСТВА')}</span>
          <h2 id={`${uid}-title`}>{l('Three spaces, one life', 'Три пространства, одна жизнь')}</h2>
        </div>
        <p>
          {l(
            'Keep everyday notes, your self-model and the agent’s agreements separate. Select context explicitly when using AI.',
            'Храните повседневные заметки, модель себя и договорённости с агентом отдельно. Для AI выбирайте контекст явно.'
          )}
        </p>
      </header>
      {loading && (
        <p role="status">{l('Reading configured spaces…', 'Загрузка настроенных пространств…')}</p>
      )}
      <div className="vault-settings-grid">
        {vaults.map((vault) => {
          const role = SPACE_ROLES[vault.id] || SPACE_ROLES.main;
          const notes = vault.projects || [];
          const connected = vault.configured && !vault.unavailable;
          return (
            <article className="vault-settings-space" key={vault.id}>
              <div className="vault-settings-space-heading">
                <span className="vault-settings-role">{l(role.en, role.ru)}</span>
                <span className="vault-settings-status" data-connected={connected}>
                  {connected
                    ? l('Connected', 'Подключено')
                    : vault.unavailable
                      ? l('Unavailable', 'Недоступно')
                      : l('Not connected', 'Не подключено')}
                </span>
              </div>
              <h3>{vault.title}</h3>
              <p>{l(role.detailEn, role.detailRu)}</p>
              <span className="vault-settings-count">
                {connected
                  ? l(`${notes.length} scoped notes`, `${notes.length} заметок в области доступа`)
                  : l(
                      'Configure this space explicitly to include its notes.',
                      'Подключите это пространство явно, чтобы использовать его заметки.'
                    )}
              </span>
              {connected && vault.id !== 'main' && notes.length > 0 && (
                <div className="vault-settings-notes">
                  {notes.map((project) => (
                    <details key={project.id}>
                      <summary>{project.title}</summary>
                      <NoteContent text={project.body} title={project.title} />
                    </details>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
