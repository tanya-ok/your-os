import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundle = await build({
  stdin: {
    contents:
      "export {renderToStaticMarkup} from 'react-dom/server'; export {createElement} from 'react'; export {default as Home,homeWeekDates,createHomeWeek} from './src/components/HomeWorkspace.jsx'; export {default as Career,CAREER_TABS,careerISOWeek,careerWeekFromMonday} from './src/components/CareerWorkspace.jsx'; export {default as Learning,LEARNING_TABS,learningProgress,learningDay,validateLearningSession} from './src/components/LearningWorkspace.jsx';",
    resolveDir: root,
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
  Home,
  homeWeekDates,
  createHomeWeek,
  Career,
  CAREER_TABS,
  careerISOWeek,
  careerWeekFromMonday,
  Learning,
  LEARNING_TABS,
  learningProgress,
  learningDay,
  validateLearningSession,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

test('Home uses programme weeks with seven local dates, independent tasks, tracker and review', () => {
  assert.deepEqual(homeWeekDates(new Date('2027-01-01T12:00Z'), 'Europe/Warsaw', 3), [
    '2026-12-28',
    '2026-12-29',
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
    '2027-01-03',
  ]);
  assert.equal(homeWeekDates(new Date('2026-10-25T23:30Z'), 'Europe/Warsaw', 3)[0], '2026-10-26');
  assert.equal(homeWeekDates(new Date('2026-10-25T23:30Z'), 'UTC', 3)[0], '2026-10-19');
  assert.equal(homeWeekDates(new Date('2027-01-01T12:00Z'), 'UTC', 4)[0], '2027-01-04');
  const a = createHomeWeek(3),
    b = createHomeWeek(4),
    again = createHomeWeek(3);
  a.tasks[0].done = false;
  a.tracker[0][0] = false;
  a.review.next = 'Leave space';
  assert.equal(again.tasks[0].done, true);
  assert.notDeepEqual(a.tracker, again.tracker);
  assert.equal(b.review.next, '');
  assert.notEqual(a.theme, b.theme);
  for (const locale of ['en', 'ru']) {
    const html = renderToStaticMarkup(
      createElement(Home, { locale, timezone: 'Europe/Warsaw', instant: '2026-10-07T12:00Z' })
    );
    assert.match(html, /home-week-theme/);
    assert.match(html, /home-week-review/);
    assert.equal([...html.matchAll(/type="checkbox"/g)].length, 24);
    assert.match(html, locale === 'ru' ? /Тема недели/ : /Theme of the week/);
  }
});
test('Career keeps ISO week-year through new year and timezone midnight', () => {
  assert.equal(careerISOWeek(new Date('2027-01-01T12:00Z')).key, '2026-W53');
  assert.equal(careerISOWeek(new Date('2027-01-04T00:30Z'), 'America/New_York').key, '2026-W53');
  assert.equal(careerISOWeek(new Date('2027-01-04T00:30Z'), 'UTC').key, '2027-W01');
  assert.equal(careerWeekFromMonday('2026-12-28T00:00Z', 1).key, '2027-W01');
  assert.equal(careerISOWeek(new Date('invalid'), 'invalid').key, '2026-W41');
});
test('Career renders every original section with one selected tab in both languages', () => {
  assert.equal(CAREER_TABS.length, 6);
  for (const locale of ['en', 'ru'])
    for (const [initialTab] of CAREER_TABS) {
      const html = renderToStaticMarkup(createElement(Career, { locale, initialTab }));
      assert.equal([...html.matchAll(/role="tab"/g)].length, 6);
      assert.equal([...html.matchAll(/aria-selected="true"/g)].length, 1);
      assert.equal([...html.matchAll(/role="tabpanel"/g)].length, 1);
      assert.match(html, /Senior IT specialist of everything/);
    }
});
test('Learning progress counts only known unique lessons and handles an empty curriculum', () => {
  assert.deepEqual(learningProgress(['notice', 'notice', 'missing']), learningProgress(['notice']));
  assert.deepEqual(learningProgress([], []), { done: 0, total: 0, percent: 0 });
  assert.equal(learningDay(new Date('2026-10-07T23:30Z'), 'Europe/Warsaw'), 'thu');
  assert.equal(learningDay(new Date('2026-10-07T23:30Z'), 'UTC'), 'wed');
});
test('Learning rejects blank, invalid format and out-of-range sessions before adding a log', () => {
  const valid = { topic: 'Listening', notes: '', duration: 10, format: 'practice' };
  assert.deepEqual(validateLearningSession({ ...valid, topic: '  Listening  ' }), valid);
  for (const change of [
    { topic: ' ' },
    { duration: 0 },
    { duration: 481 },
    { duration: 2.5 },
    { format: 'unknown' },
  ])
    assert.equal(validateLearningSession({ ...valid, ...change }), null);
  assert.equal(
    validateLearningSession({ ...valid, topic: '', notes: 'A quiet pause' }).notes,
    'A quiet pause'
  );
});
test('Learning keeps all five panels mounted with exactly one visible and selected', () => {
  for (const locale of ['en', 'ru'])
    for (const { id: initialTab } of LEARNING_TABS) {
      const html = renderToStaticMarkup(createElement(Learning, { locale, initialTab }));
      assert.equal([...html.matchAll(/role="tab"/g)].length, 5);
      assert.equal([...html.matchAll(/role="tabpanel"/g)].length, 5);
      assert.equal([...html.matchAll(/aria-selected="true"/g)].length, 1);
      const panels = [...html.matchAll(/<section[^>]*role="tabpanel"[^>]*>/g)].map((m) => m[0]);
      assert.equal(panels.filter((p) => !p.includes('hidden')).length, 1);
    }
});
