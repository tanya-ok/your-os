import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import {
  createProfileStore,
  defaultDashboard,
  defaultProfile,
  validateProfile,
} from '../lib/profile.js';
import { atomicWrite } from '../lib/writer.js';

const bundled = await build({
  stdin: {
    contents: "export {parseReview,serializeReview} from './src/components/ReviewForm.jsx';",
    resolveDir: process.cwd(),
    loader: 'jsx',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  write: false,
  banner: {
    js: `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(join(process.cwd(), 'package.json'))});`,
  },
});
const { parseReview, serializeReview } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);

const source =
  '# Weekly review\n\n## Notice\n\nA cleared shelf helped.\n\n## Private extra\n\nKeep **this** exact text.\n```md\n## Choose\nNot a section!\n```\n\n## Clear\n\n- [x] Look through Next, Waiting and Someday\n- [ ] Give each active project one clear next action\n- [ ] Decide what to keep, postpone or let go\n\n## Choose\n\nOne useful outcome for the coming week: care for a garden.\n\nA small step I can make time for: observe the light.\n\n## Connected projects\n\nRevisit [[Projects/garden|Gardening]] alongside [[Tasks]].\n';

test('review form round-trips unedited source and parses notes, checks, choices and project links', () => {
  const parsed = parseReview(source);
  assert.equal(serializeReview(parsed), source);
  assert.equal(parsed.helped, 'A cleared shelf helped.');
  assert.deepEqual(parsed.clear, [true, false, false]);
  assert.equal(parsed.outcome, 'care for a garden.');
  assert.equal(parsed.nextStep, 'observe the light.');
  assert.deepEqual(parsed.projectIds, ['garden']);
});

test('editing review fields preserves unknown sections and untouched known sections', () => {
  const parsed = parseReview(source);
  const edited = serializeReview({ ...parsed, theme: 'A quieter week' });
  assert.ok(
    edited.includes(
      '## Private extra\n\nKeep **this** exact text.\n```md\n## Choose\nNot a section!\n```\n\n'
    )
  );
  assert.ok(edited.includes('Revisit [[Projects/garden|Gardening]] alongside [[Tasks]].'));
  assert.equal(parseReview(edited).theme, 'A quieter week');
  assert.deepEqual(parseReview(edited).clear, [true, false, false]);
  assert.equal(serializeReview(parseReview(edited)), edited);
});

test('review supports empty template, changed checks, project selection and structured field reload', () => {
  const blank = parseReview('# Weekly review\n\n## Notice\n\n## Clear\n\n## Choose\n');
  const edited = serializeReview({
    ...blank,
    theme: 'Keep room',
    helped: 'Small steps',
    attention: 'Too many plans',
    clear: [true, false, true],
    outcome: 'A useful shelf',
    nextStep: 'Clear a corner',
    projectIds: ['garden', 'human'],
  });
  const parsed = parseReview(edited);
  for (const field of ['theme', 'helped', 'attention', 'outcome', 'nextStep'])
    assert.equal(
      parsed[field],
      {
        theme: 'Keep room',
        helped: 'Small steps',
        attention: 'Too many plans',
        outcome: 'A useful shelf',
        nextStep: 'Clear a corner',
      }[field]
    );
  assert.deepEqual(parsed.clear, [true, false, true]);
  assert.deepEqual(parsed.projectIds, ['garden', 'human']);
});

test('dashboard settings migrate old profiles without changing existing preferences', () => {
  const old = defaultProfile();
  delete old.dashboard;
  old.locale = 'ru';
  old.availableMinutes = 45;
  old.lighting.timezone = 'Europe/Warsaw';
  const migrated = validateProfile(old);
  assert.deepEqual(migrated.dashboard, defaultDashboard());
  assert.equal(migrated.locale, 'ru');
  assert.equal(migrated.availableMinutes, 45);
  assert.equal(migrated.lighting.timezone, 'Europe/Warsaw');
  const withoutShortcuts = { ...migrated, dashboard: { ...migrated.dashboard } };
  delete withoutShortcuts.dashboard.keyboardShortcuts;
  assert.equal(validateProfile(withoutShortcuts).dashboard.keyboardShortcuts, true);
});

test('dashboard validates dates, programme bounds, times and display settings', () => {
  const profile = defaultProfile();
  for (const patch of [
    { homeStartDate: '2026-02-30' },
    { homeStartDate: 'not-a-date' },
    { homeWeeks: 1, homeCurrentWeek: 2 },
    { homeWeeks: 53 },
    { homeCurrentWeek: 0 },
    { focusMinutes: 181 },
    { focusMinutes: 0 },
    { workdayStart: '18:00', workdayEnd: '09:00' },
    { workdayStart: '09:00', workdayEnd: '09:00' },
    { newsLimit: 21 },
    { homeTitle: '' },
    { homeTitle: 'bad\nname' },
    { showNews: 'yes' },
  ])
    assert.throws(
      () => validateProfile({ ...profile, dashboard: { ...profile.dashboard, ...patch } }),
      /Invalid profile settings/
    );
  assert.equal(
    validateProfile({
      ...profile,
      dashboard: {
        ...profile.dashboard,
        homeStartDate: '2028-02-29',
        homeWeeks: 52,
        homeCurrentWeek: 52,
        focusMinutes: 180,
      },
    }).dashboard.homeStartDate,
    '2028-02-29'
  );
});

test('partial dashboard settings merge and persist without resetting profile or sibling fields', async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'personal-os-settings-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root, 'profile.json');
  const old = defaultProfile();
  delete old.dashboard;
  old.locale = 'ru';
  await atomicWrite(path, JSON.stringify(old));
  const store = createProfileStore(path);
  await store.update({ dashboard: { homeTitle: 'A place to return', focusMinutes: 40 } });
  await store.update({ dashboard: { showNews: false, homeWeeks: 4, homeCurrentWeek: 2 } });
  const saved = await createProfileStore(path).read();
  assert.equal(saved.locale, 'ru');
  assert.equal(saved.dashboard.homeTitle, 'A place to return');
  assert.equal(saved.dashboard.focusMinutes, 40);
  assert.equal(saved.dashboard.showCalendar, true);
  assert.equal(saved.dashboard.showNews, false);
  assert.equal(saved.dashboard.homeCurrentWeek, 2);
  await assert.rejects(store.update({ dashboard: { homeWeeks: 1 } }), /Invalid profile settings/);
  assert.equal((await store.read()).dashboard.homeWeeks, 4);
});
