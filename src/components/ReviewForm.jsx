import { useEffect, useId, useState } from 'react';

const choose = (locale, en, ru) => (locale === 'ru' ? ru : en);
const LABELS = {
  theme: 'Theme',
  helped: 'What helped',
  attention: 'Needs attention',
  outcome: 'One useful outcome for the coming week',
  nextStep: 'A small step I can make time for',
};
const CLEAR = [
  'Look through Next, Waiting and Someday',
  'Give each active project one clear next action',
  'Decide what to keep, postpone or let go',
];
const SECTIONS = ['Notice', 'Clear', 'Choose', 'Connected projects'];
function editable(review) {
  return JSON.stringify([
    review.theme,
    review.helped,
    review.attention,
    review.clear,
    review.outcome,
    review.nextStep,
    review.projectIds,
  ]);
}
function sectionsOf(source) {
  const result = [];
  let offset = 0;
  let fence = '';
  for (const line of source.split(/(?<=\n)/)) {
    const boundary = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (boundary) {
      if (!fence) fence = boundary[1][0];
      else if (boundary[1][0] === fence) fence = '';
    }
    const heading = !fence && line.match(/^## ([^\r\n]+)\r?\n?$/);
    if (heading) {
      if (result.length) result[result.length - 1].end = offset;
      result.push({
        title: heading[1],
        start: offset,
        bodyStart: offset + line.length,
        end: source.length,
      });
    }
    offset += line.length;
  }
  return result;
}
function labelled(body, labels) {
  const fields = {};
  const lines = body.trim().split(/\r?\n/);
  let active = '';
  const leftovers = [];
  for (const line of lines) {
    const key = Object.keys(labels).find((name) => line.startsWith(`${labels[name]}:`));
    if (key) {
      active = key;
      fields[key] = line.slice(labels[key].length + 1).trimStart();
    } else if (active) fields[active] += `\n${line}`;
    else leftovers.push(line);
  }
  for (const key of Object.keys(fields)) fields[key] = fields[key].trim();
  return { fields, leftover: leftovers.join('\n').trim() };
}

export function parseReview(source = '') {
  const sections = sectionsOf(source);
  const body = (title) => {
    const section = sections.find((item) => item.title === title);
    return section ? source.slice(section.bodyStart, section.end) : '';
  };
  const notice = labelled(body('Notice'), {
    theme: LABELS.theme,
    helped: LABELS.helped,
    attention: LABELS.attention,
  });
  const choices = labelled(body('Choose'), { outcome: LABELS.outcome, nextStep: LABELS.nextStep });
  const clearRows = [...body('Clear').matchAll(/^- \[([ xX])\] (.*)$/gm)]
    .slice(0, 3)
    .map((match) => ({
      checked: match[1].toLowerCase() === 'x',
      title: match[2].replace(/\r$/, ''),
    }));
  const review = {
    theme: notice.fields.theme || '',
    helped: notice.fields.helped || notice.leftover,
    attention: notice.fields.attention || '',
    clear: CLEAR.map((_, index) => clearRows[index]?.checked || false),
    outcome: choices.fields.outcome || choices.leftover,
    nextStep: choices.fields.nextStep || '',
    projectIds: [
      ...new Set(
        [
          ...body('Connected projects').matchAll(
            /\[\[Projects\/([a-zA-Z0-9][a-zA-Z0-9_-]*)(?:\|[^\]\n]+)?\]\]/g
          ),
        ].map((match) => match[1])
      ),
    ],
    original: source,
    sections,
    clearRows,
  };
  review.baseline = editable(review);
  return review;
}

export function serializeReview(review) {
  if (editable(review) === review.baseline) return review.original;
  const original = parseReview(review.original);
  const changed = {
    Notice: ['theme', 'helped', 'attention'].some((key) => review[key] !== original[key]),
    Clear: JSON.stringify(review.clear) !== JSON.stringify(original.clear),
    Choose: review.outcome !== original.outcome || review.nextStep !== original.nextStep,
    'Connected projects': JSON.stringify(review.projectIds) !== JSON.stringify(original.projectIds),
  };
  const clearSection = review.sections.find((item) => item.title === 'Clear');
  const previousClear = clearSection
    ? review.original.slice(clearSection.bodyStart, clearSection.end).trim()
    : '';
  let index = 0;
  const clear = previousClear.replace(/^- \[[ xX]\] (.*)$/gm, (line, title) => {
    if (index >= 3) return line;
    return `- [${review.clear[index++] ? 'x' : ' '}] ${title}`;
  });
  const missing = CLEAR.slice(index)
    .map((title, offset) => `- [${review.clear[index + offset] ? 'x' : ' '}] ${title}`)
    .join('\n');
  const blocks = {
    Notice: [
      [LABELS.theme, review.theme],
      [LABELS.helped, review.helped],
      [LABELS.attention, review.attention],
    ]
      .map(([label, value]) => `${label}: ${value}`)
      .join('\n\n'),
    Clear: [clear, missing].filter(Boolean).join('\n'),
    Choose: `${LABELS.outcome}: ${review.outcome}\n\n${LABELS.nextStep}: ${review.nextStep}`,
    'Connected projects': review.projectIds
      .filter((id) => /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(id))
      .map((id) => `- [[Projects/${id}]]`)
      .join('\n'),
  };
  let source = review.original;
  const first = new Set();
  const replacements = review.sections.filter((section) => {
    if (!SECTIONS.includes(section.title) || first.has(section.title)) return false;
    first.add(section.title);
    return true;
  });
  for (const section of replacements.reverse())
    if (changed[section.title])
      source = `${source.slice(0, section.bodyStart)}\n${blocks[section.title]}\n\n${source.slice(section.end)}`;
  for (const title of SECTIONS)
    if (!first.has(title))
      source = `${source.replace(/\s*$/, '')}\n\n## ${title}\n\n${blocks[title]}\n`;
  return source;
}

export default function ReviewForm({
  text = '',
  locale = 'en',
  projects = [],
  busy = false,
  writable = true,
  onPreview,
}) {
  const l = (en, ru) => choose(locale, en, ru);
  const id = useId();
  const [review, setReview] = useState(() => parseReview(text));
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState(text);
  useEffect(() => {
    setReview(parseReview(text));
    setRaw(text);
  }, [text]);
  const patch = (values) => setReview((previous) => ({ ...previous, ...values }));
  const serialized = advanced ? raw : serializeReview(review);
  const labels = [
    ['theme', l('Theme of the week', 'Тема недели')],
    ['helped', l('What helped?', 'Что помогло?')],
    ['attention', l('What needs attention?', 'Что требует внимания?')],
  ];
  function toggleAdvanced() {
    if (advanced) setReview(parseReview(raw));
    else setRaw(serializeReview(review));
    setAdvanced((value) => !value);
  }
  return (
    <form
      className="review-workspace card"
      onSubmit={(event) => {
        event.preventDefault();
        onPreview?.({ type: 'review', text: serialized });
      }}
    >
      <header className="review-workspace-heading">
        <span className="eyebrow">
          {l('A small pause to find your direction', 'Небольшая пауза, чтобы выбрать направление')}
        </span>
        <h2>{l('Weekly review', 'Обзор недели')}</h2>
        <p>
          {l(
            'Notice what happened, clear the loose ends, and choose a next step.',
            'Заметить, что произошло, разобраться с незавершённым и выбрать следующий шаг.'
          )}
        </p>
      </header>
      <button
        className="review-workspace-mode"
        type="button"
        aria-pressed={advanced}
        onClick={toggleAdvanced}
      >
        {advanced
          ? l('Return to the form', 'Вернуться к форме')
          : l('Advanced · edit Markdown', 'Дополнительно · редактировать Markdown')}
      </button>
      <fieldset disabled={!writable || busy} className="review-workspace-fields">
        {advanced ? (
          <label className="review-workspace-field">
            <span>{l('Review Markdown', 'Markdown обзора')}</span>
            <textarea
              rows={18}
              maxLength={12000}
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
            />
          </label>
        ) : (
          <>
            <section aria-labelledby={`${id}-notice`}>
              <div className="review-workspace-section-title">
                <span>01</span>
                <h3 id={`${id}-notice`}>{l('Notice', 'Заметить')}</h3>
              </div>
              {labels.map(([key, label]) => (
                <label key={key} className="review-workspace-field">
                  <span>{label}</span>
                  <textarea
                    rows={key === 'theme' ? 1 : 3}
                    maxLength={2200}
                    value={review[key]}
                    onChange={(event) => patch({ [key]: event.target.value })}
                    placeholder={l('A few words are enough…', 'Достаточно нескольких слов…')}
                  />
                </label>
              ))}
            </section>
            <section aria-labelledby={`${id}-clear`}>
              <div className="review-workspace-section-title">
                <span>02</span>
                <h3 id={`${id}-clear`}>{l('Clear', 'Разобраться')}</h3>
              </div>
              {[
                l('Look through Next, Waiting and Someday', 'Посмотреть Next, Waiting и Someday'),
                l(
                  'Give each active project one clear next action',
                  'Выбрать следующий шаг для активных проектов'
                ),
                l(
                  'Decide what to keep, postpone or let go',
                  'Решить, что оставить, отложить или отпустить'
                ),
              ].map((label, index) => (
                <label key={label} className="review-workspace-check">
                  <input
                    type="checkbox"
                    checked={review.clear[index]}
                    onChange={(event) =>
                      patch({
                        clear: review.clear.map((value, position) =>
                          position === index ? event.target.checked : value
                        ),
                      })
                    }
                  />
                  <span>
                    {review.clearRows[index]?.title &&
                    review.clearRows[index].title !== CLEAR[index]
                      ? review.clearRows[index].title
                      : label}
                  </span>
                </label>
              ))}
            </section>
            <section aria-labelledby={`${id}-choose`}>
              <div className="review-workspace-section-title">
                <span>03</span>
                <h3 id={`${id}-choose`}>{l('Choose', 'Выбрать')}</h3>
              </div>
              {[
                [
                  'outcome',
                  l(
                    'One useful outcome for next week',
                    'Один полезный результат на следующую неделю'
                  ),
                ],
                ['nextStep', l('A small next step', 'Небольшой следующий шаг')],
              ].map(([key, label]) => (
                <label key={key} className="review-workspace-field">
                  <span>{label}</span>
                  <textarea
                    rows={2}
                    maxLength={2200}
                    value={review[key]}
                    onChange={(event) => patch({ [key]: event.target.value })}
                  />
                </label>
              ))}
            </section>
            <section aria-labelledby={`${id}-projects`}>
              <div className="review-workspace-section-title">
                <span>↗</span>
                <h3 id={`${id}-projects`}>{l('Connected projects', 'Связанные проекты')}</h3>
              </div>
              {projects.length ? (
                projects.map((project) => (
                  <label className="review-workspace-check" key={project.id}>
                    <input
                      type="checkbox"
                      checked={review.projectIds.includes(project.id)}
                      onChange={(event) =>
                        patch({
                          projectIds: event.target.checked
                            ? [...review.projectIds, project.id]
                            : review.projectIds.filter((value) => value !== project.id),
                        })
                      }
                    />
                    <span>{project.title}</span>
                  </label>
                ))
              ) : (
                <p>{l('Your projects will appear here.', 'Здесь появятся ваши проекты.')}</p>
              )}
            </section>
          </>
        )}
      </fieldset>
      <footer className="review-workspace-footer">
        <p>
          {l(
            'Preview the changes before saving to your weekly note.',
            'Посмотрите изменения перед сохранением в заметку обзора.'
          )}
        </p>
        <button
          type="submit"
          className="button primary"
          disabled={!writable || busy || serialized === text || serialized.length > 12000}
        >
          {l('Preview changes', 'Посмотреть изменения')} ↗
        </button>
      </footer>
    </form>
  );
}
