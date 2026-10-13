import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  APPLE_CALENDAR_BUFFER,
  APPLE_CALENDAR_TIMEOUT,
  createAppleCalendar,
} from '../lib/apple-calendar.js';

const window = {
  calendarIds: ['selected-calendar'],
  start: '2026-10-07T00:00:00Z',
  end: '2026-10-08T00:00:00Z',
};
test('native calendar never runs on construction, unsupported platforms or empty selection', async () => {
  let calls = 0;
  const runner = async () => {
    calls++;
    throw new Error('must not run');
  };
  const adapter = createAppleCalendar({ platform: 'linux', runner });
  assert.equal(calls, 0);
  assert.equal((await adapter.listCalendars()).supported, false);
  await assert.rejects(adapter.listEvents(window), /only on macOS/);
  assert.deepEqual(
    (
      await createAppleCalendar({ platform: 'darwin', runner }).listEvents({
        ...window,
        calendarIds: [],
      })
    ).events,
    []
  );
  assert.equal(calls, 0);
});
test('native helper has explicit permission APIs and scoped read-only EventKit query', async () => {
  const source = await readFile(
    new URL('../scripts/apple-calendar.swift', import.meta.url),
    'utf8'
  );
  assert.match(source, /requestFullAccessToEvents/);
  assert.match(source, /#available\(macOS 14\.0/);
  assert.match(source, /requestAccess\(to: \.event/);
  assert.match(source, /calendar\(withIdentifier: id\)/);
  assert.match(source, /predicateForEvents\(withStart: start, end: end, calendars: calendars\)/);
  assert.ok(!/store\.(save|remove)\(/.test(source));
});
test('calendar metadata preserves same names; events use selected IDs and bounded JSON argv', async () => {
  const calls = [];
  const id = 'calendar-"; shell\n🌲';
  const adapter = createAppleCalendar({
    platform: 'darwin',
    runner: async (...args) => {
      calls.push(args);
      const input = JSON.parse(args[1][1]);
      return {
        stdout: JSON.stringify(
          input.operation === 'calendars'
            ? {
                calendars: [
                  { id: 'one', title: 'Same' },
                  { id: 'two', title: 'Same' },
                ],
              }
            : {
                events: [
                  {
                    id: 'event-1',
                    calendarId: 'selected-calendar',
                    calendarTitle: 'Same',
                    title: 'Observe',
                    start: '2026-10-07T09:00:00Z',
                    end: '2026-10-07T10:00:00Z',
                    allDay: false,
                    location: 'Outside',
                    editable: true,
                  },
                  {
                    id: 'hidden',
                    calendarId: 'not-selected',
                    title: 'Private',
                    start: '2026-10-07T09:00:00Z',
                    end: '2026-10-07T10:00:00Z',
                  },
                ],
                warnings: [],
              }
        ),
      };
    },
  });
  assert.equal((await adapter.listCalendars()).calendars.length, 2);
  const result = await adapter.listEvents(window);
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].editable, false);
  assert.equal(result.events[0].start, '2026-10-07T09:00:00.000Z');
  const [file, args, options] = calls[1];
  assert.equal(file, '/usr/bin/swift');
  assert.ok(args[0].endsWith('/scripts/apple-calendar.swift'));
  assert.equal(JSON.parse(args[1]).calendarIds[0], 'selected-calendar');
  assert.equal(options.shell, false);
  assert.equal(options.timeout, APPLE_CALENDAR_TIMEOUT);
  assert.equal(options.maxBuffer, APPLE_CALENDAR_BUFFER);
  await assert.rejects(adapter.listEvents({ ...window, calendarIds: [id] }));
});
test('invalid windows and duplicate/oversized selected calendars fail before app access', async () => {
  let calls = 0;
  const adapter = createAppleCalendar({
    platform: 'darwin',
    runner: async () => {
      calls++;
      return { stdout: '{}' };
    },
  });
  for (const input of [
    { ...window, start: '2026-10-07' },
    { ...window, end: '2026-10-15T00:00:00Z' },
    { ...window, end: window.start },
    { ...window, calendarIds: ['same', 'same'] },
    { ...window, calendarIds: Array.from({ length: 11 }, (_, i) => String(i)) },
  ])
    await assert.rejects(adapter.listEvents(input));
  assert.equal(calls, 0);
});
test('seven local calendar days may include the autumn DST extra hour', async () => {
  let called = false;
  const adapter = createAppleCalendar({
    platform: 'darwin',
    runner: async () => {
      called = true;
      return { stdout: JSON.stringify({ events: [], warnings: [] }) };
    },
  });
  await adapter.listEvents({
    ...window,
    start: '2026-10-19T00:00:00+02:00',
    end: '2026-10-26T00:00:00+01:00',
  });
  assert.equal(called, true);
});

test('permission/timeouts and invalid output stay clear without leaking helper stderr', async () => {
  for (const [output, expected] of [
    [{ error: 'permission_denied' }, /Privacy/],
    [{ error: 'permission_timeout' }, /timed out/],
    [{ error: 'PRIVATE arbitrary internal error' }, /could not read/],
  ]) {
    const adapter = createAppleCalendar({
      platform: 'darwin',
      runner: async () => ({ stdout: JSON.stringify(output) }),
    });
    await assert.rejects(adapter.listCalendars(), (error) => {
      assert.match(error.message, expected);
      assert.ok(!error.message.includes('PRIVATE'));
      return true;
    });
  }
  const failed = createAppleCalendar({
    platform: 'darwin',
    runner: async () => {
      throw { stderr: 'PRIVATE raw system error' };
    },
  });
  await assert.rejects(failed.listCalendars(), (error) => !error.message.includes('PRIVATE'));
  const large = createAppleCalendar({
    platform: 'darwin',
    runner: async () => ({ stdout: 'x'.repeat(APPLE_CALENDAR_BUFFER + 1) }),
  });
  await assert.rejects(large.listCalendars(), /oversized/);
});
