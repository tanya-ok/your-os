/**
 * Pure decorative daylight model. Solar events use the NOAA fractional-year
 * equation-of-time/declination approximation and a 90.833 degree zenith.
 * It omits local terrain and atmospheric variation; it is not an ephemeris.
 */
export const PHASE_ORDER = Object.freeze([
  'night',
  'sunrise',
  'morning',
  'day',
  'sunset',
  'twilight',
]);
export const PHASES = Object.freeze(Object.fromEntries(PHASE_ORDER.map((phase) => [phase, phase])));
export const DEFAULT_SCHEDULE = Object.freeze({
  wake: '07:00',
  day: '09:00',
  evening: '18:00',
  sleep: '22:30',
});
const DAY = 1440;
const MINUTE = 60000;
const RAD = Math.PI / 180;
const formatters = new Map();
const modulo = (value) => ((value % DAY) + DAY) % DAY;
const nextPhase = (phase) => PHASE_ORDER[(PHASE_ORDER.indexOf(phase) + 1) % PHASE_ORDER.length];
function describe(value) {
  try {
    return String(value);
  } catch {
    return 'unrecognized value';
  }
}
function validCoordinates(value) {
  return (
    value &&
    typeof value === 'object' &&
    Number.isFinite(value.latitude) &&
    Number.isFinite(value.longitude) &&
    Math.abs(value.latitude) <= 90 &&
    Math.abs(value.longitude) <= 180
  );
}
function asDate(value) {
  try {
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
  } catch {
    return null;
  }
}
function calendarDate(value) {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const { year, month, day } = value;
    if (
      ![year, month, day].every(Number.isInteger) ||
      year < 100 ||
      year > 9999 ||
      month < 1 ||
      month > 12 ||
      day < 1 ||
      day > 31
    )
      return null;
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() + 1 === month &&
      date.getUTCDate() === day
      ? { year, month, day }
      : null;
  }
  const date = asDate(value);
  return date
    ? { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
    : null;
}

/** UTC events for the supplied Gregorian date (month 1..12), or UTC date of a Date. */
export function computeSolarEvents(value, coordinates) {
  const empty = {
    sunriseUTC: null,
    sunsetUTC: null,
    solarNoonUTC: null,
    dayLengthMinutes: 0,
    polar: null,
  };
  try {
    const calendar = calendarDate(value);
    if (!calendar || !validCoordinates(coordinates))
      return { ...empty, reason: 'Invalid solar date or coordinates' };
    const midnight = Date.UTC(calendar.year, calendar.month - 1, calendar.day);
    const dayNumber = Math.floor((midnight - Date.UTC(calendar.year, 0, 1)) / (DAY * MINUTE)) + 1;
    const daysInYear =
      (Date.UTC(calendar.year + 1, 0, 1) - Date.UTC(calendar.year, 0, 1)) / (DAY * MINUTE);
    const gamma = ((2 * Math.PI) / daysInYear) * (dayNumber - 1);
    const equation =
      229.18 *
      (0.000075 +
        0.001868 * Math.cos(gamma) -
        0.032077 * Math.sin(gamma) -
        0.014615 * Math.cos(2 * gamma) -
        0.040849 * Math.sin(2 * gamma));
    const declination =
      0.006918 -
      0.399912 * Math.cos(gamma) +
      0.070257 * Math.sin(gamma) -
      0.006758 * Math.cos(2 * gamma) +
      0.000907 * Math.sin(2 * gamma) -
      0.002697 * Math.cos(3 * gamma) +
      0.00148 * Math.sin(3 * gamma);
    const latitude = coordinates.latitude * RAD;
    const cosine =
      (Math.cos(90.833 * RAD) - Math.sin(latitude) * Math.sin(declination)) /
      (Math.cos(latitude) * Math.cos(declination));
    const noonMinutes = 720 - 4 * coordinates.longitude - equation;
    const solarNoonUTC = new Date(midnight + noonMinutes * MINUTE);
    if (cosine < -1) return { ...empty, solarNoonUTC, dayLengthMinutes: DAY, polar: 'day' };
    if (cosine > 1) return { ...empty, solarNoonUTC, polar: 'night' };
    const halfDayMinutes = (Math.acos(Math.max(-1, Math.min(1, cosine))) / RAD) * 4;
    return {
      sunriseUTC: new Date(midnight + (noonMinutes - halfDayMinutes) * MINUTE),
      sunsetUTC: new Date(midnight + (noonMinutes + halfDayMinutes) * MINUTE),
      solarNoonUTC,
      dayLengthMinutes: 2 * halfDayMinutes,
      polar: null,
    };
  } catch {
    return { ...empty, reason: 'Invalid solar date or coordinates' };
  }
}
function formatter(timezone) {
  if (!formatters.has(timezone)) {
    const value = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    if (formatters.size >= 24) formatters.delete(formatters.keys().next().value);
    formatters.set(timezone, value);
  }
  return formatters.get(timezone);
}
function zoned(date, timezone) {
  const parts = Object.fromEntries(
    formatter(timezone)
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    minutes:
      parts.hour * 60 + parts.minute + parts.second / 60 + date.getUTCMilliseconds() / MINUTE,
  };
}
function scheduleAnchors(schedule, reasons) {
  const minutes = {};
  for (const [key, fallback] of Object.entries(DEFAULT_SCHEDULE)) {
    const value =
      schedule && typeof schedule === 'object' && key in schedule ? schedule[key] : fallback;
    const valid = typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
    if (!valid) reasons.push(`Invalid schedule.${key}; using ${fallback}`);
    const [hour, minute] = (valid ? value : fallback).split(':').map(Number);
    minutes[key] = hour * 60 + minute;
  }
  const anchors = [
    ['sunrise', minutes.wake - 45],
    ['morning', minutes.wake + 60],
    ['day', minutes.day],
    ['sunset', minutes.evening],
    ['twilight', minutes.evening + 45],
    ['night', minutes.sleep],
  ];
  if (!orderedCircle(anchors)) {
    reasons.push('Contradictory schedule adjusted to the default rhythm');
    return scheduleAnchors(DEFAULT_SCHEDULE, []);
  }
  return anchors;
}
function orderedCircle(anchors) {
  let duration = 0;
  for (let index = 0; index < anchors.length; index++) {
    const arc = modulo(anchors[(index + 1) % anchors.length][1] - anchors[index][1]);
    if (arc < 1) return false;
    duration += arc;
  }
  return Math.abs(duration - DAY) < 0.001;
}
function stateAt(minutes, anchors, source, reasons) {
  for (let index = 0; index < anchors.length; index++) {
    const [phase, anchor] = anchors[index];
    const [, following] = anchors[(index + 1) % anchors.length];
    const duration = modulo(following - anchor);
    const elapsed = modulo(minutes - anchor);
    if (elapsed < duration)
      return {
        phase,
        nextPhase: nextPhase(phase),
        progress: elapsed / duration,
        source,
        reason: reasons.length ? reasons.join('; ') : null,
      };
  }
  return {
    phase: 'day',
    nextPhase: 'sunset',
    progress: 0,
    source: 'fallback',
    reason: 'Unable to resolve phase anchors',
  };
}
function pinned(phase, source, reason = null) {
  const valid = PHASE_ORDER.includes(phase);
  return {
    phase: valid ? phase : 'day',
    nextPhase: nextPhase(valid ? phase : 'day'),
    progress: 0,
    source,
    reason: valid
      ? reason
      : `Unknown phase ${describe(phase)}; using day${reason ? `; ${reason}` : ''}`,
  };
}
function resolve(value, input) {
  const options = input && typeof input === 'object' ? input : {};
  const mode = options.mode ?? 'schedule';
  if (mode === 'manual') return pinned(options.manualPhase ?? 'day', 'manual');
  if (mode === 'system') {
    if (typeof options.systemDark === 'boolean')
      return pinned(options.systemDark ? 'night' : 'day', 'system');
    return pinned(
      options.manualPhase ?? 'day',
      'system',
      'No prefers-color-scheme value supplied; using selected phase'
    );
  }
  const reasons = [];
  let date = asDate(value);
  if (!date) {
    date = new Date(0);
    reasons.push('invalid date; using the fixed UTC epoch');
  }
  let timezone = options.timezone ?? 'UTC';
  try {
    formatter(timezone);
  } catch {
    reasons.push(`Invalid timezone ${describe(timezone)}; using UTC`);
    timezone = 'UTC';
  }
  const wall = zoned(date, timezone);
  const schedule = scheduleAnchors(options.schedule, reasons);
  if (mode === 'solar') {
    if (!validCoordinates(options.coordinates)) {
      reasons.push('Solar mode needs valid explicit coordinates; using schedule');
      return stateAt(wall.minutes, schedule, 'fallback', reasons);
    }
    const events = computeSolarEvents(wall, options.coordinates);
    if (events.polar || !events.sunriseUTC || !events.sunsetUTC) {
      reasons.push(
        `No sunrise/sunset${events.polar ? ` (polar ${events.polar})` : ''}; using schedule`
      );
      return stateAt(wall.minutes, schedule, 'fallback', reasons);
    }
    const rise = zoned(events.sunriseUTC, timezone).minutes;
    const noon = zoned(events.solarNoonUTC, timezone).minutes;
    const set = zoned(events.sunsetUTC, timezone).minutes;
    const anchors = [
      ['sunrise', rise - 45],
      ['morning', rise + 60],
      ['day', noon - 120],
      ['sunset', set - 45],
      ['twilight', set + 30],
      ['night', set + 90],
    ];
    if (!orderedCircle(anchors)) {
      reasons.push('Solar phase arcs collapse at this latitude/date; using schedule');
      return stateAt(wall.minutes, schedule, 'fallback', reasons);
    }
    return stateAt(wall.minutes, anchors, 'solar', reasons);
  }
  if (mode !== 'schedule') reasons.push(`Unknown mode ${describe(mode)}; using schedule`);
  return stateAt(wall.minutes, schedule, mode === 'schedule' ? 'schedule' : 'fallback', reasons);
}
/** No browser globals or clock reads. Malformed inputs always produce a usable state. */
export function resolveDayPhase(date, options = {}) {
  try {
    return resolve(date, options);
  } catch {
    return {
      phase: 'day',
      nextPhase: 'sunset',
      progress: 0,
      source: 'fallback',
      reason: 'Invalid lighting inputs; using day',
    };
  }
}
