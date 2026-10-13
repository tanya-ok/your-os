export default function Lighting({
  lighting,
  onChange,
  onSave,
  dirty,
  busy,
  state,
  previewTime,
  onPreviewTime,
  t,
}) {
  function update(values) {
    onChange({ ...lighting, ...values });
  }
  const coordinates = lighting.coordinates;
  function coordinate(key, value) {
    const other = key === 'latitude' ? 'longitude' : 'latitude';
    update({
      coordinates:
        value === '' && coordinates?.[other] == null
          ? null
          : { ...coordinates, [key]: value === '' ? null : Number(value) },
    });
  }
  return (
    <section className="card lighting-card" aria-labelledby="lighting-title">
      <div className="section-heading">
        <h2 id="lighting-title">{t('roomLight')}</h2>
        <span className="tiny-star" aria-hidden="true">
          ✧
        </span>
      </div>
      <p className="card-description">{t('lightDescription')}</p>
      <label className="field compact">
        <span>{t('lightMode')}</span>
        <select value={lighting.mode} onChange={(event) => update({ mode: event.target.value })}>
          {['schedule', 'solar', 'system', 'manual'].map((mode) => (
            <option key={mode} value={mode}>
              {t(`mode${mode}`)}
            </option>
          ))}
        </select>
      </label>
      {lighting.mode === 'manual' && (
        <fieldset className="phase-field">
          <legend>{t('choosePhase')}</legend>
          <div className="phase-buttons">
            {['night', 'sunrise', 'morning', 'day', 'sunset', 'twilight'].map((phase) => (
              <button
                key={phase}
                type="button"
                className={lighting.manualPhase === phase ? 'selected' : ''}
                aria-pressed={lighting.manualPhase === phase}
                onClick={() => update({ manualPhase: phase })}
              >
                <span aria-hidden="true">
                  {
                    {
                      night: '☾',
                      sunrise: '◒',
                      morning: '☀',
                      day: '◯',
                      sunset: '◓',
                      twilight: '✧',
                    }[phase]
                  }
                </span>
                {t(phase)}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {lighting.mode === 'schedule' && (
        <details className="light-details">
          <summary>{t('editSchedule')}</summary>
          <div className="schedule-fields">
            {['wake', 'day', 'evening', 'sleep'].map((key) => (
              <label className="field compact" key={key}>
                <span>{t(`schedule${key}`)}</span>
                <input
                  type="time"
                  value={lighting.schedule[key]}
                  onChange={(event) =>
                    update({ schedule: { ...lighting.schedule, [key]: event.target.value } })
                  }
                />
              </label>
            ))}
          </div>
        </details>
      )}
      {lighting.mode === 'solar' && (
        <div className="solar-fields">
          <p className="field-help">{t('solarHelp')}</p>
          <div className="fields-row">
            <label className="field compact">
              <span>{t('latitude')}</span>
              <input
                type="number"
                min="-90"
                max="90"
                step="any"
                placeholder="52.23"
                value={coordinates?.latitude ?? ''}
                onChange={(event) => coordinate('latitude', event.target.value)}
              />
            </label>
            <label className="field compact">
              <span>{t('longitude')}</span>
              <input
                type="number"
                min="-180"
                max="180"
                step="any"
                placeholder="21.01"
                value={coordinates?.longitude ?? ''}
                onChange={(event) => coordinate('longitude', event.target.value)}
              />
            </label>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => update({ coordinates: null })}
          >
            {t('clearCoordinates')}
          </button>
        </div>
      )}
      <div className="light-status">
        <span className="status-dot" />
        <span>
          {t(state.phase)} · {t(`source${state.source}`)}
        </span>
      </div>
      {state.reason && (
        <p className="field-help fallback-note">
          {t('fallbackNote')} <span>{state.reason}</span>
        </p>
      )}
      {dirty && (
        <button
          type="button"
          className="button secondary full-width"
          disabled={busy}
          onClick={onSave}
        >
          {busy ? t('saving') : t('saveLight')}
        </button>
      )}
      <details className="light-details time-preview">
        <summary>{t('previewTime')}</summary>
        <p className="field-help">{t('previewHelp')}</p>
        <label className="field compact">
          <span>
            {t('simulatedTime')} · {lighting.timezone}
          </span>
          <input
            type="time"
            value={previewTime || ''}
            onChange={(event) => onPreviewTime(event.target.value || null)}
            disabled={lighting.mode === 'manual' || lighting.mode === 'system'}
          />
        </label>
        {(lighting.mode === 'manual' || lighting.mode === 'system') && (
          <p className="field-help">{t('previewModeHelp')}</p>
        )}
        {previewTime && (
          <button type="button" className="text-button" onClick={() => onPreviewTime(null)}>
            {t('returnLive')}
          </button>
        )}
      </details>
    </section>
  );
}
