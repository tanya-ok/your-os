import { useCallback, useEffect, useId, useState } from 'react';
import { ownerCeremony } from './owner-passkey.js';

const VAULTS = [
  { id: 'self', en: 'Person-self-model', ru: 'Person-self-model' },
  { id: 'ai', en: 'AI-Model', ru: 'AI-Model' },
];
const STATE_LABEL = {
  unchanged: ['Unchanged since capture', 'Не менялся с момента записи'],
  changed: ['Changed since capture', 'Изменился после записи'],
  missing: ['Missing', 'Отсутствует'],
  unavailable: ['Unavailable', 'Недоступен'],
};

async function call(path, body) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
const emptySource = () => ({ vault: 'main', path: '', startLine: '', endLine: '' });

/** Human review of model-vault observations: nothing is accepted without this screen. */
export default function ObservationReview({ locale = 'en', onOpenSetup }) {
  const ru = locale === 'ru';
  const l = (en, russian) => (ru ? russian : en);
  const uid = useId().replaceAll(':', '');
  const [vault, setVault] = useState('self');
  const [listing, setListing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ claim: '', uncertainty: '', confidence: 'low' });
  const [sources, setSources] = useState([emptySource()]);
  const [decision, setDecision] = useState({
    wording: '',
    note: '',
    nextReview: '',
    acknowledge: false,
  });

  const load = useCallback(async () => {
    setError('');
    try {
      setListing(await call(`/api/observations/${vault}`));
    } catch (reason) {
      setError(reason.message);
    }
  }, [vault]);
  useEffect(() => {
    setSelected(null);
    load();
  }, [load]);

  async function open(id, keepNotice = false) {
    setError('');
    if (!keepNotice) setNotice('');
    try {
      const detail = await call(`/api/observations/${vault}/${id}`);
      setSelected(detail);
      setDecision({ wording: detail.claim, note: '', nextReview: '', acknowledge: false });
    } catch (reason) {
      setError(reason.message);
    }
  }
  async function create(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = {
        claim: draft.claim,
        confidence: draft.confidence,
        sources: sources
          .filter((source) => source.path.trim())
          .map((source) => ({
            vault: source.vault,
            path: source.path.trim(),
            ...(source.startLine ? { startLine: Number(source.startLine) } : {}),
            ...(source.endLine ? { endLine: Number(source.endLine) } : {}),
          })),
        ...(draft.uncertainty.trim() ? { uncertainty: draft.uncertainty } : {}),
      };
      const created = await call(`/api/observations/${vault}`, body);
      setDraft({ claim: '', uncertainty: '', confidence: 'low' });
      setSources([emptySource()]);
      setNotice(l('Candidate saved for review.', 'Кандидат сохранён для проверки.'));
      await load();
      await open(created.id, true);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(kind) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const body = {
        decision: kind,
        expectedHash: selected.hash,
        ...(kind === 'accept' && decision.wording.trim() ? { wording: decision.wording } : {}),
        ...(decision.note.trim() ? { note: decision.note } : {}),
        ...(decision.nextReview ? { nextReview: decision.nextReview } : {}),
        ...(kind === 'accept' && decision.acknowledge ? { acknowledgeSourceChanges: true } : {}),
      };
      if (kind === 'accept') {
        const challenge = await call(`/api/observations/${vault}/${selected.id}/approval`, body);
        body.ownerProof = {
          challengeId: challenge.challengeId,
          response: await ownerCeremony('get', challenge.options),
        };
      }
      const result = await call(`/api/observations/${vault}/${selected.id}/review`, body);
      setNotice(
        {
          accepted: l(
            'Accepted. The claim can now be selected for the agent.',
            'Принято. Утверждение можно выбрать для агента.'
          ),
          rejected: l('Rejected. It stays out of retrieval.', 'Отклонено. В поиск не попадает.'),
          deferred: l('Deferred until the chosen date.', 'Отложено до выбранной даты.'),
        }[result.status]
      );
      await load();
      await open(selected.id, true);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  const writable = listing?.writable === true;
  const waiting = (c) => ['candidate', 'deferred'].includes(c.status) || c.needsReview === true;
  const open_ = (listing?.candidates || []).filter(waiting);
  const decided = (listing?.candidates || []).filter((c) => !waiting(c));
  const drift = selected?.sources.some((source) => source.state !== 'unchanged');
  const decidable = selected && waiting(selected) && writable;

  return (
    <section className="review-card card observation-review" aria-labelledby={`${uid}-title`}>
      <span className="eyebrow">{l('Observations', 'Наблюдения')}</span>
      <h2 id={`${uid}-title`}>{l('Review before anything is accepted', 'Проверка до принятия')}</h2>
      <p className="field-help">
        Accepting an observation asks for your local confirmation key.
        {onOpenSetup && (
          <button type="button" className="text-button" onClick={onOpenSetup}>
            Set up in Setup ↗
          </button>
        )}
      </p>
      <p className="field-help">
        {l(
          'Candidates cite exact notes. They stay out of retrieval until you accept them; the agent cannot accept anything itself.',
          'Кандидаты ссылаются на конкретные заметки. Пока вы их не приняли, они не попадают в поиск; агент сам ничего принять не может.'
        )}
      </p>
      <div className="fields-row" role="radiogroup" aria-label={l('Model vault', 'Волт модели')}>
        {VAULTS.map((item) => (
          <label key={item.id} className="agent-checkbox">
            <input
              type="radio"
              name={`${uid}-vault`}
              checked={vault === item.id}
              onChange={() => setVault(item.id)}
            />
            {ru ? item.ru : item.en}
          </label>
        ))}
      </div>
      {error && <p className="error-message">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {listing && !listing.configured && (
        <p className="field-help">{l('This vault is not configured.', 'Этот волт не настроен.')}</p>
      )}
      {listing?.configured && (
        <>
          {!writable && (
            <p className="field-help">
              {l(
                'Read only. Set ALLOW_MODEL_VAULT_WRITES=true to save candidates and reviews.',
                'Только чтение. Чтобы сохранять кандидатов и решения, задайте ALLOW_MODEL_VAULT_WRITES=true.'
              )}
            </p>
          )}
          {listing.pendingOperations > 0 && (
            <p className="error-message">
              {l(
                'An interrupted review could not be completed; check the vault before continuing.',
                'Прерванное решение не удалось завершить; проверьте волт перед продолжением.'
              )}
            </p>
          )}
          {listing.recoveryConflicts?.length > 0 && (
            <ul className="field-help" aria-label="Recovery conflicts">
              {listing.recoveryConflicts.map((conflict) => (
                <li key={conflict.operation}>
                  <strong>{conflict.operation}</strong>: {conflict.message}
                </li>
              ))}
            </ul>
          )}
          <h3>{l('Waiting for review', 'Ждут проверки')}</h3>
          {open_.length === 0 && (
            <p className="field-help">{l('Nothing waiting.', 'Ничего не ждёт.')}</p>
          )}
          <ul className="observation-list">
            {open_.map((item) => (
              <li key={item.id}>
                <button type="button" className="button secondary" onClick={() => open(item.id)}>
                  {item.needsReview
                    ? 'Review again: '
                    : item.status === 'deferred'
                      ? `${l('Deferred to', 'Отложено до')} ${item.nextReview}: `
                      : ''}
                  {item.claim || item.id}
                </button>
              </li>
            ))}
          </ul>
          {selected && (
            <article className="observation-detail" aria-labelledby={`${uid}-detail`}>
              <span className="eyebrow">
                {selected.needsReview ? 'Owner-confirmed review is required' : selected.label}
              </span>
              <h3 id={`${uid}-detail`}>{selected.claim}</h3>
              {selected.uncertainty && (
                <p className="field-help">
                  {l('Uncertainty', 'Неопределённость')}: {selected.uncertainty}
                </p>
              )}
              <p className="field-help">
                {l('Status', 'Статус')}: {selected.status} · {l('confidence', 'уверенность')}:{' '}
                {selected.confidence}
              </p>
              <h4>{l('Sources', 'Источники')}</h4>
              {selected.sources.map((source) => (
                <figure key={`${source.vault}:${source.path}:${source.startLine || ''}`}>
                  <figcaption>
                    {source.vault} · {source.path}
                    {source.startLine
                      ? ` · ${l('lines', 'строки')} ${source.startLine}-${source.endLine || source.startLine}`
                      : ''}{' '}
                    · <strong>{l(...STATE_LABEL[source.state])}</strong>
                  </figcaption>
                  {source.excerpt && <pre className="observation-excerpt">{source.excerpt}</pre>}
                </figure>
              ))}
              {selected.reviews.length > 0 && (
                <p className="field-help">
                  {l('Earlier decisions', 'Прошлые решения')}:{' '}
                  {selected.reviews
                    .map((r) => `${r.decision} ${r.reviewed_at.slice(0, 10)}`)
                    .join(', ')}
                </p>
              )}
              {decidable && (
                <fieldset disabled={busy} className="review-workspace-fields">
                  <label className="field">
                    <span>
                      {l('Final wording if accepted', 'Итоговая формулировка при принятии')}
                    </span>
                    <textarea
                      rows={3}
                      value={decision.wording}
                      onChange={(event) =>
                        setDecision({ ...decision, wording: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>{l('Review note (optional)', 'Заметка к решению (необязательно)')}</span>
                    <textarea
                      rows={2}
                      value={decision.note}
                      onChange={(event) => setDecision({ ...decision, note: event.target.value })}
                    />
                  </label>
                  <label className="field compact">
                    <span>{l('Next review date', 'Дата следующей проверки')}</span>
                    <input
                      type="date"
                      value={decision.nextReview}
                      disabled={busy}
                      onChange={(event) =>
                        setDecision({ ...decision, nextReview: event.target.value })
                      }
                    />
                  </label>
                  {drift && (
                    <label className="agent-checkbox">
                      <input
                        type="checkbox"
                        checked={decision.acknowledge}
                        disabled={busy}
                        onChange={(event) =>
                          setDecision({ ...decision, acknowledge: event.target.checked })
                        }
                      />
                      {l(
                        'I have read the changed or missing sources and still accept.',
                        'Изменившиеся или пропавшие источники просмотрены, принять всё равно.'
                      )}
                    </label>
                  )}
                  <div className="review-footer">
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => decide('accept')}
                      disabled={busy}
                    >
                      {l('Accept', 'Принять')}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => decide('defer')}
                      disabled={busy}
                    >
                      {l('Defer', 'Отложить')}
                    </button>
                    <button
                      type="button"
                      className="button secondary"
                      onClick={() => decide('reject')}
                      disabled={busy}
                    >
                      {l('Reject', 'Отклонить')}
                    </button>
                  </div>
                </fieldset>
              )}
            </article>
          )}
          <h3>{l('Accepted claims', 'Принятые утверждения')}</h3>
          {(listing.accepted || []).length === 0 && (
            <p className="field-help">{l('None yet.', 'Пока нет.')}</p>
          )}
          <ul className="observation-list">
            {(listing.accepted || []).map((item) => (
              <li key={item.id}>
                {item.eligible
                  ? `${item.claim} · ${l('review on', 'проверить')} ${item.nextReview}`
                  : `${item.id}: ${l('no matching human review, not eligible', 'нет совпадающей проверки человеком, не используется')}`}
              </li>
            ))}
          </ul>
          {decided.length > 0 && (
            <p className="field-help">
              {l('Decided candidates kept for history', 'Решённые кандидаты сохранены для истории')}
              : {decided.length}
            </p>
          )}
          {writable && (
            <form onSubmit={create} className="observation-new">
              <h3>{l('New candidate', 'Новый кандидат')}</h3>
              <fieldset disabled={busy} className="review-workspace-fields">
                <label className="field">
                  <span>{l('Claim', 'Утверждение')}</span>
                  <textarea
                    rows={2}
                    required
                    value={draft.claim}
                    onChange={(event) => setDraft({ ...draft, claim: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>{l('What is uncertain', 'Что неточно')}</span>
                  <textarea
                    rows={2}
                    value={draft.uncertainty}
                    onChange={(event) => setDraft({ ...draft, uncertainty: event.target.value })}
                  />
                </label>
                <label className="field compact">
                  <span>{l('Confidence', 'Уверенность')}</span>
                  <select
                    value={draft.confidence}
                    onChange={(event) => setDraft({ ...draft, confidence: event.target.value })}
                  >
                    <option value="low">{l('low', 'низкая')}</option>
                    <option value="medium">{l('medium', 'средняя')}</option>
                    <option value="high">{l('high', 'высокая')}</option>
                  </select>
                </label>
                {sources.map((source, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional inputs
                  <div className="fields-row" key={index}>
                    <label className="field compact">
                      <span>{l('Vault', 'Волт')}</span>
                      <select
                        value={source.vault}
                        onChange={(event) =>
                          setSources(
                            sources.map((s, i) =>
                              i === index ? { ...s, vault: event.target.value } : s
                            )
                          )
                        }
                      >
                        <option value="main">Main Vault</option>
                        <option value="self">Person-self-model</option>
                        <option value="ai">AI-Model</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>{l('Note path', 'Путь к заметке')}</span>
                      <input
                        placeholder="Projects/example.md"
                        value={source.path}
                        onChange={(event) =>
                          setSources(
                            sources.map((s, i) =>
                              i === index ? { ...s, path: event.target.value } : s
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field compact">
                      <span>{l('From line', 'С строки')}</span>
                      <input
                        type="number"
                        min="1"
                        value={source.startLine}
                        onChange={(event) =>
                          setSources(
                            sources.map((s, i) =>
                              i === index ? { ...s, startLine: event.target.value } : s
                            )
                          )
                        }
                      />
                    </label>
                    <label className="field compact">
                      <span>{l('To line', 'По строку')}</span>
                      <input
                        type="number"
                        min="1"
                        value={source.endLine}
                        onChange={(event) =>
                          setSources(
                            sources.map((s, i) =>
                              i === index ? { ...s, endLine: event.target.value } : s
                            )
                          )
                        }
                      />
                    </label>
                  </div>
                ))}
                <div className="review-footer">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setSources([...sources, emptySource()])}
                    disabled={sources.length >= 20}
                  >
                    {l('Add source', 'Добавить источник')}
                  </button>
                  <button type="submit" className="button primary">
                    {l('Save candidate', 'Сохранить кандидата')}
                  </button>
                </div>
              </fieldset>
            </form>
          )}
        </>
      )}
    </section>
  );
}
