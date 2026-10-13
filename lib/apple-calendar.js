import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { ApiError } from './config.js';

const execute = promisify(execFile);
export const APPLE_CALENDAR_TIMEOUT = 45000;
export const APPLE_CALENDAR_BUFFER = 512 * 1024;
const helper = fileURLToPath(new URL('../scripts/apple-calendar.swift', import.meta.url));
const clean = (value, max) =>
  typeof value === 'string'
    ? value
        .split('')
        .filter((char) => {
          const n = char.charCodeAt(0);
          return n === 9 || n === 10 || n === 13 || (n >= 32 && n !== 127);
        })
        .join('')
        .trim()
        .slice(0, max)
    : '';
const validId = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 256 &&
  ![...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
function windowInput({ calendarIds, start, end } = {}) {
  if (
    !Array.isArray(calendarIds) ||
    calendarIds.length > 10 ||
    calendarIds.some((id) => !validId(id)) ||
    new Set(calendarIds).size !== calendarIds.length
  )
    throw new ApiError('Choose at most 10 unique calendar IDs');
  const iso = (value) =>
    typeof value === 'string' &&
    value.length <= 40 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value));
  if (
    !iso(start) ||
    !iso(end) ||
    Date.parse(end) <= Date.parse(start) ||
    Date.parse(end) - Date.parse(start) > 7 * 86400000 + 2 * 3600000
  )
    throw new ApiError('Choose an explicit calendar time window of at most seven calendar days');
  return {
    operation: 'events',
    calendarIds,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}
export function createAppleCalendar({ platform = process.platform, runner = execute } = {}) {
  const supported = platform === 'darwin';
  async function run(input) {
    if (!supported) throw new ApiError('Apple Calendar is available only on macOS', 503);
    try {
      const { stdout } = await runner('/usr/bin/swift', [helper, JSON.stringify(input)], {
        timeout: APPLE_CALENDAR_TIMEOUT,
        maxBuffer: APPLE_CALENDAR_BUFFER,
        encoding: 'utf8',
        shell: false,
        killSignal: 'SIGTERM',
      });
      if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > APPLE_CALENDAR_BUFFER)
        throw new ApiError('Apple Calendar returned an oversized response', 502);
      let result;
      try {
        result = JSON.parse(stdout.trim());
      } catch {
        throw new ApiError('Apple Calendar returned an invalid response', 502);
      }
      if (!result || typeof result !== 'object' || Array.isArray(result))
        throw new ApiError('Apple Calendar returned an invalid response', 502);
      if (result.error === 'permission_denied')
        throw new ApiError(
          'Allow calendar access in macOS Privacy & Security > Calendars, then connect again',
          403
        );
      if (result.error === 'permission_timeout')
        throw new ApiError(
          'Apple Calendar permission request timed out; connect again after choosing permission',
          504
        );
      if (result.error)
        throw new ApiError('Apple Calendar could not read the selected time window', 502);
      return result;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (error?.killed || error?.code === 'ETIMEDOUT')
        throw new ApiError('Apple Calendar timed out; no events were changed', 504);
      throw new ApiError(
        'Could not read Apple Calendar; check macOS permission and Swift availability',
        502
      );
    }
  }
  return {
    async listCalendars() {
      if (!supported)
        return {
          supported: false,
          readOnly: true,
          calendars: [],
          message: 'Apple Calendar is available only on macOS',
        };
      const result = await run({ operation: 'calendars' });
      if (!Array.isArray(result.calendars) || result.calendars.length > 1000)
        throw new ApiError('Apple Calendar returned an invalid catalog', 502);
      const seen = new Set();
      return {
        supported: true,
        readOnly: true,
        calendars: result.calendars
          .filter((item) => validId(item?.id) && !seen.has(item.id) && seen.add(item.id))
          .map((item) => ({ id: item.id, title: clean(item.title, 120) || 'Untitled calendar' })),
      };
    },
    async listEvents(input) {
      const selected = windowInput(input);
      if (!supported) throw new ApiError('Apple Calendar is available only on macOS', 503);
      if (!selected.calendarIds.length)
        return { supported: true, readOnly: true, events: [], warnings: [] };
      const result = await run(selected);
      if (!Array.isArray(result.events) || result.events.length > 500)
        throw new ApiError('Apple Calendar returned invalid events', 502);
      const seen = new Set();
      const events = result.events
        .filter(
          (event) =>
            typeof event?.id === 'string' &&
            event.id.length > 0 &&
            event.id.length <= 300 &&
            selected.calendarIds.includes(event.calendarId) &&
            Number.isFinite(Date.parse(event.start)) &&
            Number.isFinite(Date.parse(event.end)) &&
            Date.parse(event.end) >= Date.parse(event.start) &&
            Date.parse(event.start) < Date.parse(selected.end) &&
            Date.parse(event.end) > Date.parse(selected.start) &&
            !seen.has(event.id) &&
            seen.add(event.id)
        )
        .map((event) => ({
          id: clean(event.id, 300),
          calendarId: event.calendarId,
          calendarTitle: clean(event.calendarTitle, 120),
          title: clean(event.title, 500) || 'Untitled event',
          start: new Date(event.start).toISOString(),
          end: new Date(event.end).toISOString(),
          allDay: event.allDay === true,
          location: clean(event.location, 300),
          editable: false,
        }));
      return {
        supported: true,
        readOnly: true,
        events,
        warnings: Array.isArray(result.warnings)
          ? result.warnings.slice(0, 10).map((value) => clean(value, 200))
          : [],
      };
    },
  };
}
