import { randomUUID } from 'node:crypto';
import { lookup as dnsLookup } from 'node:dns/promises';
import { chmodSync, existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs';
import https from 'node:https';
import { isIP } from 'node:net';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ApiError } from './config.js';

export const FEED_LIMIT = 256 * 1024;
const DAY = 86400000;
const MAX_ITEMS = 500;
const clean = (value, length = 300) =>
  String(value || '')
    .split('')
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 || code === 9 || code === 10 || code === 13;
    })
    .join('')
    .trim()
    .slice(0, length);
const fail = (message) => {
  throw new ApiError(message);
};
export function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || b === 2)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    const [firstText, secondText] = lower.split(':');
    const first = Number.parseInt(firstText, 16);
    const second = Number.parseInt(secondText || '0', 16);
    // Only global unicast, excluding documentation, transition and reserved allocations.
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      !(first === 0x2001 && (second < 0x0200 || second === 0x0db8)) &&
      first !== 0x2002 &&
      first !== 0x3fff
    );
  }
  return false;
}
export function validateFeedUrl(value) {
  if (typeof value !== 'string' || value.length > 2048)
    fail('Use an HTTPS feed URL of at most 2048 characters.');
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('Use a valid HTTPS feed URL.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.hash ||
    (url.port && url.port !== '443')
  )
    fail('Use an HTTPS feed URL without credentials, fragments or custom ports.');
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    (!host.includes('.') && !isIP(host)) ||
    (isIP(host) && !isPublicAddress(host))
  )
    fail('Feed address must be public.');
  return url.href;
}
export async function fetchPublicFeed(
  value,
  {
    lookup = dnsLookup,
    request = https.request,
    timeoutMs = 15000,
    accept = 'text/calendar, application/rss+xml, application/atom+xml, application/xml, text/xml',
    contentTypes,
  } = {}
) {
  const url = new URL(validateFeedUrl(value));
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const started = Date.now();
  let lookupTimer;
  let addresses;
  try {
    addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await Promise.race([
          lookup(host, { all: true, verbatim: true }),
          new Promise((_, reject) => {
            lookupTimer = setTimeout(() => reject(new Error('Feed lookup timed out.')), timeoutMs);
          }),
        ]);
  } catch {
    fail('Could not resolve a public feed address.');
  } finally {
    clearTimeout(lookupTimer);
  }
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address)))
    fail('Feed address must be public.');
  const pinned = addresses[0];
  return new Promise((resolve, reject) => {
    let settled = false;
    let req;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      error ? reject(error) : resolve(value);
    };
    const deadline = setTimeout(
      () => {
        finish(new Error('Feed request timed out.'));
        req?.destroy();
      },
      Math.max(1, timeoutMs - (Date.now() - started))
    );
    try {
      req = request(
        url,
        {
          agent: false,
          servername: isIP(host) ? undefined : host,
          headers: {
            Accept: accept,
            'User-Agent': 'Personal-OS-Feed/0.2',
          },
          lookup: (hostname, options, callback) => {
            if (hostname !== host) return callback(new Error('Unexpected feed host.'));
            callback(null, options.all ? [pinned] : pinned.address, pinned.family);
          },
        },
        (response) => {
          if (response.statusCode !== 200) {
            response.resume();
            finish(
              new Error(
                response.statusCode >= 300 && response.statusCode < 400
                  ? 'Feed redirects are not allowed.'
                  : 'Feed returned an unsuccessful response.'
              )
            );
            req.destroy();
            return;
          }
          if (Number(response.headers['content-length']) > FEED_LIMIT) {
            response.resume();
            finish(new Error('Feed exceeds 256 KiB.'));
            req.destroy();
            return;
          }
          if (
            contentTypes &&
            !contentTypes.includes(
              String(response.headers['content-type'] || '')
                .split(';')[0]
                .trim()
                .toLowerCase()
            )
          ) {
            response.resume();
            finish(new Error('Unsupported public page content type.'));
            req.destroy();
            return;
          }
          const chunks = [];
          let bytes = 0;
          response.on('data', (chunk) => {
            bytes += chunk.length;
            if (bytes > FEED_LIMIT) {
              finish(new Error('Feed exceeds 256 KiB.'));
              req.destroy();
            } else chunks.push(chunk);
          });
          response.on('end', () => finish(null, Buffer.concat(chunks).toString('utf8')));
          response.on('error', () => finish(new Error('Could not read feed.')));
        }
      );
      req.on('error', () => finish(new Error('Could not fetch feed.')));
      req.end();
    } catch {
      finish(new Error('Could not fetch feed.'));
    }
  });
}
function decode(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const number =
      entity[1]?.toLowerCase() === 'x'
        ? Number.parseInt(entity.slice(2), 16)
        : Number.parseInt(entity.slice(1), 10);
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
      ? String.fromCodePoint(number)
      : '';
  });
}
function xmlText(value, length = 300) {
  const plain = decode(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' '));
  return clean(plain.replace(/<[^>]*>/g, ' '), length);
}
function safeLink(value) {
  try {
    const url = new URL(decode(value.trim()));
    return url.protocol === 'https:' && !url.username && !url.password && url.href.length <= 2048
      ? url.href
      : '';
  } catch {
    return '';
  }
}
export function parseNewsFeed(body) {
  if (typeof body !== 'string' || Buffer.byteLength(body) > FEED_LIMIT)
    fail('Feed exceeds 256 KiB.');
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(body)) fail('XML document declarations are not supported.');
  if (!/<(?:rss|feed|rdf:RDF)\b/i.test(body)) fail('Use an RSS or Atom feed.');
  const entries = [];
  const get = (xml, name) =>
    xml.match(
      new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${name}\\s*>`, 'i')
    )?.[1] || '';
  for (const match of body.matchAll(/<(item|entry)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) {
    if (entries.length >= MAX_ITEMS) break;
    const item = match[2];
    let url = '';
    for (const link of item.matchAll(/<link\b([^>]*?)\/?\s*>/gi)) {
      const attributes = link[1];
      const rel = attributes.match(/\brel\s*=\s*["']([^"']+)["']/i)?.[1];
      const href = attributes.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
      if (href && (!rel || rel === 'alternate')) {
        url = safeLink(href);
        if (url) break;
      }
    }
    if (!url) url = safeLink(get(item, 'link').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1'));
    const title = xmlText(get(item, 'title'), 300);
    if (!title || !url) continue;
    const rawDate = xmlText(
      get(item, 'pubDate') || get(item, 'published') || get(item, 'updated') || get(item, 'date')
    );
    const parsedDate = new Date(rawDate);
    entries.push({
      id: `item-${entries.length}`,
      title,
      url,
      publishedAt: Number.isNaN(parsedDate.getTime()) ? null : parsedDate.toISOString(),
      description: xmlText(
        get(item, 'description') || get(item, 'summary') || get(item, 'content'),
        1000
      ),
    });
  }
  return { news: entries, warnings: [] };
}
const isoDay = (date) => date.toISOString().slice(0, 10);
const zoneFormatters = new Map();
function zoneFormatter(timezone) {
  if (zoneFormatters.has(timezone)) return zoneFormatters.get(timezone);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  if (zoneFormatters.size >= 64) zoneFormatters.delete(zoneFormatters.keys().next().value);
  zoneFormatters.set(timezone, formatter);
  return formatter;
}
function validTimezone(timezone) {
  try {
    zoneFormatter(timezone);
    return timezone;
  } catch {
    fail('Use a valid IANA timezone.');
  }
}
function localParts(timestamp, timezone) {
  const parts = zoneFormatter(timezone).formatToParts(new Date(timestamp));
  const get = (type) => Number(parts.find((part) => part.type === type).value);
  return [get('year'), get('month'), get('day'), get('hour'), get('minute'), get('second')];
}
function localInstant(parts, timezone) {
  const target = Date.UTC(...[parts[0], parts[1] - 1, ...parts.slice(2)]);
  let guess = target;
  for (let i = 0; i < 4; i++) {
    const seen = localParts(guess, timezone);
    const offset = Date.UTC(seen[0], seen[1] - 1, ...seen.slice(2)) - guess;
    guess = target - offset;
  }
  if (localParts(guess, timezone).some((value, index) => value !== parts[index]))
    fail('Calendar contains an invalid local time.');
  return guess;
}
function calendarDate(value, params, timezone) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!match) fail('Calendar contains an unsupported date.');
  const parts = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4] || 0),
    Number(match[5] || 0),
    Number(match[6] || 0),
  ];
  const allDay = !match[4];
  const zone = match[7] ? 'UTC' : validTimezone(params.TZID || timezone);
  const timestamp = localInstant(parts, zone);
  return {
    timestamp,
    parts,
    zone,
    allDay,
    day: isoDay(new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))),
  };
}
function dayNumber(value) {
  const date = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(date.getTime()) || isoDay(date) !== value)
    fail('Use a date in YYYY-MM-DD format.');
  return date.getTime();
}
function icsText(value, limit) {
  return clean(value.replace(/\\[nN]/g, '\n').replace(/\\([,;\\])/g, '$1'), limit);
}
function expandEvent(base, properties, windowStart, windowEnd, warnings) {
  const rule = properties.find((property) => property.name === 'RRULE')?.value;
  if (!rule) return [base];
  const fields = Object.fromEntries(rule.split(';').map((part) => part.split('=')));
  const interval = Number(fields.INTERVAL || 1);
  const count = fields.COUNT ? Number(fields.COUNT) : Infinity;
  const days = fields.BYDAY ? fields.BYDAY.split(',') : [];
  const weekdays = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };
  if (
    !['DAILY', 'WEEKLY'].includes(fields.FREQ) ||
    !Number.isInteger(interval) ||
    interval < 1 ||
    interval > 366 ||
    (count !== Infinity && (!Number.isInteger(count) || count < 1)) ||
    days.some((day) => weekdays[day] === undefined) ||
    Object.keys(fields).some(
      (key) => !['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'WKST'].includes(key)
    ) ||
    (fields.WKST && fields.WKST !== 'MO') ||
    properties.some((property) => ['RDATE', 'RECURRENCE-ID'].includes(property.name))
  ) {
    warnings.push('Some recurrence rules are unsupported; only their first occurrence is shown.');
    return [base];
  }
  let until = Infinity;
  try {
    if (fields.UNTIL) {
      until = calendarDate(fields.UNTIL, {}, base._start.zone).timestamp;
      if (fields.UNTIL.length === 8) until += DAY - 1;
    }
  } catch {
    warnings.push('An invalid recurrence end was ignored; only the first occurrence is shown.');
    return [base];
  }
  const excluded = new Set();
  for (const property of properties.filter((property) => property.name === 'EXDATE'))
    for (const value of property.value.split(',')) {
      try {
        excluded.add(calendarDate(value, property.params, base._start.zone).timestamp);
      } catch {
        warnings.push('An unsupported recurrence exclusion was ignored.');
      }
    }
  const startDay = dayNumber(base._start.day);
  const firstWeekday = (new Date(startDay).getUTCDay() + 6) % 7;
  const requestedWeekdays = days.length
    ? days.map((day) => weekdays[day]).sort((a, b) => a - b)
    : [firstWeekday];
  const weekZero = startDay - firstWeekday * DAY;
  const firstWeekDays = requestedWeekdays.filter((day) => day >= firstWeekday);
  const result = [];
  // The seven-day request may overlap an event started earlier; cap look-back at 31 days.
  const lookback = Math.min(
    31,
    Math.max(
      1,
      Math.ceil(
        (base.end ? new Date(base.end).getTime() - new Date(base.start).getTime() : 0) / DAY
      )
    )
  );
  const from = Math.max(startDay, windowStart - lookback * DAY);
  const to = windowEnd;
  for (let current = from; current <= to; current += DAY) {
    const delta = Math.round((current - startDay) / DAY);
    const weekday = (new Date(current).getUTCDay() + 6) % 7;
    let ordinal;
    if (fields.FREQ === 'DAILY') {
      if (delta % interval || (days.length && !days.includes(Object.keys(weekdays)[weekday])))
        continue;
      ordinal = Math.floor(delta / interval) + 1;
      if (days.length && count !== Infinity) {
        // Count selected weekdays over a repeating seven-occurrence cycle, not an unbounded history scan.
        const n = Math.floor(delta / interval);
        const selectedPerCycle = Array.from({ length: 7 }, (_, i) =>
          days.includes(Object.keys(weekdays)[(firstWeekday + i * interval) % 7])
        ).filter(Boolean).length;
        ordinal =
          Math.floor(n / 7) * selectedPerCycle +
          Array.from({ length: (n % 7) + 1 }, (_, i) =>
            days.includes(Object.keys(weekdays)[(firstWeekday + i * interval) % 7])
          ).filter(Boolean).length;
      }
    } else {
      const week = Math.floor((current - weekZero) / (7 * DAY));
      if (week % interval || !requestedWeekdays.includes(weekday)) continue;
      ordinal =
        week === 0
          ? firstWeekDays.indexOf(weekday) + 1
          : firstWeekDays.length +
            (week / interval - 1) * requestedWeekdays.length +
            requestedWeekdays.indexOf(weekday) +
            1;
    }
    if (ordinal > count || ordinal < 1) continue;
    const date = new Date(current);
    const parts = [
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
      ...base._start.parts.slice(3),
    ];
    let stamp;
    try {
      stamp = localInstant(parts, base._start.zone);
    } catch {
      warnings.push('A recurrence in a nonexistent local time was skipped.');
      continue;
    }
    if (stamp > until || excluded.has(stamp)) continue;
    const duration = base._end
      ? base.allDay
        ? dayNumber(base._end.day) - dayNumber(base._start.day)
        : base._end.timestamp - base._start.timestamp
      : base.allDay
        ? DAY
        : 0;
    const start = base.allDay ? isoDay(date) : new Date(stamp).toISOString();
    const end = base.allDay
      ? isoDay(new Date(current + Math.max(DAY, duration)))
      : new Date(stamp + duration).toISOString();
    result.push({ ...base, id: `${base.id}-${start}`, start, end });
    if (result.length >= MAX_ITEMS) break;
  }
  return result;
}
export function parseCalendarFeed(body, { timezone = 'UTC', date, days = 1 } = {}) {
  if (typeof body !== 'string' || Buffer.byteLength(body) > FEED_LIMIT)
    fail('Feed exceeds 256 KiB.');
  if (!/^BEGIN:VCALENDAR\s*$/im.test(body)) fail('Use an iCalendar feed.');
  validTimezone(timezone);
  const windowStart = dayNumber(date || isoDay(new Date()));
  const windowEnd = windowStart + Math.min(7, Math.max(1, Number(days) || 1)) * DAY;
  const unfolded = body.replace(/\r?\n[ \t]/g, '');
  const events = [];
  const warnings = [];
  for (const match of unfolded.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/g)) {
    if (events.length >= MAX_ITEMS) {
      warnings.push('Feed items were limited to 500.');
      break;
    }
    const properties = match[1]
      .split(/\r?\n/)
      .map((line) => {
        const colon = line.indexOf(':');
        if (colon < 0) return null;
        const [name, ...rawParams] = line.slice(0, colon).split(';');
        const params = Object.fromEntries(
          rawParams.map((item) => {
            const split = item.indexOf('=');
            return [
              item.slice(0, split).toUpperCase(),
              item.slice(split + 1).replace(/^"|"$/g, ''),
            ];
          })
        );
        return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
      })
      .filter(Boolean);
    const get = (name) => properties.find((property) => property.name === name);
    if (get('STATUS')?.value === 'CANCELLED') continue;
    try {
      const startProperty = get('DTSTART');
      if (!startProperty) continue;
      const start = calendarDate(startProperty.value, startProperty.params, timezone);
      if (get('DURATION'))
        warnings.push('DURATION is unsupported; provide DTEND for an event end.');
      const endProperty = get('DTEND');
      const end = endProperty
        ? calendarDate(endProperty.value, endProperty.params, timezone)
        : null;
      if (end && end.timestamp < start.timestamp) fail('Calendar end precedes start.');
      const base = {
        id: icsText(get('UID')?.value || `event-${events.length}`, 180),
        title: icsText(get('SUMMARY')?.value || 'Untitled event', 300),
        start: start.allDay ? start.day : new Date(start.timestamp).toISOString(),
        end: end
          ? end.allDay
            ? end.day
            : new Date(end.timestamp).toISOString()
          : start.allDay
            ? isoDay(new Date(dayNumber(start.day) + DAY))
            : new Date(start.timestamp).toISOString(),
        allDay: start.allDay,
        location: icsText(get('LOCATION')?.value || '', 300),
        url: safeLink(get('URL')?.value || ''),
        editable: false,
        _start: start,
        _end: end,
      };
      if (
        !get('RRULE') &&
        properties.some((property) => ['RDATE', 'RECURRENCE-ID'].includes(property.name))
      )
        warnings.push('Some recurrence exceptions are unsupported.');
      events.push(...expandEvent(base, properties, windowStart, windowEnd, warnings));
    } catch {
      warnings.push('An event with an unsupported or invalid date was skipped.');
    }
  }
  const startOfWindow = localInstant(
    [...dateToParts(isoDay(new Date(windowStart))), 0, 0, 0],
    timezone
  );
  const endOfWindow = localInstant(
    [...dateToParts(isoDay(new Date(windowEnd))), 0, 0, 0],
    timezone
  );
  return {
    events: events
      .filter((event) =>
        event.allDay
          ? event.start < isoDay(new Date(windowEnd)) && event.end > isoDay(new Date(windowStart))
          : new Date(event.start).getTime() < endOfWindow &&
            Math.max(new Date(event.end).getTime(), new Date(event.start).getTime() + 1) >
              startOfWindow
      )
      .slice(0, MAX_ITEMS)
      .map(({ _start, _end, ...event }) => event),
    warnings: [...new Set(warnings)],
  };
}
function dateToParts(date) {
  return date.split('-').map(Number);
}
function ensureDatabasePath(databasePath) {
  if (databasePath === ':memory:') return;
  if (!path.isAbsolute(databasePath)) fail('Database path must be absolute.');
  const parent = path.dirname(databasePath);
  // Walk existing ancestors before mkdir to reject a symlinked storage parent.
  let current = path.parse(parent).root;
  for (const segment of parent.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (existsSync(current)) {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory())
        fail('Database directory must not use symlinks.');
    }
  }
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (realpathSync(parent) !== parent) fail('Database directory must not use symlinks.');
  for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`])
    if (existsSync(file)) {
      const stat = lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink > 1)
        fail('Database must be a regular private file.');
    }
}
export function createDailySources({
  databasePath = ':memory:',
  fetchFeed = fetchPublicFeed,
  now = Date.now,
  demo = false,
} = {}) {
  ensureDatabasePath(databasePath);
  const db = new DatabaseSync(databasePath);
  if (databasePath !== ':memory:') chmodSync(databasePath, 0o600);
  db.exec(
    'PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS daily_sources(id TEXT PRIMARY KEY,kind TEXT NOT NULL,title TEXT NOT NULL,url TEXT NOT NULL,cache TEXT,last_fetched TEXT,error TEXT); CREATE TABLE IF NOT EXISTS daily_events(id TEXT PRIMARY KEY,body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS daily_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);'
  );
  if (databasePath !== ':memory:')
    for (const file of [`${databasePath}-wal`, `${databasePath}-shm`])
      if (existsSync(file)) chmodSync(file, 0o600);
  const sourceInfo = (row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    url: row.url,
    lastFetched: row.last_fetched,
    error: row.error,
  });
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const saveEvent = (input) => {
    const title = clean(input.title, 300);
    if (!title) fail('Event title is required.');
    const allDay = Boolean(input.allDay);
    let start, end;
    if (allDay) {
      start = String(input.start || '').slice(0, 10);
      end = String(input.end || '').slice(0, 10);
      dayNumber(start);
      if (!end) end = isoDay(new Date(dayNumber(start) + DAY));
      dayNumber(end);
      if (end <= start) fail('All-day end must follow start.');
    } else {
      const startDate = new Date(input.start);
      const endDate = new Date(input.end);
      if (
        !input.start ||
        !input.end ||
        !Number.isFinite(startDate.getTime()) ||
        !Number.isFinite(endDate.getTime()) ||
        endDate <= startDate
      )
        fail('Provide event start and end with end after start.');
      start = startDate.toISOString();
      end = endDate.toISOString();
    }
    const id = input.id || `local-${randomUUID()}`;
    if (input.id && !db.prepare('SELECT id FROM daily_events WHERE id=?').get(id))
      fail('Local event not found.');
    if (!input.id && db.prepare('SELECT count(*) AS total FROM daily_events').get().total >= 1000)
      fail('Local events are limited to 1000.');
    const event = {
      id,
      sourceId: 'local',
      title,
      start,
      end,
      allDay,
      location: clean(input.location, 300),
      url: safeLink(input.url || ''),
      editable: true,
    };
    transaction(() =>
      db
        .prepare(
          'INSERT INTO daily_events(id,body) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body'
        )
        .run(id, JSON.stringify(event))
    );
    return event;
  };
  const seed = (date, timezone) => {
    if (!demo || db.prepare("SELECT value FROM daily_meta WHERE key='demo-seeded'").get()) return;
    const anchor = dayNumber(date);
    const monday = anchor - ((new Date(anchor).getUTCDay() + 6) % 7) * DAY;
    transaction(() => {
      for (const [index, title, hour] of [
        [0, 'A morning walk', 9],
        [2, 'A quiet focus session', 11],
        [4, 'Time outside', 17],
      ]) {
        const key = isoDay(new Date(monday + index * DAY));
        const stamp = localInstant([...dateToParts(key), hour, 0, 0], timezone);
        const id = `local-${randomUUID()}`;
        db.prepare('INSERT INTO daily_events(id,body) VALUES(?,?)').run(
          id,
          JSON.stringify({
            id,
            sourceId: 'local',
            title,
            start: new Date(stamp).toISOString(),
            end: new Date(stamp + 3600000).toISOString(),
            allDay: false,
            location: '',
            url: '',
            editable: true,
            demo: true,
          })
        );
      }
      db.prepare("INSERT INTO daily_meta(key,value) VALUES('demo-seeded','1')").run();
    });
  };
  return {
    replaceSourceDefinitions(rows) {
      transaction(() => {
        const ids = new Set(rows.map((row) => row.id));
        for (const row of db.prepare('SELECT id FROM daily_sources').all())
          if (!ids.has(row.id)) db.prepare('DELETE FROM daily_sources WHERE id=?').run(row.id);
        for (const row of rows)
          db.prepare(
            'INSERT INTO daily_sources(id,kind,title,url) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,title=excluded.title,url=excluded.url'
          ).run(row.id, row.kind, row.title, row.url);
      });
    },
    async list({ date, timezone = 'UTC', days = 1 } = {}) {
      validTimezone(timezone);
      if (!Number.isInteger(Number(days)) || Number(days) < 1 || Number(days) > 7)
        fail('Choose between 1 and 7 days.');
      days = Number(days);
      if (!date) {
        const parts = localParts(now(), timezone);
        date = `${parts[0]}-${String(parts[1]).padStart(2, '0')}-${String(parts[2]).padStart(2, '0')}`;
      }
      dayNumber(date);
      seed(date, timezone);
      const rows = db.prepare('SELECT * FROM daily_sources ORDER BY rowid').all();
      const events = [],
        news = [],
        warnings = [];
      for (const row of rows) {
        if (!row.cache) continue;
        try {
          const parsed =
            row.kind === 'calendar'
              ? parseCalendarFeed(row.cache, { date, timezone, days })
              : parseNewsFeed(row.cache);
          for (const event of parsed.events || [])
            events.push({ ...event, id: `${row.id}:${event.id}`, sourceId: row.id });
          for (const item of parsed.news || [])
            news.push({ ...item, id: `${row.id}:${item.id}`, sourceId: row.id });
          for (const warning of parsed.warnings)
            warnings.push({ sourceId: row.id, message: warning });
        } catch {
          warnings.push({ sourceId: row.id, message: 'Cached feed could not be parsed.' });
        }
      }
      const endDate = isoDay(new Date(dayNumber(date) + days * DAY));
      const windowStart = localInstant([...dateToParts(date), 0, 0, 0], timezone);
      const windowEnd = localInstant([...dateToParts(endDate), 0, 0, 0], timezone);
      for (const row of db.prepare('SELECT body FROM daily_events').all()) {
        const event = JSON.parse(row.body);
        if (
          event.allDay
            ? event.start < endDate && event.end > date
            : new Date(event.start).getTime() < windowEnd &&
              new Date(event.end).getTime() > windowStart
        )
          events.push(event);
      }
      events.sort((a, b) => a.start.localeCompare(b.start));
      news.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
      return { sources: rows.map(sourceInfo), events, news, warnings };
    },
    async add(input) {
      if (!['calendar', 'rss'].includes(input.kind)) fail('Choose calendar or rss.');
      const title = clean(input.title, 80);
      if (!title) fail('Source title is required.');
      const url = validateFeedUrl(input.url);
      const id = randomUUID();
      transaction(() => {
        if (db.prepare('SELECT count(*) AS total FROM daily_sources').get().total >= 10)
          fail('Sources are limited to 10.');
        if (db.prepare('SELECT id FROM daily_sources WHERE url=? AND kind=?').get(url, input.kind))
          fail('This source is already added.');
        db.prepare('INSERT INTO daily_sources(id,kind,title,url) VALUES(?,?,?,?)').run(
          id,
          input.kind,
          title,
          url
        );
      });
      return sourceInfo(db.prepare('SELECT * FROM daily_sources WHERE id=?').get(id));
    },
    async remove(id) {
      const result = transaction(() => db.prepare('DELETE FROM daily_sources WHERE id=?').run(id));
      if (!result.changes) fail('Source not found.');
      return { removed: true };
    },
    async refresh(id) {
      const row = db.prepare('SELECT * FROM daily_sources WHERE id=?').get(id);
      if (!row) fail('Source not found.');
      try {
        const body = await fetchFeed(row.url);
        if (typeof body !== 'string' || Buffer.byteLength(body) > FEED_LIMIT)
          fail('Feed exceeds 256 KiB.');
        if (row.kind === 'calendar') parseCalendarFeed(body);
        else parseNewsFeed(body);
        transaction(() =>
          db
            .prepare('UPDATE daily_sources SET cache=?,last_fetched=?,error=NULL WHERE id=?')
            .run(body, new Date(now()).toISOString(), id)
        );
      } catch (error) {
        const allowed = [
          'Feed exceeds 256 KiB.',
          'Feed redirects are not allowed.',
          'Feed request timed out.',
          'Feed address must be public.',
          'XML document declarations are not supported.',
          'Use an RSS or Atom feed.',
          'Use an iCalendar feed.',
        ];
        const message = allowed.includes(error.message)
          ? error.message
          : 'Could not refresh feed; previous cached items are kept.';
        transaction(() =>
          db.prepare('UPDATE daily_sources SET error=? WHERE id=?').run(message, id)
        );
      }
      const current = db.prepare('SELECT * FROM daily_sources WHERE id=?').get(id);
      if (!current) fail('Source no longer exists.');
      return sourceInfo(current);
    },
    async saveEvent(input) {
      return saveEvent(input);
    },
    async removeEvent(id) {
      const result = transaction(() => db.prepare('DELETE FROM daily_events WHERE id=?').run(id));
      if (!result.changes) fail('Local event not found.');
      return { removed: true };
    },
    close() {
      db.close();
    },
  };
}
