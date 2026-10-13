import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import Journal,{sleepNightMinutes,createSleepExamples,normalizeSleepNight,normalizeSleepEntries,sleepObservationInput} from './src/components/SleepJournal.jsx';export {sleepNightMinutes,createSleepExamples,normalizeSleepNight,normalizeSleepEntries,sleepObservationInput};export const render=props=>renderToStaticMarkup(React.createElement(Journal,props));`,
    loader: 'jsx',
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  jsx: 'automatic',
  write: false,
  banner: {
    js: `import {createRequire} from 'node:module';const require=createRequire(${JSON.stringify(`${process.cwd()}/package.json`)});`,
  },
});
const {
  sleepNightMinutes,
  createSleepExamples,
  normalizeSleepNight,
  normalizeSleepEntries,
  sleepObservationInput,
  render,
} = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`
);

test('sleep interval counts bedtime to next-day wake-up across midnight and New Year', () => {
  assert.equal(
    sleepNightMinutes({ date: '2026-12-31', bedtime: '23:30', wake: '07:00', timezone: 'UTC' }),
    450
  );
  assert.equal(
    sleepNightMinutes({
      date: '2026-10-07',
      bedtime: '13:00',
      wake: '14:15',
      wakeNextDay: false,
      timezone: 'UTC',
    }),
    75
  );
});

test('sleep interval uses actual elapsed time through spring and autumn clock changes', () => {
  assert.equal(
    sleepNightMinutes({
      date: '2026-03-28',
      bedtime: '23:00',
      wake: '07:00',
      timezone: 'Europe/Warsaw',
    }),
    420
  );
  assert.equal(
    sleepNightMinutes({
      date: '2026-10-24',
      bedtime: '23:00',
      wake: '07:00',
      timezone: 'Europe/Warsaw',
    }),
    540
  );
});

test('sleep rejects reversed, zero, impossible and clock-gap times', () => {
  assert.throws(
    () =>
      sleepNightMinutes({
        date: '2026-10-07',
        bedtime: '23:00',
        wake: '07:00',
        wakeNextDay: false,
      }),
    /must be positive/
  );
  assert.throws(
    () =>
      sleepNightMinutes({
        date: '2026-10-07',
        bedtime: '07:00',
        wake: '07:00',
        wakeNextDay: false,
      }),
    /must be positive/
  );
  assert.throws(
    () => sleepNightMinutes({ date: '2026-02-30', bedtime: '23:00', wake: '07:00' }),
    /Invalid date/
  );
  assert.throws(
    () =>
      sleepNightMinutes({
        date: '2026-03-29',
        bedtime: '02:30',
        wake: '07:00',
        wakeNextDay: false,
        timezone: 'Europe/Warsaw',
      }),
    /does not exist/
  );
});

test('fictional examples keep intervals, restfulness and optional manual disruptions separate', () => {
  const examples = createSleepExamples('2027-01-01');
  assert.equal(examples.length, 2);
  assert.equal(new Set(examples.map((entry) => entry.date)).size, 2);
  assert.ok(
    examples.every((entry) => entry.example && entry.restfulness >= 1 && entry.restfulness <= 5)
  );
  assert.deepEqual(
    examples.map((entry) => entry.awakenings),
    [1, 2]
  );
  assert.deepEqual(
    examples.map((entry) => entry.nightmares),
    ['no', 'yes']
  );
  assert.ok(examples.every((entry) => sleepNightMinutes({ ...entry, timezone: 'UTC' }) > 0));
  assert.equal(JSON.stringify(examples).includes('dream'), false);
});

test('legacy normalization preserves every recorded night and its existing interval and restfulness', () => {
  const legacy = [
    {
      id: 'old-night',
      date: '2026-10-24',
      bedtime: '23:00',
      wake: '07:00',
      wakeNextDay: true,
      restfulness: 5,
      recall: 'clear',
      dream: 'LEGACY STORY MUST NOT SURFACE',
      tags: ['nightmare'],
      example: false,
    },
    {
      id: 'old-nap',
      date: '2026-10-25',
      bedtime: '14:00',
      wake: '14:30',
      wakeNextDay: false,
      restfulness: 2,
      recall: 'none',
      dream: '',
      tags: [],
    },
  ];
  const before = structuredClone(legacy);
  const migrated = normalizeSleepEntries(legacy);
  assert.equal(migrated.length, legacy.length);
  assert.deepEqual(legacy, before, 'normalization does not mutate the persisted input');
  for (const [index, entry] of migrated.entries()) {
    for (const key of ['id', 'date', 'bedtime', 'wake', 'wakeNextDay', 'restfulness'])
      assert.equal(entry[key], legacy[index][key]);
    assert.equal(
      sleepNightMinutes({ ...entry, timezone: 'Europe/Warsaw' }),
      sleepNightMinutes({ ...legacy[index], timezone: 'Europe/Warsaw' })
    );
    assert.equal(entry.difficultyFallingAsleep, 'not-recorded');
    assert.equal(entry.difficultyWakingUp, 'not-recorded');
    assert.equal(entry.awakenings, null);
    assert.equal(
      entry.nightmares,
      'not-recorded',
      'old text/tags never imply a nightmare observation'
    );
    for (const key of ['recall', 'dream', 'tags']) assert.equal(key in entry, false);
  }
  assert.equal(JSON.stringify(migrated).includes('LEGACY STORY'), false);
  assert.deepEqual(normalizeSleepEntries(migrated), migrated, 'migration is idempotent');
});

test('normalizing a legacy edit draft removes all obsolete fields while preserving new manual observations', () => {
  const migrated = normalizeSleepNight({
    id: 'draft',
    date: '2026-10-07',
    bedtime: '22:30',
    wake: '06:30',
    wakeNextDay: true,
    restfulness: 4,
    dream: { en: 'OLD STORY', ru: 'OLD STORY' },
    recall: 'clear',
    tags: ['old'],
    dreamRecall: 'clear',
    dreamStory: 'OLD STORY',
    dreamTags: ['old'],
    difficultyFallingAsleep: 'yes',
    difficultyWakingUp: 'no',
    awakenings: 0,
    nightmares: 'no',
  });
  assert.equal(migrated.id, 'draft');
  assert.equal(migrated.restfulness, 4);
  assert.equal(migrated.difficultyFallingAsleep, 'yes');
  assert.equal(migrated.difficultyWakingUp, 'no');
  assert.equal(migrated.awakenings, 0);
  assert.equal(migrated.nightmares, 'no');
  assert.doesNotMatch(JSON.stringify(migrated), /dream|recall|tags|OLD STORY/);
});

test('manual observation validation distinguishes an unrecorded count from zero and rejects invalid counts', () => {
  const input = {
    difficultyFallingAsleep: 'not-recorded',
    difficultyWakingUp: 'not-recorded',
    awakenings: '',
    nightmares: 'not-recorded',
  };
  assert.equal(sleepObservationInput(input).awakenings, null);
  assert.equal(
    sleepObservationInput({ ...input, difficultyWakingUp: 'yes' }).difficultyWakingUp,
    'yes'
  );
  assert.throws(
    () => sleepObservationInput({ ...input, difficultyWakingUp: 'inferred' }),
    /manual/
  );
  assert.equal(sleepObservationInput({ ...input, awakenings: null }).awakenings, null);
  assert.equal(sleepObservationInput({ ...input, awakenings: '0' }).awakenings, 0);
  assert.equal(sleepObservationInput({ ...input, awakenings: 30 }).awakenings, 30);
  for (const awakenings of [-1, 31, 1.5, 'several', Infinity, true, [], {}, ' ', '1e1'])
    assert.throws(() => sleepObservationInput({ ...input, awakenings }), /whole number/);
  assert.throws(() => sleepObservationInput({ ...input, nightmares: 'interpreted' }), /manual/);
  assert.throws(
    () => sleepObservationInput({ ...input, difficultyFallingAsleep: 'inferred' }),
    /manual/
  );
});

test('Sleep renders manual sleep observations and history in both languages without dream stories or recall', () => {
  for (const locale of ['en', 'ru']) {
    const html = render({ locale, timezone: 'UTC' });
    assert.ok(html.includes('class="sleep-journal-night"'));
    assert.ok(html.includes('class="sleep-journal-observations"'));
    assert.ok(html.includes('class="sleep-journal-history"'));
    assert.ok(html.includes('type="date"'));
    for (const label of locale === 'en'
      ? [
          'Sleep',
          'Difficulty falling asleep',
          'Difficulty waking up',
          'Awakenings',
          'Nightmares',
          'Restfulness',
        ]
      : ['Сон', 'Трудности с засыпанием', 'Трудно проснуться', 'Пробуждения', 'Кошмары'])
      assert.ok(html.includes(label), `${locale}: missing ${label}`);
    assert.doesNotMatch(html, /dream|recall|сновидени|library with a small greenhouse/i);
    assert.ok(!html.includes('dangerouslySetInnerHTML'));
  }
});
