import { useEffect, useRef, useState } from 'react';
import { normalizeISBN } from '../../lib/isbn.js';
import {
  initialLibraryState,
  LIBRARY_FORMATS,
  LIBRARY_REFERENCE,
  LIBRARY_STATUSES,
  libraryGenres,
  libraryStateFits,
  mergeResourceMetadata,
  resourceURL,
} from '../../lib/library-records.js';
import { generateLibrarySummary, librarySummarySource } from '../../lib/library-summary.js';
import { useStoredState } from '../hooks/useStoredState.js';
import MarkdownView from './MarkdownView.jsx';

export { LIBRARY_REFERENCE };
export default function LibraryWorkspace() {
  const [state, setState, loaded] = useStoredState('library-resources', initialLibraryState);
  const items = Array.isArray(state?.items) ? state.items : [];
  const latestItems = useRef(items);
  latestItems.current = items;
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [format, setFormat] = useState('all');
  const [genre, setGenre] = useState('all');
  const [status, setStatus] = useState('all');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: '', url: '', isbn: '', format: 'book' });
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState(null);
  const attempts = useRef(new Set());
  const dialog = useRef(null);
  const [summaryModel, setSummaryModel] = useState('qwen3.5:4b');
  const [summariesEnabled, setSummariesEnabled] = useState(false);
  useEffect(() => {
    fetch('/api/profile')
      .then((response) => response.json())
      .then((profile) => setSummariesEnabled(profile.agent?.enabled === true))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [selected]);
  async function request(path, body) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Local summary request failed.');
    return result;
  }
  async function summarize(item, enable = false) {
    if (busy || !loaded) return;
    setBusy(`summary:${item.id}`);
    setError('');
    setNotice('');
    try {
      if (enable) {
        await request('/api/profile', { profile: { agent: { enabled: true } } });
        setSummariesEnabled(true);
      }
      const fingerprint = JSON.stringify(librarySummarySource(item));
      const result = await generateLibrarySummary(item, summaryModel.trim(), request);
      const latest = latestItems.current.find((value) => value.id === item.id);
      if (!latest || JSON.stringify(librarySummarySource(latest)) !== fingerprint)
        throw new Error(
          'Resource details changed during generation. Your edits were kept; generate a fresh overview.'
        );
      changeItems((list) =>
        list.map((value) =>
          value.id === item.id && JSON.stringify(librarySummarySource(value)) === fingerprint
            ? { ...value, ...result }
            : value
        )
      );
      setNotice('Local overview generated from resource details. Your notes were kept.');
    } catch (reason) {
      setError(reason.message || 'Could not generate a local overview.');
    } finally {
      setBusy('');
    }
  }
  const current = items.find((item) => item.id === selected);
  const genres = [...new Set(items.flatMap((item) => item.genres || []))].sort((a, b) =>
    a.localeCompare(b)
  );
  const visible = items.filter(
    (item) =>
      (format === 'all' || item.format === format) &&
      (status === 'all' || item.status === status) &&
      (genre === 'all' || (item.genres || []).includes(genre)) &&
      `${item.title} ${item.author} ${(item.genres || []).join(' ')}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase())
  );
  function changeItems(update) {
    if (!loaded) return;
    setState((previous) => {
      const next = update(previous.items || []);
      if (!libraryStateFits(next)) {
        setError('This shelf is full. Keep it below 100 resources and 60 KiB of text.');
        return previous;
      }
      return { ...previous, items: next };
    });
  }
  function patch(id, values) {
    changeItems((list) => list.map((item) => (item.id === id ? { ...item, ...values } : item)));
  }
  async function lookup(item) {
    if (item.isbn && !normalizeISBN(item.isbn)) {
      setError('Enter a valid ISBN-10 or ISBN-13 before looking up the resource.');
      return;
    }
    if (busy || !(resourceURL(item.url) || normalizeISBN(item.isbn)) || !loaded) return;
    attempts.current.add(`${item.id}|${item.url}`);
    setBusy(item.id);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/library/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(normalizeISBN(item.isbn) ? { isbn: normalizeISBN(item.isbn) } : { url: item.url }),
          format: item.format,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Resource details are unavailable. Enter them manually.');
      if (result.ok && result.metadata) {
        changeItems((list) =>
          list.map((value) =>
            value.id === item.id ? mergeResourceMetadata(value, result.metadata) : value
          )
        );
        setNotice(
          `Available resource details added. Your notes and existing details were kept. ${(result.warnings || []).join(' ')}`
        );
        return mergeResourceMetadata(item, result.metadata);
      } else
        setNotice(
          result.warnings?.join(' ') ||
            'No public details were found. You can fill them in yourself.'
        );
    } catch (reason) {
      setError(
        reason.message || 'Could not get resource details. You can still add them manually.'
      );
    } finally {
      setBusy('');
    }
  }
  async function open(item) {
    setSelected(item.id);
    setError('');
    setNotice('');
    const details =
      (item.url || normalizeISBN(item.isbn)) &&
      !item.fetchedAt &&
      !attempts.current.has(`${item.id}|${item.url}`)
        ? (await lookup(item)) || item
        : item;
    if (summariesEnabled && !details.summary) await summarize(details);
  }
  function add(event) {
    event.preventDefault();
    setError('');
    const url = draft.url.trim();
    if (url && !resourceURL(url)) {
      setError('Use a public HTTPS resource link.');
      return;
    }
    if (draft.isbn.trim() && !normalizeISBN(draft.isbn)) {
      setError('Enter a valid ISBN-10 or ISBN-13.');
      return;
    }
    if (!draft.title.trim() && !url && !normalizeISBN(draft.isbn)) {
      setError('Enter a title or a resource link.');
      return;
    }
    const item = {
      id: crypto.randomUUID(),
      isbn: normalizeISBN(draft.isbn),
      title: draft.title.trim(),
      url,
      format: draft.format,
      author: '',
      description: '',
      genres: [],
      notes: '',
      status: 'planned',
      year: '',
      publisher: '',
    };
    if (!libraryStateFits([...items, item])) {
      setError('This shelf has reached its local storage limit.');
      return;
    }
    changeItems((list) => [...list, item]);
    setSelected(item.id);
    setAdding(false);
    setDraft({ title: '', url: '', isbn: '', format: 'book' });
    setQuery('');
    setFormat('all');
    setGenre('all');
    setStatus('all');
    if (url || item.isbn) lookup(item);
  }
  return (
    <div className="library-workspace" aria-busy={Boolean(busy)}>
      <header className="library-heading">
        <div>
          <span className="demo-eyebrow">LIBRARY · KEEP WHAT STAYS WITH YOU</span>
          <h2>Books, voices, films and ideas.</h2>
          <p>Collect resources, keep your notes, and return to what matters.</p>
        </div>
        <button
          type="button"
          className="demo-button"
          disabled={!loaded}
          onClick={() => setAdding(!adding)}
        >
          {adding ? 'Close form' : 'Add resource +'}
        </button>
      </header>
      {!loaded && <p role="status">Loading your shelf…</p>}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {removed && (
        <p role="status">
          Resource removed.{' '}
          <button
            type="button"
            className="demo-text-button"
            onClick={() => {
              changeItems((list) => [...list, removed]);
              setSelected(removed.id);
              setRemoved(null);
            }}
          >
            Undo
          </button>
        </p>
      )}
      {adding && (
        <form className="demo-card library-add" onSubmit={add}>
          <label className="demo-field">
            Format
            <select
              value={draft.format}
              onChange={(e) => setDraft({ ...draft, format: e.target.value })}
            >
              {Object.entries(LIBRARY_FORMATS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="demo-field">
            Resource title
            <input
              value={draft.title}
              maxLength={300}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="A title, or leave blank to use the link"
            />
          </label>
          <label className="demo-field library-span">
            Resource link
            <input
              type="url"
              value={draft.url}
              maxLength={2000}
              onChange={(e) => setDraft({ ...draft, url: e.target.value })}
              placeholder="https://…"
            />
            <small>
              Optional. Adding or opening a linked resource requests its public metadata. Notes stay
              local. ISBN lookup uses Open Library, then Google Books when needed.
            </small>
          </label>
          <label className="demo-field">
            ISBN (books and audiobooks)
            <input
              value={draft.isbn}
              maxLength={32}
              placeholder="9780191816802"
              onChange={(event) => setDraft({ ...draft, isbn: event.target.value })}
            />
            <small>Public catalogs receive only this identifier, never your notes.</small>
          </label>
          <button className="demo-button" disabled={Boolean(busy) || !loaded} type="submit">
            Add to library
          </button>
        </form>
      )}
      <section className="demo-card library-tools" aria-label="Library filters">
        <label className="demo-field">
          Search the shelf
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Title, creator or genre"
          />
        </label>
        <label className="demo-field">
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="all">All formats</option>
            {Object.entries(LIBRARY_FORMATS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="demo-field">
          Genre
          <select value={genre} onChange={(e) => setGenre(e.target.value)}>
            <option value="all">All genres</option>
            {genres.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label className="demo-field">
          Progress
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(LIBRARY_STATUSES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>
      <div className="library-shelf">
        {visible.map((item) => (
          <button
            className={`library-resource ${selected === item.id ? 'library-selected' : ''}`}
            type="button"
            key={item.id}
            aria-pressed={selected === item.id}
            aria-label={`Open resource: ${item.title || item.url}`}
            onClick={() => open(item)}
          >
            {item.id === LIBRARY_REFERENCE.id ? (
              <img src={LIBRARY_REFERENCE.cover} alt={item.title} width="70" height="106" />
            ) : (
              <span className="library-format-icon" aria-hidden="true">
                {{ book: '▤', audiobook: '◉', video: '▷', film: '▣', course: '◇', article: '▧' }[
                  item.format
                ] || '▤'}
              </span>
            )}
            <span className="library-resource-copy">
              <small>
                {LIBRARY_FORMATS[item.format] || 'Resource'} ·{' '}
                {LIBRARY_STATUSES[item.status] || 'Planned'}
              </small>
              <strong>{item.title || item.url}</strong>
              <span>{item.author || 'Details to add'}</span>
              <span className="library-tags">
                {(item.genres || []).slice(0, 3).map((value) => (
                  <span key={value}>{value}</span>
                ))}
              </span>
            </span>
          </button>
        ))}
      </div>
      {!visible.length && loaded && (
        <p>No matching resources. Change a filter or add something to the shelf.</p>
      )}
      {current && (
        <dialog
          ref={dialog}
          className="demo-card library-detail library-detail-modal"
          aria-label="Resource details"
          onCancel={() => setSelected('')}
        >
          <header>
            <div>
              <span className="demo-eyebrow">RESOURCE DETAILS</span>
              <h3>{current.title || 'Untitled resource'}</h3>
            </div>
            <button
              type="button"
              className="demo-text-button"
              disabled={!loaded}
              onClick={() => {
                setRemoved(current);
                changeItems((list) => list.filter((item) => item.id !== current.id));
                setSelected('');
              }}
            >
              Remove resource
            </button>
          </header>
          <button
            type="button"
            className="library-close"
            aria-label="Close resource"
            onClick={() => setSelected('')}
          >
            ×
          </button>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
          <p>{[current.publisher, current.year].filter(Boolean).join(' · ')}</p>
          {current.publicReference && (
            <p>Public bibliographic reference. Your progress and notes are editable.</p>
          )}
          <section className="library-summary" aria-label="Local resource overview">
            <h4>Resource overview</h4>
            <p className="field-help">
              Generated locally from the available title, author and description. This is not a
              summary of the full book, film or course. Your personal notes are excluded.
            </p>
            {current.summary ? <MarkdownView text={current.summary} /> : <p>No overview yet.</p>}
            {current.summaryGeneratedAt && (
              <small>
                Generated by {current.summaryModel} ·{' '}
                {new Date(current.summaryGeneratedAt).toLocaleDateString('en-GB')}
              </small>
            )}
            <label className="demo-field">
              Local summary model
              <input
                value={summaryModel}
                maxLength={120}
                onChange={(event) => setSummaryModel(event.target.value)}
                disabled={Boolean(busy)}
              />
            </label>
            <button
              className="demo-button"
              type="button"
              disabled={Boolean(busy) || !loaded}
              onClick={() => summarize(current, !summariesEnabled)}
            >
              {busy === `summary:${current.id}`
                ? 'Generating locally…'
                : !summariesEnabled
                  ? 'Enable local summaries and generate'
                  : current.summary
                    ? 'Regenerate local overview'
                    : 'Generate local overview'}
            </button>
          </section>
          <div className="library-detail-grid">
            <label className="demo-field">
              ISBN / eISBN
              <input
                value={current.isbn || ''}
                maxLength={32}
                onChange={(event) => patch(current.id, { isbn: event.target.value, fetchedAt: '' })}
              />
              <small>Used to find public bibliographic information and genres.</small>
            </label>
            <label className="demo-field">
              DOI
              <input
                value={current.doi || ''}
                maxLength={120}
                onChange={(event) => patch(current.id, { doi: event.target.value })}
              />
            </label>
            <label className="demo-field">
              Title
              <input
                value={current.title || ''}
                maxLength={300}
                disabled={!loaded}
                onChange={(e) => patch(current.id, { title: e.target.value })}
              />
            </label>
            <label className="demo-field">
              Creator / author
              <input
                value={current.author || ''}
                maxLength={300}
                disabled={!loaded}
                onChange={(e) => patch(current.id, { author: e.target.value })}
              />
            </label>
            <label className="demo-field">
              Resource format
              <select
                value={current.format}
                disabled={!loaded}
                onChange={(e) => patch(current.id, { format: e.target.value })}
              >
                {Object.entries(LIBRARY_FORMATS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="demo-field">
              Resource progress
              <select
                value={current.status}
                disabled={!loaded}
                onChange={(e) => patch(current.id, { status: e.target.value })}
              >
                {Object.entries(LIBRARY_STATUSES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="demo-field">
              Year
              <input
                value={current.year || ''}
                maxLength={30}
                disabled={!loaded}
                onChange={(e) => patch(current.id, { year: e.target.value })}
              />
            </label>
            <label className="demo-field">
              Publisher / platform
              <input
                value={current.publisher || ''}
                maxLength={300}
                disabled={!loaded}
                onChange={(e) => patch(current.id, { publisher: e.target.value })}
              />
            </label>
            <label className="demo-field library-span">
              Source link
              <input
                type="url"
                value={current.url || ''}
                maxLength={2000}
                disabled={!loaded}
                onChange={(e) => patch(current.id, { url: e.target.value, fetchedAt: '' })}
              />
            </label>
            <label className="demo-field library-span">
              Description
              <textarea
                value={current.description || ''}
                maxLength={1500}
                rows={3}
                disabled={!loaded}
                onChange={(e) => patch(current.id, { description: e.target.value })}
              />
            </label>
            <label className="demo-field library-span">
              Genres
              <input
                key={`${current.id}-${current.fetchedAt || ''}`}
                defaultValue={(current.genres || []).join(', ')}
                maxLength={720}
                disabled={!loaded}
                onBlur={(e) => patch(current.id, { genres: libraryGenres(e.target.value) })}
              />
              <small>
                Public genres and categories are added when available. Edit them or separate your
                own with commas.
              </small>
            </label>
            <label className="demo-field library-span">
              My notes
              <textarea
                value={current.notes || ''}
                maxLength={6000}
                rows={5}
                disabled={!loaded}
                onChange={(e) => patch(current.id, { notes: e.target.value })}
                placeholder="What stayed with you? A quote, a question, or a connection to a project."
              />
              <small>
                Notes, genres, progress and overviews are saved in local Markdown. They are never
                included in a metadata request.
              </small>
            </label>
          </div>
          <footer>
            {resourceURL(current.url) && (
              <a
                className="demo-text-button"
                href={resourceURL(current.url)}
                target="_blank"
                rel="noreferrer"
              >
                {current.publicReference ? 'Oxford Reference · source' : 'Open original resource'} ↗
              </a>
            )}
            <button
              type="button"
              className="demo-button demo-secondary"
              disabled={Boolean(busy) || !resourceURL(current.url) || !loaded}
              onClick={() => lookup(current)}
            >
              {busy === current.id ? 'Getting resource details…' : 'Refresh resource details'}
            </button>
            {current.fetchedAt && (
              <small>
                Metadata checked {new Date(current.fetchedAt).toLocaleDateString('en-GB')}. Existing
                text and notes are kept.
                {current.metadataSource && (
                  <>
                    {' '}
                    Automatically retrieved from{' '}
                    <a href={current.metadataSource} target="_blank" rel="noreferrer">
                      source details
                    </a>
                    .
                  </>
                )}
              </small>
            )}
          </footer>
        </dialog>
      )}
    </div>
  );
}
