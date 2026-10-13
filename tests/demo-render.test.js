import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PHASE_ORDER } from '../src/environment/day-phase.js';
import { NAV_GROUPS } from '../src/navigation.js';

// Bundle React and the renderer together so their hook dispatcher is shared.
// A data URL keeps this check read-only: no generated files or browser globals.
const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: {
    contents:
      "export {renderToStaticMarkup} from 'react-dom/server'; export {createElement} from 'react'; export {default as RhythmGraph,dayPoint,rhythmState,DEMO_ANCHORS} from './src/components/RhythmGraph.jsx'; export {default as DemoPages,MainRhythm,demoWeekDates} from './src/components/DemoPages.jsx';",
    resolveDir: root,
    sourcefile: 'demo-render-entry.jsx',
    loader: 'jsx',
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  jsx: 'automatic',
  banner: {
    js: `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(`${root}package.json`)});`,
  },
});
const {
  renderToStaticMarkup,
  createElement,
  DemoPages,
  MainRhythm,
  demoWeekDates,
  RhythmGraph,
  dayPoint,
  rhythmState,
  DEMO_ANCHORS,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);
const PAGES = [
  'gtd',
  'calendar',
  'home',
  'health',
  'future',
  'career',
  'learning',
  'library',
  'work',
];
const stripTags = (text) =>
  text
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([a-zA-Z][\w-]*)(?:="([^"]*)")?/g)].map((match) => [match[1], match[2] ?? ''])
  );
}
function controls(html) {
  return [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map((match) => match[0]);
}
function assertNamedControls(html, context) {
  const labels = [...html.matchAll(/<label\b[\s\S]*?<\/label>/g)].map((match) => match[0]);
  for (const control of controls(html)) {
    const attrs = attributes(control);
    if (attrs.type === 'hidden') continue;
    const nested = labels.some((label) => label.includes(control) && stripTags(label).length > 0);
    const direct = Boolean(attrs['aria-label'] || attrs['aria-labelledby']);
    const referenced = Boolean(
      attrs.id &&
        labels.some((label) => label.includes(`for="${attrs.id}"`) && stripTags(label).length > 0)
    );
    assert.ok(nested || direct || referenced, `${context}: an input needs an accessible label`);
  }
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    assert.ok(
      attributes(match[1])['aria-label'] || stripTags(match[2]),
      `${context}: a button needs an accessible name`
    );
  }
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of html.matchAll(/aria-labelledby="([^"]+)"/g))
    for (const id of match[1].split(/\s+/))
      assert.ok(ids.has(id), `${context}: missing heading ${id}`);
}
function render(page, locale = 'en', extra = {}) {
  return renderToStaticMarkup(
    createElement(DemoPages, {
      page,
      locale,
      checkIn: { energy: 3, mood: 7 },
      onCheckIn: () => {},
      ...extra,
    })
  );
}

test('all supported demo routes render distinct localized sections with named controls', () => {
  const navigable = new Set(NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id)));
  for (const page of PAGES) assert.ok(navigable.has(page), `${page} is missing from navigation`);
  const perLocale = {};
  for (const locale of ['en', 'ru']) {
    const headings = [];
    perLocale[locale] = {};
    for (const page of PAGES) {
      const html = render(page, locale);
      const firstHeading = html.match(/<h([23])\b[^>]*>([\s\S]*?)<\/h\1>/);
      assert.ok(firstHeading, `${locale}/${page}: missing section heading`);
      assert.equal(/<h1\b/.test(html), false, 'page sections must leave the app its main heading');
      headings.push(stripTags(firstHeading[2]));
      perLocale[locale][page] = headings.at(-1);
      assert.match(
        html,
        /<(?:button|input|select|textarea)\b/,
        `${locale}/${page}: no usable controls`
      );
      assertNamedControls(html, `${locale}/${page}`);
      assert.ok(
        html.includes(
          ['home', 'career', 'learning', 'calendar', 'work', 'health', 'library'].includes(page)
            ? locale === 'ru'
              ? 'Сохраняется локально'
              : 'Saved locally'
            : page === 'library'
              ? locale === 'ru'
                ? 'Демо-полка'
                : 'Demo shelf'
              : locale === 'ru'
                ? 'Пример заметок'
                : 'Sample notes'
        ),
        `${locale}/${page}: disclose fictional data`
      );
      assert.equal(
        html.includes('demo-unmapped'),
        false,
        `${locale}/${page}: a real demo page should not show an unmapped fallback`
      );
    }
    assert.equal(
      new Set(headings).size,
      PAGES.length,
      `${locale}: pages must have distinct content headings`
    );
  }
  for (const page of PAGES.filter((id) => !['learning', 'library'].includes(id)))
    assert.notEqual(perLocale.en[page], perLocale.ru[page], `${page}: localized heading missing`);
  assert.equal(perLocale.en.learning, 'How to be human');
  assert.equal(perLocale.ru.learning, 'How to be human');
});

test('page-specific controls stay on their respective routes instead of generic repeated placeholders', () => {
  for (const locale of ['en', 'ru']) {
    const rendered = Object.fromEntries(PAGES.map((page) => [page, render(page, locale)]));
    const typedControls = { work: 'time', library: 'search', health: 'range' };
    assert.equal(
      render('today', locale),
      '',
      'Today gets its sources from the app, not the Work planning panel'
    );
    for (const [page, type] of Object.entries(typedControls)) {
      assert.ok(
        controls(rendered[page]).some((control) => attributes(control).type === type),
        `${locale}/${page}: missing ${type} control`
      );
      for (const other of PAGES.filter(
        (id) => id !== page && !(type === 'time' && id === 'calendar')
      ))
        assert.equal(
          controls(rendered[other]).some((control) => attributes(control).type === type),
          false,
          `${locale}/${other}: unexpected ${type} feature from ${page}`
        );
    }
    assert.equal(
      [...rendered.calendar.matchAll(/class="editable-calendar-day[ "]/g)].length,
      7,
      'calendar should have seven named day sections'
    );
    assert.match(rendered.career, /role="tablist"/, 'career retains its six-section navigation');
    assert.equal([...rendered.career.matchAll(/role="tab"/g)].length, 6);
    assert.match(rendered.learning, /type="number"/, 'learning sessions retain duration');
    assert.match(rendered.future, /<textarea\b/, 'future should expose its own scratchpad');
    assert.match(
      rendered.gtd,
      /<form\b/,
      'GTD should offer capture rather than only project cards'
    );
    assert.match(rendered.home, /<input\b[^>]*type="checkbox"/, 'home routines should be operable');
  }
});

test('manual check-in values are preserved across all six lighting phases and both languages', () => {
  const checkIn = { energy: 3, mood: 7 };
  let callbackCount = 0;
  for (const locale of ['en', 'ru'])
    for (const phase of PHASE_ORDER) {
      const html = renderToStaticMarkup(
        createElement(MainRhythm, {
          locale,
          phase,
          checkIn,
          onCheckIn: () => {
            callbackCount++;
          },
        })
      );
      assertNamedControls(html, `${locale}/${phase}`);
      const ranges = controls(html)
        .map(attributes)
        .filter((control) => control.type === 'range');
      assert.equal(ranges.length, 2);
      assert.equal(
        ranges.find((control) => control.max === '5').value,
        '3',
        `${phase}: energy must not follow light`
      );
      assert.equal(
        ranges.find((control) => control.max === '10').value,
        '7',
        `${phase}: mood must not follow light`
      );
      assert.equal(
        [...html.matchAll(/aria-pressed="true"/g)].length,
        1,
        'one rhythm selection should be active'
      );
    }
  assert.equal(callbackCount, 0, 'rendering or changing light must not write a check-in');
  assert.deepEqual(checkIn, { energy: 3, mood: 7 });
});

test('learning form communicates useful input bounds and keeps its optional reflection separate', () => {
  const html = render('learning');
  const minutes = controls(html)
    .map(attributes)
    .find((control) => control.type === 'number');
  assert.equal(minutes.min, '1');
  assert.equal(minutes.max, '480');
  assert.ok('required' in minutes);
  const note = controls(html)
    .map(attributes)
    .find((control) => 'textarea' in control);
  assert.equal(note.maxLength || note.maxlength, '1200');
  assert.equal('required' in note, false);
});

test('unknown pages render nothing rather than an unrelated UI placeholder', () => {
  assert.equal(render('unknown'), '');
  assert.equal(render('graph'), '');
  assert.equal(render('setup'), '');
});

test('calendar weeks stay Monday-Sunday across month/year and daylight-saving boundaries', () => {
  const baseline = Date.UTC(2026, 9, 5, 12);
  const day = 24 * 60 * 60 * 1000;
  for (const offset of [-30, -1, 0, 2, 3, 12, 13, 52]) {
    const dates = demoWeekDates(offset);
    assert.equal(dates.length, 7);
    assert.equal(dates[0].getUTCDay(), 1);
    assert.equal(dates[6].getUTCDay(), 0);
    dates.forEach((date, index) => {
      assert.equal(date.getTime(), baseline + (offset * 7 + index) * day);
      assert.equal(date.getUTCHours(), 12, 'synthetic dates use explicit UTC noon');
      if (index) assert.notEqual(date, dates[index - 1], 'days must not alias one mutable Date');
    });
  }
  const mutated = demoWeekDates();
  mutated[0].setUTCDate(1);
  assert.equal(demoWeekDates()[0].getTime(), baseline, 'a caller must not mutate future weeks');
});

test('calendar labels do not drift with the browser or server timezone', () => {
  const prior = process.env.TZ;
  try {
    for (const locale of ['en', 'ru']) {
      const results = ['UTC', 'Pacific/Kiritimati', 'America/Los_Angeles'].map((timezone) => {
        process.env.TZ = timezone;
        return render('calendar', locale);
      });
      assert.equal(results[0], results[1]);
      assert.equal(results[0], results[2]);
      assert.ok(results[0].includes('UTC'), 'fictional calendar discloses its time basis');
    }
  } finally {
    if (prior === undefined) delete process.env.TZ;
    else process.env.TZ = prior;
  }
});

test('day ribbon clamps geometry and has a schematic midday peak', () => {
  assert.deepEqual(dayPoint(-30), dayPoint(0));
  assert.deepEqual(dayPoint(1500), dayPoint(1440));
  assert.deepEqual(dayPoint(NaN), dayPoint(0));
  assert.equal(dayPoint(0).x, 24);
  assert.equal(dayPoint(1440).x, 976);
  assert.equal(dayPoint(720).y, 38);
  for (const anchor of DEMO_ANCHORS) {
    assert.ok(dayPoint(anchor.minute).y >= 38);
    assert.ok(dayPoint(anchor.minute).y <= 117);
  }
});

test('rhythm follows the configured timezone, including midnight and DST boundaries', () => {
  const exact = rhythmState('2026-10-07T12:00:00Z');
  assert.equal(exact.current.id, 'noon');
  assert.equal(exact.next.id, 'afternoon');
  const midnight = rhythmState('2026-10-07T22:00:00Z', 'Europe/Warsaw');
  assert.equal(midnight.time, '00:00');
  assert.equal(midnight.current, null);
  assert.equal(midnight.next.id, 'dawn');
  assert.equal(rhythmState('2026-10-07T23:59:00Z').next, null);
  assert.equal(rhythmState('2026-10-25T00:30:00Z', 'Europe/Warsaw').time, '02:30');
  assert.equal(rhythmState('2026-10-25T01:30:00Z', 'Europe/Warsaw').time, '02:30');
  assert.equal(rhythmState('2026-03-29T00:59:00Z', 'Europe/Warsaw').time, '01:59');
  assert.equal(rhythmState('2026-03-29T01:00:00Z', 'Europe/Warsaw').time, '03:00');
  assert.equal(rhythmState('2026-10-07T14:00:00Z', 'invalid-zone').timezone, 'UTC');
  assert.equal(rhythmState('invalid-date').time, '14:00');
});

test('ribbon keeps anchors and motion controls without unrelated seasonal copy', () => {
  for (const locale of ['en', 'ru']) {
    const props = { locale, instant: '2026-10-07T14:00:00Z', timezone: 'UTC' };
    const moving = renderToStaticMarkup(createElement(RhythmGraph, props));
    const still = renderToStaticMarkup(
      createElement(RhythmGraph, { ...props, motionDisabled: true })
    );
    assertNamedControls(moving, locale);
    assert.match(moving, /data-animated="true"/);
    assert.match(still, /data-animated="false"/);
    assert.match(still, /<button[^>]*disabled=""/);
    assert.equal([...moving.matchAll(/<time>/g)].length, 6);
    assert.doesNotMatch(moving, /72 kō|候|nippon\.com|Moving line|decorative height/);
    assert.match(moving, locale === 'ru' ? /Ритм в течение дня/ : /Rhythm through the day/);
    assert.equal(moving.includes('checkbox'), false);
    assert.equal(moving.includes('Ma ·'), false);
  }
});

test('Work restores independent start/end controls without names or a required project', () => {
  for (const locale of ['en', 'ru']) {
    const html = render('work', locale);
    assertNamedControls(html, locale);
    assert.match(html, /00:00:00/);
    const session = html.match(/<section[^>]*demo-work-session[\s\S]*?<\/section>/)[0];
    assert.equal(
      /project|company|employer|workshop|field-guide|проект|компан|работодател/i.test(
        stripTags(session)
      ),
      false
    );
    assert.match(session, locale === 'ru' ? /Начать работу/ : /Start work/);
    const end = [...session.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].find(
      (match) => stripTags(match[2]) === (locale === 'ru' ? 'Закончить работу' : 'End work')
    );
    assert.ok(end);
    assert.ok('disabled' in attributes(end[1]));
    assert.match(session, locale === 'ru' ? /локально/ : /locally/);
    assert.match(html, /60<span>:<\/span>00/);
  }
});
