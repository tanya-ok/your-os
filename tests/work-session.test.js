import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  durationClock,
  EMPTY_WORK_SESSION,
  sessionMilliseconds,
  sessionTimestamp,
  workSessionReducer,
} from '../src/work-session.js';

test('start/end keep exact timestamps, reject duplicate clicks and retain completed sessions', () => {
  const begin = Date.parse('2026-10-07T09:00:00Z');
  const started = workSessionReducer(EMPTY_WORK_SESSION, { type: 'start', at: begin });
  assert.equal(started.active.startedAt, begin);
  assert.equal(workSessionReducer(started, { type: 'start', at: begin + 1000 }), started);
  const finished = workSessionReducer(started, { type: 'end', at: begin + 3600500 });
  assert.equal(finished.active, null);
  assert.equal(finished.sessions[0].endedAt, begin + 3600500);
  assert.equal(workSessionReducer(finished, { type: 'end', at: begin + 4000000 }), finished);
  const resumed = workSessionReducer(finished, { type: 'start', at: begin + 7200000 });
  assert.equal(resumed.sessions.length, 1);
  assert.notEqual(resumed.active.id, resumed.sessions[0].id);
  assert.equal(sessionMilliseconds(resumed.active, begin + 7260000), 60000);
  assert.equal(sessionMilliseconds(resumed.sessions[0], begin + 7260000), 3600500);
  assert.deepEqual(EMPTY_WORK_SESSION, { active: null, sessions: [] });
});

test('elapsed time spans midnight and both DST changes and freezes at the recorded end', () => {
  for (const [start, end, expected] of [
    ['2026-10-07T23:55:00Z', '2026-10-08T00:10:00Z', '00:15:00'],
    ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', '01:00:00'],
    ['2026-03-29T00:30:00Z', '2026-03-29T01:30:00Z', '01:00:00'],
  ]) {
    const started = workSessionReducer(EMPTY_WORK_SESSION, {
      type: 'start',
      at: Date.parse(start),
    });
    const finished = workSessionReducer(started, { type: 'end', at: Date.parse(end) });
    assert.equal(
      durationClock(sessionMilliseconds(finished.sessions[0], Date.parse(end) + 100000)),
      expected
    );
  }
  assert.equal(durationClock(25 * 3600000 + 61000), '25:01:01');
  assert.equal(durationClock(-1000), '00:00:00');
});

test('invalid or regressing timestamps cannot create negative durations; reset has no persistence', () => {
  assert.equal(workSessionReducer(EMPTY_WORK_SESSION, { type: 'end', at: 1 }), EMPTY_WORK_SESSION);
  assert.equal(
    workSessionReducer(EMPTY_WORK_SESSION, { type: 'start', at: NaN }),
    EMPTY_WORK_SESSION
  );
  const started = workSessionReducer(EMPTY_WORK_SESSION, { type: 'start', at: 10000 });
  assert.equal(sessionMilliseconds(started.active, 9000), 0);
  const finished = workSessionReducer(started, { type: 'end', at: 9000 });
  assert.equal(finished.sessions[0].endedAt, 10000);
  assert.equal(workSessionReducer(finished, { type: 'clear' }), EMPTY_WORK_SESSION);
  assert.equal(sessionMilliseconds(null, 10000), 0);
});

test('session timestamps use the configured timezone with a safe UTC fallback', () => {
  const at = Date.parse('2026-10-07T22:30:00Z');
  assert.match(sessionTimestamp(at, 'en', 'Europe/Warsaw'), /08 Oct.*00:30:00/);
  assert.match(sessionTimestamp(at, 'ru', 'Europe/Warsaw'), /08 окт.*00:30:00/);
  assert.equal(sessionTimestamp(at, 'en', 'invalid'), sessionTimestamp(at));
  assert.equal(sessionTimestamp(null), '-');
});
