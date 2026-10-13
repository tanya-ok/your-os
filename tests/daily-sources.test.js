import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdtemp, realpath, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  createDailySources,
  FEED_LIMIT,
  fetchPublicFeed,
  isPublicAddress,
  parseCalendarFeed,
  parseNewsFeed,
  validateFeedUrl,
} from '../lib/daily-sources.js';

const calendar = (...lines) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', ...lines, 'END:VEVENT', 'END:VCALENDAR'].join(
    '\r\n'
  );
const at = { date: '2026-10-07', timezone: 'Europe/Warsaw' };

test('calendar unfolds text, escapes fields and filters by local day across year boundaries', () => {
  const feed = calendar(
    'UID:year',
    'DTSTART:20261231T233000Z',
    'DTEND:20270101T003000Z',
    'SUMMARY:A long',
    '  folded title\\, yes',
    'LOCATION:Outside\\nNear a tree',
    'URL:https://example.org/event'
  );
  const result = parseCalendarFeed(feed, { date: '2027-01-01', timezone: 'Europe/Warsaw' });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].title, 'A long folded title, yes');
  assert.equal(result.events[0].editable, false);
  assert.equal(result.events[0].location, 'Outside\nNear a tree');
  assert.equal(
    parseCalendarFeed(feed, { date: '2026-12-31', timezone: 'Europe/Warsaw' }).events.length,
    0
  );
});
test('calendar date-only end is exclusive and invalid/nonexistent times are skipped', () => {
  const feed = calendar(
    'DTSTART;VALUE=DATE:20261007',
    'DTEND;VALUE=DATE:20261009',
    'SUMMARY:A two-day field trip'
  );
  assert.equal(parseCalendarFeed(feed, at).events[0].allDay, true);
  assert.equal(parseCalendarFeed(feed, { ...at, date: '2026-10-08' }).events.length, 1);
  assert.equal(parseCalendarFeed(feed, { ...at, date: '2026-10-09' }).events.length, 0);
  const bad = calendar(
    'DTSTART;TZID=Europe/Warsaw:20260329T023000',
    'SUMMARY:Missing spring-forward time'
  );
  assert.equal(parseCalendarFeed(bad, { ...at, date: '2026-03-29' }).events.length, 0);
  assert.ok(parseCalendarFeed(bad, at).warnings.length);
});
test('weekly recurrence keeps local hour through DST, respects COUNT and EXDATE', () => {
  const feed = calendar(
    'UID:weekly',
    'DTSTART;TZID=Europe/Warsaw:20261019T090000',
    'DTEND;TZID=Europe/Warsaw:20261019T100000',
    'RRULE:FREQ=WEEKLY;COUNT=4;BYDAY=MO,WE',
    'EXDATE;TZID=Europe/Warsaw:20261021T090000',
    'SUMMARY:Observation'
  );
  const week = parseCalendarFeed(feed, { date: '2026-10-26', timezone: 'Europe/Warsaw', days: 7 });
  assert.equal(week.events.length, 2);
  assert.equal(week.events[0].start, '2026-10-26T08:00:00.000Z');
  assert.equal(week.events[1].start, '2026-10-28T08:00:00.000Z');
  assert.equal(
    parseCalendarFeed(feed, { date: '2026-10-19', timezone: 'Europe/Warsaw', days: 7 }).events
      .length,
    1
  );
  assert.equal(
    parseCalendarFeed(feed, { date: '2026-11-02', timezone: 'Europe/Warsaw', days: 7 }).events
      .length,
    0
  );
});
test('daily recurrence bounds interval, count, until and BYDAY; unsupported rules disclosed', () => {
  const feed = calendar(
    'DTSTART:20261005T100000Z',
    'DTEND:20261005T110000Z',
    'RRULE:FREQ=DAILY;INTERVAL=2;COUNT=3;UNTIL=20261009T100000Z',
    'SUMMARY:Small practice'
  );
  assert.deepEqual(
    parseCalendarFeed(feed, { date: '2026-10-05', days: 7 }).events.map((event) =>
      event.start.slice(0, 10)
    ),
    ['2026-10-05', '2026-10-07', '2026-10-09']
  );
  const weekdays = calendar(
    'DTSTART:20261005T100000Z',
    'RRULE:FREQ=DAILY;COUNT=6;BYDAY=MO,TU,WE,TH,FR',
    'SUMMARY:Weekday'
  );
  assert.equal(parseCalendarFeed(weekdays, { date: '2026-10-12', days: 7 }).events.length, 1);
  const monthly = calendar('DTSTART:20261007T100000Z', 'RRULE:FREQ=MONTHLY', 'SUMMARY:Monthly');
  const result = parseCalendarFeed(monthly, { date: '2026-10-07' });
  assert.equal(result.events.length, 1);
  assert.match(result.warnings[0], /unsupported/);
});
test('RSS and Atom decode CDATA/entities, remove markup, require HTTPS links and reject DTD', () => {
  const rss =
    '<rss><channel><item><title><![CDATA[A <b>small</b> thing &amp; more]]></title><link>https://example.org/a</link><pubDate>Wed, 07 Oct 2026 10:00:00 GMT</pubDate><description>&lt;b&gt;Hello&lt;/b&gt;</description></item><item><title>Unsafe</title><link>javascript:alert(1)</link></item></channel></rss>';
  const parsed = parseNewsFeed(rss);
  assert.equal(parsed.news.length, 1);
  assert.equal(parsed.news[0].title, 'A  small  thing & more');
  assert.equal(parsed.news[0].publishedAt, '2026-10-07T10:00:00.000Z');
  assert.ok(!parsed.news[0].description.includes('<'));
  const atom =
    '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Tree &#x1f333;</title><link rel="self" href="https://example.org/api"/><link rel="alternate" href="https://example.org/post?a=1&amp;b=2"/><updated>2026-10-07T11:00:00Z</updated><summary><![CDATA[<script>ignore()</script>Only text]]></summary></entry></feed>';
  assert.equal(parseNewsFeed(atom).news[0].url, 'https://example.org/post?a=1&b=2');
  assert.equal(parseNewsFeed(atom).news[0].title, 'Tree 🌳');
  assert.ok(!parseNewsFeed(atom).news[0].description.includes('<'));
  assert.throws(
    () => parseNewsFeed('<!DOCTYPE rss [<!ENTITY secret SYSTEM "file:///etc/passwd">]><rss/>'),
    /declarations/
  );
  assert.throws(() => parseNewsFeed('x'.repeat(FEED_LIMIT + 1)), /256/);
});
test('public address and URL guard rejects local/private/reserved credentials and schemes', () => {
  for (const ip of [
    '127.0.0.1',
    '0.0.0.0',
    '10.1.2.3',
    '100.64.1.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.1.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '::1',
    '::ffff:8.8.8.8',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '2001:0002::1',
    '2002:0808:0808::1',
    '3fff::1',
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888'])
    assert.equal(isPublicAddress(ip), true, ip);
  for (const url of [
    'http://example.org/rss',
    'https://user:pass@example.org/rss',
    'https://example.org/rss#fragment',
    'https://localhost/a',
    'https://127.1/a',
    'https://[::1]/a',
    'https://example.org:444/a',
    'file:///a',
  ])
    assert.throws(() => validateFeedUrl(url));
  assert.equal(validateFeedUrl('https://example.org/rss'), 'https://example.org/rss');
});
function fakeRequest({ status = 200, body = 'ok', length, hang = false, inspect } = {}) {
  return (url, options, callback) => {
    const req = new EventEmitter();
    req.end = () => {
      inspect?.(url, options);
      if (hang) return;
      queueMicrotask(() => {
        const response = new EventEmitter();
        response.statusCode = status;
        response.headers = length ? { 'content-length': String(length) } : {};
        response.resume = () => {};
        callback(response);
        queueMicrotask(() => {
          response.emit('data', Buffer.from(body));
          response.emit('end');
        });
      });
    };
    req.destroy = () => {};
    return req;
  };
}
test('network pins public DNS address, rejects mixed private answers and redirects', async () => {
  let pinned = false;
  const lookup = async () => [{ address: '8.8.8.8', family: 4 }];
  assert.equal(
    await fetchPublicFeed('https://example.org/feed', {
      lookup,
      request: fakeRequest({
        inspect: (_url, options) => {
          assert.equal(options.servername, 'example.org');
          options.lookup('example.org', { all: true }, (_error, address) => {
            assert.deepEqual(address, [{ address: '8.8.8.8', family: 4 }]);
            pinned = true;
          });
        },
      }),
    }),
    'ok'
  );
  assert.equal(pinned, true);
  await assert.rejects(
    fetchPublicFeed('https://example.org/feed', {
      lookup: async () => [
        { address: '8.8.8.8', family: 4 },
        { address: '10.0.0.1', family: 4 },
      ],
      request: fakeRequest(),
    }),
    /public/
  );
  await assert.rejects(
    fetchPublicFeed('https://example.org/feed', { lookup, request: fakeRequest({ status: 302 }) }),
    /redirects/
  );
  await assert.rejects(
    fetchPublicFeed('https://example.org/feed', {
      lookup,
      request: fakeRequest({ length: FEED_LIMIT + 1 }),
    }),
    /256/
  );
  await assert.rejects(
    fetchPublicFeed('https://example.org/feed', {
      lookup,
      request: fakeRequest({ body: 'x'.repeat(FEED_LIMIT + 1) }),
    }),
    /256/
  );
  await assert.rejects(
    fetchPublicFeed('https://example.org/feed', {
      lookup,
      request: fakeRequest({ hang: true }),
      timeoutMs: 10,
    }),
    /timed out/
  );
});
test('add/list never fetch, explicit refresh keeps stale cache and redacts errors', async () => {
  let calls = 0;
  let broken = false;
  const store = createDailySources({
    fetchFeed: async () => {
      calls++;
      if (broken) throw new Error('https://secret-token@example.org/?key=PRIVATE');
      return calendar('DTSTART:20261007T100000Z', 'SUMMARY:Observe a tree');
    },
    now: () => Date.parse('2026-10-07T12:00:00Z'),
  });
  try {
    const source = await store.add({
      kind: 'calendar',
      title: 'Public calendar',
      url: 'https://example.org/calendar.ics',
    });
    assert.equal(calls, 0);
    assert.equal((await store.list(at)).events.length, 0);
    assert.equal(calls, 0);
    await store.refresh(source.id);
    assert.equal((await store.list(at)).events.length, 1);
    assert.equal(calls, 1);
    broken = true;
    await store.refresh(source.id);
    const result = await store.list(at);
    assert.equal(result.events.length, 1);
    assert.equal(result.sources[0].lastFetched, '2026-10-07T12:00:00.000Z');
    assert.ok(!result.sources[0].error.includes('PRIVATE'));
    assert.match(result.sources[0].error, /cached/);
    await store.remove(source.id);
    assert.equal((await store.list(at)).events.length, 0);
  } finally {
    store.close();
  }
});
test('manual events persist, edit safely, filter by day and remove without touching feeds', async () => {
  const directory = await mkdtemp(path.join(await realpath(os.tmpdir()), 'daily-sources-test-'));
  const file = path.join(directory, 'daily.sqlite');
  let store = createDailySources({ databasePath: file });
  try {
    const source = await store.add({
      kind: 'rss',
      title: 'Reading',
      url: 'https://example.org/rss',
    });
    const event = await store.saveEvent({
      title: 'Walk',
      start: '2026-10-07T09:00:00Z',
      end: '2026-10-07T10:00:00Z',
    });
    assert.equal(event.editable, true);
    assert.equal((await store.list(at)).events.length, 1);
    assert.equal((await store.list({ ...at, date: '2026-10-08' })).events.length, 0);
    store.close();
    store = createDailySources({ databasePath: file });
    assert.equal((await store.list(at)).sources[0].id, source.id);
    assert.equal((await store.list(at)).events[0].title, 'Walk');
    await store.saveEvent({ ...event, title: 'Longer walk' });
    assert.equal((await store.list(at)).events[0].title, 'Longer walk');
    await assert.rejects(store.saveEvent({ ...event, id: 'feed-id', title: 'No' }), /not found/);
    await assert.rejects(
      store.saveEvent({ title: 'No', start: '2026-10-07T10:00Z', end: '2026-10-07T09:00Z' }),
      /end after start/
    );
    await store.removeEvent(event.id);
    assert.equal((await store.list(at)).events.length, 0);
    assert.equal((await store.list(at)).sources.length, 1);
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
test('demo events seed once, source limits and list bounds hold', async () => {
  const store = createDailySources({ demo: true });
  try {
    assert.equal((await store.list({ ...at, date: '2026-10-05', days: 7 })).events.length, 3);
    assert.equal((await store.list({ ...at, date: '2026-10-12', days: 7 })).events.length, 0);
    for (let index = 0; index < 10; index++)
      await store.add({
        kind: 'rss',
        title: `Source ${index}`,
        url: `https://example.org/${index}`,
      });
    await assert.rejects(
      store.add({ kind: 'rss', title: 'Extra', url: 'https://example.org/extra' }),
      /limited/
    );
    await assert.rejects(store.list({ ...at, days: 8 }), /1 and 7/);
    await assert.rejects(store.list({ ...at, date: '2026-02-30' }), /YYYY/);
    await assert.rejects(store.list({ ...at, timezone: 'Not/AZone' }), /timezone/);
  } finally {
    store.close();
  }
});
test('database storage rejects symlink targets', async () => {
  const directory = await mkdtemp(path.join(await realpath(os.tmpdir()), 'daily-path-'));
  try {
    await symlink(directory, path.join(directory, 'alias'));
    assert.throws(
      () => createDailySources({ databasePath: path.join(directory, 'alias', 'daily.sqlite') }),
      /symlink/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
