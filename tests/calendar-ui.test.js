import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';

const bundled = await build({
  stdin: {
    contents: `export {calendarLocalDate,shiftCalendarDate,calendarMonday,calendarWallTimeISO} from './src/components/EditableCalendar.jsx';`,
    resolveDir: process.cwd(),
    loader: 'jsx',
  },
  bundle: true,
  jsx: 'automatic',
  platform: 'node',
  format: 'esm',
  write: false,
});
const helpers = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
);
const { calendarLocalDate, shiftCalendarDate, calendarMonday, calendarWallTimeISO } = helpers;

test('calendar week starts on Monday across month and year boundaries', () => {
  assert.equal(calendarMonday('2027-01-03'), '2026-12-28');
  assert.equal(calendarMonday('2027-01-04'), '2027-01-04');
  assert.equal(shiftCalendarDate('2026-12-28', 7), '2027-01-04');
});

test('calendar dates follow the selected zone at UTC midnight', () => {
  assert.equal(calendarLocalDate('2026-10-07T00:30:00Z', 'America/New_York'), '2026-10-06');
  assert.equal(calendarLocalDate('2026-10-07T23:30:00Z', 'Asia/Tokyo'), '2026-10-08');
});

test('calendar event conversion uses the correct summer, winter and fractional offsets', () => {
  assert.equal(
    calendarWallTimeISO('2026-07-01', '09:00', 'Europe/Warsaw'),
    '2026-07-01T07:00:00.000Z'
  );
  assert.equal(
    calendarWallTimeISO('2026-01-01', '09:00', 'Europe/Warsaw'),
    '2026-01-01T08:00:00.000Z'
  );
  assert.equal(
    calendarWallTimeISO('2026-07-01', '09:00', 'Asia/Kathmandu'),
    '2026-07-01T03:15:00.000Z'
  );
});

test('calendar rejects the spring clock gap and consistently picks the earlier autumn hour', () => {
  assert.throws(
    () => calendarWallTimeISO('2026-03-29', '02:30', 'Europe/Warsaw'),
    /does not exist/
  );
  assert.equal(
    calendarWallTimeISO('2026-10-25', '02:30', 'Europe/Warsaw'),
    '2026-10-25T00:30:00.000Z'
  );
});

test('calendar rejects impossible dates rather than normalizing an event into another day', () => {
  assert.throws(() => calendarWallTimeISO('2026-02-30', '09:00', 'UTC'), /Invalid date/);
  assert.throws(() => calendarWallTimeISO('2026-10-07', '24:00', 'UTC'), /Invalid date/);
});
