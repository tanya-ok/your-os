import { useState } from 'react';

export default function Setup({ profile, onSave, t, busy }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(profile);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [zoneConfirmed, setZoneConfirmed] = useState(profile.lighting.timezone === browserZone);
  const [error, setError] = useState('');
  const steps = [t('intention'), t('rhythm'), t('yourSpace')];
  function patch(values) {
    setDraft((previous) => ({ ...previous, ...values }));
  }
  function accessibility(key, value) {
    patch({ accessibility: { ...draft.accessibility, [key]: value } });
  }
  async function save() {
    setError('');
    try {
      await onSave({
        ...draft,
        lighting: {
          ...draft.lighting,
          timezone: zoneConfirmed ? browserZone : draft.lighting.timezone,
        },
        onboardingComplete: true,
      });
    } catch (reason) {
      setError(reason.message);
    }
  }
  return (
    <section className="setup-panel card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{t('guidedSetup')}</span>
          <h2>{t('makeRoom')}</h2>
        </div>
        <span className="step-count">0{step + 1} / 03</span>
      </div>
      <p className="setup-intro">{t('setupIntro')}</p>
      <ol className="setup-steps" aria-label={t('setupProgress')}>
        {steps.map((title, index) => (
          <li
            key={title}
            className={step === index ? 'active' : step > index ? 'complete' : ''}
            aria-current={step === index ? 'step' : undefined}
          >
            <span>{step > index ? '✓' : index + 1}</span>
            {title}
          </li>
        ))}
      </ol>
      <div className="setup-questions">
        {step === 0 && (
          <>
            <label className="field">
              <span>{t('outcomeQuestion')}</span>
              <textarea
                rows={3}
                maxLength={500}
                value={draft.firstOutcome}
                onChange={(event) => patch({ firstOutcome: event.target.value })}
                placeholder={t('outcomePlaceholder')}
              />
              <small>{t('outcomeHelp')}</small>
            </label>
            <fieldset className="choice-field">
              <legend>{t('workflowQuestion')}</legend>
              <div className="choice-grid">
                {['simple', 'gtd', 'custom'].map((workflow) => (
                  <label
                    className={`choice-card ${draft.workflow === workflow ? 'selected' : ''}`}
                    key={workflow}
                  >
                    <input
                      type="radio"
                      name="workflow"
                      value={workflow}
                      checked={draft.workflow === workflow}
                      onChange={() => patch({ workflow })}
                    />
                    <strong>{t(workflow)}</strong>
                    <small>{t(`${workflow}Help`)}</small>
                  </label>
                ))}
              </div>
            </fieldset>
          </>
        )}
        {step === 1 && (
          <>
            <label className="field">
              <span>{t('minutesQuestion')}</span>
              <select
                value={draft.availableMinutes}
                onChange={(event) => patch({ availableMinutes: Number(event.target.value) })}
              >
                {[5, 10, 15, 30, 45, 60].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes} {t('minutes')}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="choice-field">
              <legend>{t('reviewQuestion')}</legend>
              <div className="fields-row">
                <label className="field">
                  <span>{t('day')}</span>
                  <select
                    value={draft.reviewDay}
                    onChange={(event) => patch({ reviewDay: Number(event.target.value) })}
                  >
                    {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
                      <option key={`weekday-${weekday}`} value={weekday}>
                        {t(`weekday${weekday}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>{t('time')}</span>
                  <input
                    type="time"
                    value={draft.reviewTime}
                    onChange={(event) => patch({ reviewTime: event.target.value })}
                    required
                  />
                </label>
              </div>
              <p className="field-help">{t('reviewHelp')}</p>
            </fieldset>
          </>
        )}
        {step === 2 && (
          <>
            <fieldset className="choice-field">
              <legend>{t('comfortQuestion')}</legend>
              <label className="switch-row">
                <span>
                  <strong>{t('reducedMotion')}</strong>
                  <small>{t('reducedMotionHelp')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.accessibility.reduceMotion}
                  onChange={(event) => accessibility('reduceMotion', event.target.checked)}
                />
              </label>
              <label className="switch-row">
                <span>
                  <strong>{t('highContrast')}</strong>
                  <small>{t('highContrastHelp')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.accessibility.highContrast}
                  onChange={(event) => accessibility('highContrast', event.target.checked)}
                />
              </label>
              <label className="switch-row">
                <span>
                  <strong>{t('staticScene')}</strong>
                  <small>{t('staticSceneHelp')}</small>
                </span>
                <input
                  type="checkbox"
                  checked={draft.accessibility.staticScene}
                  onChange={(event) => accessibility('staticScene', event.target.checked)}
                />
              </label>
            </fieldset>
            <label className="switch-row timezone-confirm">
              <span>
                <strong>{t('useBrowserTimezone')}</strong>
                <small>
                  {browserZone} · {t('timezoneHelp')}
                </small>
              </span>
              <input
                type="checkbox"
                checked={zoneConfirmed}
                onChange={(event) => setZoneConfirmed(event.target.checked)}
              />
            </label>
            <div className="local-note">
              <span aria-hidden="true">◇</span>
              <p>{t('setupPrivacy')}</p>
            </div>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <footer className="setup-actions">
        <button
          className="button secondary"
          type="button"
          onClick={() => setStep(step - 1)}
          disabled={step === 0 || busy}
        >
          {t('back')}
        </button>
        {step < 2 ? (
          <button className="button primary" type="button" onClick={() => setStep(step + 1)}>
            {t('continue')} <span aria-hidden="true">→</span>
          </button>
        ) : (
          <button className="button primary" type="button" onClick={save} disabled={busy}>
            {busy ? t('saving') : t('saveSetup')} <span aria-hidden="true">✓</span>
          </button>
        )}
      </footer>
    </section>
  );
}
