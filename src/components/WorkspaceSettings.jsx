const defaults = {
  homeTitle: 'My Home',
  homeStartDate: null,
  homeWeeks: 6,
  homeCurrentWeek: 3,
  focusMinutes: 60,
  workdayStart: '09:00',
  workdayEnd: '17:00',
  showNews: true,
  showCalendar: true,
  newsLimit: 5,
  keyboardShortcuts: true,
};

export default function WorkspaceSettings({ value = {}, locale = 'en', onChange }) {
  const settings = { ...defaults, ...value };
  const l = (en, ru) => (locale === 'ru' ? ru : en);
  const patch = (values) => onChange?.({ ...settings, ...values });
  return (
    <section className="workspace-settings card">
      <header>
        <span className="eyebrow">{l('Your dashboard', 'Ваш dashboard')}</span>
        <h2>{l('Make the space yours', 'Настроить под себя')}</h2>
        <p>
          {l(
            'These choices are saved together with your workspace settings.',
            'Эти изменения сохраняются вместе с настройками пространства.'
          )}
        </p>
      </header>
      <div className="workspace-settings-grid">
        <label className="workspace-settings-field workspace-settings-wide">
          <span>{l('Home title', 'Название Home')}</span>
          <input
            maxLength={80}
            value={settings.homeTitle}
            onChange={(event) => patch({ homeTitle: event.target.value })}
          />
        </label>
        <label className="workspace-settings-field">
          <span>{l('Home · day one', 'Home · первый день')}</span>
          <input
            type="date"
            value={settings.homeStartDate || ''}
            onChange={(event) => patch({ homeStartDate: event.target.value || null })}
          />
          <small>
            {l(
              'Leave empty for the example programme.',
              'Можно оставить пустым для примерной программы.'
            )}
          </small>
        </label>
        <label className="workspace-settings-field">
          <span>{l('Programme weeks', 'Недель в программе')}</span>
          <input
            type="number"
            min={1}
            max={52}
            value={settings.homeWeeks}
            onChange={(event) => {
              const homeWeeks = Number(event.target.value);
              patch({ homeWeeks, homeCurrentWeek: Math.min(settings.homeCurrentWeek, homeWeeks) });
            }}
          />
        </label>
        <label className="workspace-settings-field">
          <span>{l('Current home week', 'Текущая неделя Home')}</span>
          <input
            type="number"
            min={1}
            max={settings.homeWeeks}
            value={settings.homeCurrentWeek}
            onChange={(event) => patch({ homeCurrentWeek: Number(event.target.value) })}
          />
        </label>
        <label className="workspace-settings-field">
          <span>{l('Work focus duration · minutes', 'Длительность рабочего фокуса · минут')}</span>
          <input
            type="number"
            min={1}
            max={180}
            value={settings.focusMinutes}
            onChange={(event) => patch({ focusMinutes: Number(event.target.value) })}
          />
        </label>
        <label className="workspace-settings-field">
          <span>{l('Workday starts', 'Начало рабочего дня')}</span>
          <input
            type="time"
            value={settings.workdayStart}
            onChange={(event) => patch({ workdayStart: event.target.value })}
          />
        </label>
        <label className="workspace-settings-field">
          <span>{l('Workday ends', 'Конец рабочего дня')}</span>
          <input
            type="time"
            value={settings.workdayEnd}
            onChange={(event) => patch({ workdayEnd: event.target.value })}
          />
        </label>
        <label className="workspace-settings-toggle">
          <input
            type="checkbox"
            checked={settings.showCalendar}
            onChange={(event) => patch({ showCalendar: event.target.checked })}
          />
          <span>{l('Show calendar on Today', 'Показывать календарь на Today')}</span>
        </label>
        <label className="workspace-settings-toggle">
          <input
            type="checkbox"
            checked={settings.showNews}
            onChange={(event) => patch({ showNews: event.target.checked })}
          />
          <span>{l('Show RSS / Atom news on Today', 'Показывать RSS / Atom новости в Today')}</span>
        </label>
        <label className="workspace-settings-field">
          <span>{l('News · items', 'Новостей в подборке')}</span>
          <input
            type="number"
            min={1}
            max={20}
            value={settings.newsLimit}
            onChange={(event) => patch({ newsLimit: Number(event.target.value) })}
          />
        </label>
        <label className="workspace-settings-toggle">
          <input
            type="checkbox"
            checked={settings.keyboardShortcuts}
            onChange={(event) => patch({ keyboardShortcuts: event.target.checked })}
          />
          <span>{l('Enable keyboard shortcuts', 'Включить сочетания клавиш')}</span>
        </label>
      </div>
    </section>
  );
}
