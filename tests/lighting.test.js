/**
 * Lighting tests.
 *
 * Contrast and luminance are re-implemented here on purpose: the point is to
 * check the modules against the WCAG formula, not against their own helpers.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  computeSolarEvents,
  DEFAULT_SCHEDULE,
  PHASE_ORDER,
  PHASES,
  resolveDayPhase,
} from '../src/environment/day-phase.js';
import { interpolateLighting, PHASE_TOKENS } from '../src/environment/lighting-tokens.js';

const HEX = /^#[0-9a-f]{6}$/;
const TOKEN_KEYS = [
  'accent',
  'background',
  'border',
  'brightness',
  'glow',
  'muted',
  'panel',
  'skyBottom',
  'skyTop',
  'text',
  'warmth',
];

function channel(byte) {
  const value = byte / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  assert.ok(match, `expected #rrggbb, got ${hex}`);
  return (
    0.2126 * channel(parseInt(match[1], 16)) +
    0.7152 * channel(parseInt(match[2], 16)) +
    0.0722 * channel(parseInt(match[3], 16))
  );
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function channels(hex) {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

function maxChannelDelta(a, b) {
  const left = channels(a);
  const right = channels(b);
  return Math.max(
    Math.abs(left[0] - right[0]),
    Math.abs(left[1] - right[1]),
    Math.abs(left[2] - right[2])
  );
}

/** A UTC instant at a given minute of 2026-03-10 (no DST anywhere in UTC). */
function utcMinute(minutes) {
  return new Date(Date.UTC(2026, 2, 10, 0, minutes, 0));
}

const UTC_SCHEDULE = { mode: 'schedule', timezone: 'UTC', schedule: DEFAULT_SCHEDULE };

test('exports the six phases and the documented default schedule', () => {
  assert.deepEqual(Object.keys(PHASES).sort(), [
    'day',
    'morning',
    'night',
    'sunrise',
    'sunset',
    'twilight',
  ]);
  assert.equal(PHASE_ORDER.length, 6);
  assert.deepEqual([...PHASE_ORDER].sort(), Object.keys(PHASES).sort());
  assert.deepEqual(DEFAULT_SCHEDULE, {
    wake: '07:00',
    day: '09:00',
    evening: '18:00',
    sleep: '22:30',
  });
});

test('resolveDayPhase returns exactly the contract shape', () => {
  const state = resolveDayPhase(utcMinute(720), UTC_SCHEDULE);
  assert.deepEqual(Object.keys(state).sort(), [
    'nextPhase',
    'phase',
    'progress',
    'reason',
    'source',
  ]);
  assert.equal(state.source, 'schedule');
  assert.equal(state.reason, null);
});

test('schedule mode anchors phases to the configured wall clock', () => {
  const cases = [
    [180, 'night'],
    [375, 'sunrise'],
    [420, 'sunrise'],
    [480, 'morning'],
    [539, 'morning'],
    [540, 'day'],
    [1079, 'day'],
    [1080, 'sunset'],
    [1124, 'sunset'],
    [1125, 'twilight'],
    [1349, 'twilight'],
    [1350, 'night'],
    [1439, 'night'],
  ];
  for (const [minute, expected] of cases) {
    const state = resolveDayPhase(utcMinute(minute), UTC_SCHEDULE);
    assert.equal(state.phase, expected, `minute ${minute}`);
  }
});

test('progress is zero at an anchor and rises inside the phase', () => {
  assert.equal(resolveDayPhase(utcMinute(375), UTC_SCHEDULE).progress, 0);
  assert.equal(resolveDayPhase(utcMinute(540), UTC_SCHEDULE).progress, 0);
  assert.equal(resolveDayPhase(utcMinute(1350), UTC_SCHEDULE).progress, 0);

  const sunrise = resolveDayPhase(utcMinute(375 + 52.5), UTC_SCHEDULE);
  assert.equal(sunrise.phase, 'sunrise');
  assert.ok(Math.abs(sunrise.progress - 0.5) < 0.01, `got ${sunrise.progress}`);

  const sunset = resolveDayPhase(utcMinute(1080 + 10), UTC_SCHEDULE);
  assert.equal(sunset.phase, 'sunset');
  assert.ok(Math.abs(sunset.progress - 10 / 45) < 0.01, `got ${sunset.progress}`);
});

test('nextPhase follows the circular order', () => {
  assert.equal(resolveDayPhase(utcMinute(720), UTC_SCHEDULE).nextPhase, 'sunset');
  assert.equal(resolveDayPhase(utcMinute(1400), UTC_SCHEDULE).nextPhase, 'sunrise');
  assert.equal(resolveDayPhase(utcMinute(400), UTC_SCHEDULE).nextPhase, 'morning');
});

test('a full day covers the circle once, in order, with progress in [0,1)', () => {
  const transitions = [];
  let previous = null;
  for (let minute = 0; minute < 1440; minute += 1) {
    const state = resolveDayPhase(utcMinute(minute), UTC_SCHEDULE);
    assert.ok(PHASE_ORDER.includes(state.phase), `minute ${minute}: ${state.phase}`);
    assert.ok(state.progress >= 0 && state.progress < 1, `minute ${minute}: ${state.progress}`);
    if (state.phase !== previous) {
      transitions.push([minute, state.phase]);
      previous = state.phase;
    }
  }
  assert.deepEqual(transitions, [
    [0, 'night'],
    [375, 'sunrise'],
    [480, 'morning'],
    [540, 'day'],
    [1080, 'sunset'],
    [1125, 'twilight'],
    [1350, 'night'],
  ]);
});

test('schedule mode reads wall time in the configured zone, DST included', () => {
  const instant = new Date('2026-06-15T11:00:00Z');
  assert.equal(resolveDayPhase(instant, UTC_SCHEDULE).phase, 'day');
  assert.equal(
    resolveDayPhase(instant, { mode: 'schedule', timezone: 'America/New_York' }).phase,
    'sunrise'
  );

  // Same UTC wall time, different offset: EST -> sunrise, EDT -> morning.
  const winter = resolveDayPhase(new Date('2026-01-15T12:30:00Z'), {
    mode: 'schedule',
    timezone: 'America/New_York',
  });
  const summer = resolveDayPhase(new Date('2026-06-15T12:30:00Z'), {
    mode: 'schedule',
    timezone: 'America/New_York',
  });
  assert.equal(winter.phase, 'sunrise');
  assert.equal(summer.phase, 'morning');
});

test('an unknown timezone falls back to UTC and says so', () => {
  const state = resolveDayPhase(utcMinute(420), {
    mode: 'schedule',
    timezone: 'Mars/Olympus_Mons',
  });
  assert.equal(state.source, 'schedule');
  assert.match(state.reason, /Mars\/Olympus_Mons/);
  assert.match(state.reason, /UTC/);
  assert.equal(state.phase, resolveDayPhase(utcMinute(420), UTC_SCHEDULE).phase);
});

test('manual mode pins the phase and ignores the clock', () => {
  const morning = resolveDayPhase(utcMinute(60), { mode: 'manual', manualPhase: 'morning' });
  assert.equal(morning.phase, 'morning');
  assert.equal(morning.nextPhase, 'day');
  assert.equal(morning.progress, 0);
  assert.equal(morning.source, 'manual');
  assert.equal(morning.reason, null);

  const later = resolveDayPhase(utcMinute(1300), { mode: 'manual', manualPhase: 'morning' });
  assert.deepEqual(later, morning);

  const bogus = resolveDayPhase(utcMinute(60), { mode: 'manual', manualPhase: 'noon' });
  assert.equal(bogus.phase, 'day');
  assert.match(bogus.reason, /noon/);
});

test('system mode uses systemDark when supplied, manualPhase otherwise', () => {
  const dark = resolveDayPhase(utcMinute(720), { mode: 'system', systemDark: true });
  assert.equal(dark.phase, 'night');
  assert.equal(dark.source, 'system');

  const light = resolveDayPhase(utcMinute(60), { mode: 'system', systemDark: false });
  assert.equal(light.phase, 'day');
  assert.equal(light.source, 'system');

  const unknown = resolveDayPhase(utcMinute(60), { mode: 'system', manualPhase: 'twilight' });
  assert.equal(unknown.phase, 'twilight');
  assert.equal(unknown.source, 'system');
  assert.match(unknown.reason, /prefers-color-scheme/);
});

test('solar mode needs explicit coordinates and otherwise falls back', () => {
  const missing = resolveDayPhase(utcMinute(720), { mode: 'solar', coordinates: null });
  assert.equal(missing.source, 'fallback');
  assert.match(missing.reason, /coordinates/);
  assert.equal(missing.phase, resolveDayPhase(utcMinute(720), UTC_SCHEDULE).phase);

  const invalid = resolveDayPhase(utcMinute(720), {
    mode: 'solar',
    coordinates: { latitude: 120, longitude: 0 },
  });
  assert.equal(invalid.source, 'fallback');
});

test('solar mode tracks the sun at mid latitude', () => {
  const options = {
    mode: 'solar',
    timezone: 'America/New_York',
    coordinates: { latitude: 40.7128, longitude: -74.006 },
  };
  const dawn = resolveDayPhase(new Date('2026-06-15T10:00:00Z'), options);
  const noon = resolveDayPhase(new Date('2026-06-15T16:30:00Z'), options);
  const dusk = resolveDayPhase(new Date('2026-06-16T01:00:00Z'), options);

  assert.equal(dawn.source, 'solar');
  assert.equal(dawn.phase, 'sunrise');
  assert.equal(noon.source, 'solar');
  assert.equal(noon.phase, 'day');
  assert.equal(dusk.source, 'solar');
  assert.equal(dusk.phase, 'twilight');
  assert.equal(noon.reason, null);
});

test('polar day and polar night fall back to the schedule', () => {
  const svalbard = { latitude: 78.22, longitude: 15.65 };

  const summer = resolveDayPhase(new Date('2026-06-21T12:00:00Z'), {
    mode: 'solar',
    timezone: 'UTC',
    coordinates: svalbard,
  });
  assert.equal(summer.source, 'fallback');
  assert.match(summer.reason, /polar day|sunrise\/sunset/);

  const winter = resolveDayPhase(new Date('2026-12-21T12:00:00Z'), {
    mode: 'solar',
    timezone: 'UTC',
    coordinates: svalbard,
  });
  assert.equal(winter.source, 'fallback');
  assert.equal(winter.phase, resolveDayPhase(new Date('2026-12-21T12:00:00Z'), UTC_SCHEDULE).phase);
});

test('computeSolarEvents matches published solstice times within minutes', () => {
  const events = computeSolarEvents(new Date('2026-06-21T12:00:00Z'), {
    latitude: 51.5074,
    longitude: -0.1278,
  });
  const expectedSunrise = Date.UTC(2026, 5, 21, 3, 43);
  const expectedSunset = Date.UTC(2026, 5, 21, 20, 21);

  assert.equal(events.polar, null);
  assert.ok(
    Math.abs(events.sunriseUTC.getTime() - expectedSunrise) < 6 * 60 * 1000,
    `sunrise ${events.sunriseUTC.toISOString()}`
  );
  assert.ok(
    Math.abs(events.sunsetUTC.getTime() - expectedSunset) < 6 * 60 * 1000,
    `sunset ${events.sunsetUTC.toISOString()}`
  );
  assert.ok(events.sunriseUTC < events.solarNoonUTC);
  assert.ok(events.solarNoonUTC < events.sunsetUTC);
  assert.ok(Math.abs(events.dayLengthMinutes - 998) < 12, `day length ${events.dayLengthMinutes}`);
});

test('polar coordinates report no rise or set instead of guessing', () => {
  const summer = computeSolarEvents(
    { year: 2026, month: 6, day: 21 },
    {
      latitude: 85,
      longitude: 0,
    }
  );
  assert.equal(summer.sunriseUTC, null);
  assert.equal(summer.sunsetUTC, null);
  assert.equal(summer.polar, 'day');

  const winter = computeSolarEvents(
    { year: 2026, month: 12, day: 21 },
    {
      latitude: 85,
      longitude: 0,
    }
  );
  assert.equal(winter.polar, 'night');
});

test('a contradictory schedule still yields a valid, ordered day', () => {
  const options = {
    mode: 'schedule',
    timezone: 'UTC',
    schedule: { wake: '07:00', day: '06:00', evening: '05:00', sleep: '04:00' },
  };
  const first = resolveDayPhase(utcMinute(0), options);
  assert.match(first.reason, /adjusted/);

  for (let minute = 0; minute < 1440; minute += 1) {
    const state = resolveDayPhase(utcMinute(minute), options);
    assert.ok(PHASE_ORDER.includes(state.phase), `minute ${minute}`);
    assert.ok(PHASE_ORDER.includes(state.nextPhase), `minute ${minute}`);
    assert.ok(state.progress >= 0 && state.progress < 1, `minute ${minute}`);
  }
});

test('bad inputs degrade instead of throwing', () => {
  const unknownMode = resolveDayPhase(utcMinute(720), { mode: 'disco' });
  assert.equal(unknownMode.source, 'fallback');
  assert.match(unknownMode.reason, /disco/);

  const badSchedule = resolveDayPhase(utcMinute(720), {
    mode: 'schedule',
    timezone: 'UTC',
    schedule: { wake: '7am', day: '09:00', evening: '18:00', sleep: '22:30' },
  });
  assert.equal(badSchedule.phase, 'day');
  assert.match(badSchedule.reason, /schedule.wake/);

  const badDate = resolveDayPhase('not a date', UTC_SCHEDULE);
  assert.ok(PHASE_ORDER.includes(badDate.phase));
  assert.match(badDate.reason, /invalid date/);

  assert.doesNotThrow(() => resolveDayPhase(utcMinute(1), null));
});

test('resolveDayPhase is deterministic', () => {
  const options = {
    mode: 'solar',
    timezone: 'Europe/Lisbon',
    coordinates: { latitude: 38.72, longitude: -9.14 },
  };
  const instant = new Date('2026-09-23T07:00:00Z');
  assert.deepEqual(resolveDayPhase(instant, options), resolveDayPhase(instant, options));
});

test('every base palette carries the full token set and readable text', () => {
  for (const phase of PHASE_ORDER) {
    const palette = PHASE_TOKENS[phase];
    assert.deepEqual(Object.keys(palette).sort(), TOKEN_KEYS, phase);
    for (const key of TOKEN_KEYS) {
      const value = palette[key];
      if (typeof value === 'number') {
        assert.ok(value >= 0 && value <= 1, `${phase}.${key} = ${value}`);
      } else {
        assert.match(value, HEX, `${phase}.${key}`);
      }
    }
    assert.ok(contrast(palette.text, palette.background) >= 4.5, `${phase} text/background`);
    assert.ok(contrast(palette.text, palette.panel) >= 4.5, `${phase} text/panel`);
    assert.ok(contrast(palette.muted, palette.background) >= 4.5, `${phase} muted/background`);
    assert.ok(contrast(palette.muted, palette.panel) >= 4.5, `${phase} muted/panel`);
  }
});

test('ocean workspace stays light through every phase and transition', () => {
  for (const phase of PHASE_ORDER) {
    for (const nextPhase of PHASE_ORDER) {
      for (const progress of [0, 0.7, 0.8, 0.9, 1]) {
        for (const highContrast of [false, true]) {
          const tokens = interpolateLighting({ phase, nextPhase, progress }, { highContrast });
          assert.ok(
            luminance(tokens.background) >= 0.7,
            `${phase}->${nextPhase}: page stays light`
          );
          assert.ok(luminance(tokens.panel) >= 0.85, `${phase}->${nextPhase}: panel stays light`);
          assert.ok(
            luminance(tokens.text) < 0.1,
            `${phase}->${nextPhase}: dark ink on light ocean`
          );
        }
      }
    }
  }
});

test('interpolateLighting returns the full token set in the right shape', () => {
  const tokens = interpolateLighting({ phase: 'sunset', nextPhase: 'twilight', progress: 0.8 });
  assert.deepEqual(Object.keys(tokens).sort(), TOKEN_KEYS);
  for (const key of TOKEN_KEYS) {
    const value = tokens[key];
    if (typeof value === 'number') {
      assert.ok(value >= 0 && value <= 1, `${key} = ${value}`);
    } else {
      assert.match(value, HEX, key);
    }
  }
});

test('progress 0 renders the phase palette untouched', () => {
  for (const phase of PHASE_ORDER) {
    const tokens = interpolateLighting({ phase, progress: 0 });
    assert.equal(tokens.skyTop, PHASE_TOKENS[phase].skyTop, phase);
    assert.equal(tokens.skyBottom, PHASE_TOKENS[phase].skyBottom, phase);
    assert.equal(tokens.background, PHASE_TOKENS[phase].background, phase);
    assert.equal(tokens.warmth, PHASE_TOKENS[phase].warmth, phase);
  }
});

test('the phases are visually distinct from each other', () => {
  for (let index = 0; index < PHASE_ORDER.length; index += 1) {
    const current = interpolateLighting({ phase: PHASE_ORDER[index], progress: 0 });
    const next = interpolateLighting({
      phase: PHASE_ORDER[(index + 1) % PHASE_ORDER.length],
      progress: 0,
    });
    assert.ok(
      maxChannelDelta(current.skyBottom, next.skyBottom) >= 24 ||
        maxChannelDelta(current.background, next.background) >= 24,
      `${PHASE_ORDER[index]} is too close to its neighbour`
    );
  }
});

test('text and muted hold 4.5:1 across every phase, pair and progress', () => {
  for (const phase of PHASE_ORDER) {
    for (const nextPhase of PHASE_ORDER) {
      for (let step = 0; step < 20; step += 1) {
        const progress = step / 20;
        const tokens = interpolateLighting({ phase, nextPhase, progress });
        const where = `${phase}->${nextPhase}@${progress}`;
        assert.ok(contrast(tokens.text, tokens.background) >= 4.5, `${where} text/background`);
        assert.ok(contrast(tokens.text, tokens.panel) >= 4.5, `${where} text/panel`);
        assert.ok(contrast(tokens.muted, tokens.background) >= 4.5, `${where} muted/background`);
        assert.ok(contrast(tokens.muted, tokens.panel) >= 4.5, `${where} muted/panel`);
        assert.ok(contrast(tokens.accent, tokens.background) >= 4.5, `${where} accent/background`);
        assert.ok(contrast(tokens.accent, tokens.panel) >= 4.5, `${where} action label/panel`);
      }
    }
  }
});

test('highContrast strengthens the guarantee to 7:1', () => {
  for (const phase of PHASE_ORDER) {
    for (const nextPhase of PHASE_ORDER) {
      for (let step = 0; step < 10; step += 1) {
        const progress = step / 10;
        const plain = interpolateLighting({ phase, nextPhase, progress });
        const strong = interpolateLighting({ phase, nextPhase, progress }, { highContrast: true });
        const where = `${phase}->${nextPhase}@${progress}`;
        assert.ok(contrast(strong.text, strong.background) >= 7, `${where} text/background`);
        assert.ok(contrast(strong.text, strong.panel) >= 7, `${where} text/panel`);
        assert.ok(contrast(strong.muted, strong.background) >= 7, `${where} muted/background`);
        assert.ok(contrast(strong.border, strong.background) >= 3, `${where} border/background`);
        assert.ok(
          contrast(strong.text, strong.background) >= contrast(plain.text, plain.background) - 1e-9,
          `${where} should not weaken`
        );
      }
    }
  }
});

test('the scene changes smoothly minute by minute over a whole day', () => {
  let previous = null;
  let inkFlips = 0;
  for (let minute = 0; minute <= 1440; minute += 1) {
    const state = resolveDayPhase(utcMinute(minute % 1440), UTC_SCHEDULE);
    const tokens = interpolateLighting(state);
    assert.ok(contrast(tokens.text, tokens.background) >= 4.5, `minute ${minute} text`);
    assert.ok(contrast(tokens.muted, tokens.panel) >= 4.5, `minute ${minute} muted`);
    if (previous) {
      assert.ok(
        maxChannelDelta(previous.skyTop, tokens.skyTop) <= 28,
        `skyTop jumped at minute ${minute}`
      );
      assert.ok(
        maxChannelDelta(previous.skyBottom, tokens.skyBottom) <= 28,
        `skyBottom jumped at minute ${minute}`
      );
      assert.ok(
        Math.abs(previous.warmth - tokens.warmth) <= 0.1,
        `warmth jumped at minute ${minute}`
      );
      assert.ok(
        Math.abs(previous.brightness - tokens.brightness) <= 0.1,
        `brightness jumped at minute ${minute}`
      );
      if (luminance(previous.text) >= 0.5 !== luminance(tokens.text) >= 0.5) inkFlips += 1;
    }
    previous = tokens;
  }
  // One flip per dark/light crossing: sunrise -> morning and sunset -> twilight.
  assert.ok(inkFlips <= 2, `ink flipped ${inkFlips} times in a day`);
});

test('the end of a phase has already arrived at the next palette', () => {
  for (let index = 0; index < PHASE_ORDER.length; index += 1) {
    const phase = PHASE_ORDER[index];
    const nextPhase = PHASE_ORDER[(index + 1) % PHASE_ORDER.length];
    const ending = interpolateLighting({ phase, nextPhase, progress: 0.9999 });
    const starting = interpolateLighting({ phase: nextPhase, progress: 0 });
    assert.ok(
      maxChannelDelta(ending.skyBottom, starting.skyBottom) <= 2,
      `${phase} -> ${nextPhase} is not continuous`
    );
    assert.ok(Math.abs(ending.warmth - starting.warmth) <= 0.01, `${phase} -> ${nextPhase} warmth`);
  }
});

test('interpolateLighting survives junk and is deterministic', () => {
  const fallback = interpolateLighting({ phase: 'cheese', progress: Number.NaN });
  assert.equal(fallback.background, PHASE_TOKENS.day.background);

  assert.deepEqual(
    interpolateLighting(undefined),
    interpolateLighting({ phase: 'day', progress: 0 })
  );
  assert.deepEqual(
    interpolateLighting('night'),
    interpolateLighting({ phase: 'night', progress: 0 })
  );
  assert.deepEqual(
    interpolateLighting({ phase: 'day', progress: 2 }),
    interpolateLighting({ phase: 'day', progress: 1 })
  );

  const once = interpolateLighting({ phase: 'twilight', nextPhase: 'night', progress: 0.72 });
  const twice = interpolateLighting({ phase: 'twilight', nextPhase: 'night', progress: 0.72 });
  assert.deepEqual(once, twice);
});

test('a resolved state flows straight into tokens for every mode', () => {
  const modes = [
    { mode: 'schedule', timezone: 'Europe/Berlin' },
    { mode: 'manual', manualPhase: 'sunset' },
    { mode: 'system', systemDark: true },
    { mode: 'solar', timezone: 'Europe/Berlin', coordinates: { latitude: 52.52, longitude: 13.4 } },
    { mode: 'solar', timezone: 'Europe/Berlin', coordinates: null },
  ];
  for (const options of modes) {
    const state = resolveDayPhase(new Date('2026-04-02T17:20:00Z'), options);
    const tokens = interpolateLighting(state, { highContrast: false });
    assert.deepEqual(Object.keys(tokens).sort(), TOKEN_KEYS, options.mode);
    assert.ok(contrast(tokens.text, tokens.background) >= 4.5, options.mode);
  }
});
