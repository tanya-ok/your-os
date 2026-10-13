import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createAppleCalendar } from '../lib/apple-calendar.js';
import { createReminders } from '../lib/reminders.js';
import { atomicWrite } from '../lib/writer.js';
import { createApp } from '../server.js';

const windowInput = {
  calendarIds: ['calendar-a'],
  start: '2026-10-05T00:00:00Z',
  end: '2026-10-12T00:00:00Z',
};
const event = (index = 0) => ({
  id: `event-${index}`,
  calendarId: 'calendar-a',
  calendarTitle: 'Synthetic calendar',
  title: `Synthetic event ${index}`,
  start: '2026-10-07T09:00:00Z',
  end: '2026-10-07T10:00:00Z',
  allDay: false,
  location: 'Synthetic location is not cached',
});
const item = (index = 0) => ({
  id: `reminder-${index}`,
  listId: 'list-a',
  listTitle: 'Synthetic next actions',
  title: `Synthetic action ${index}`,
  notes: 'Private-looking synthetic notes must not enter the UI cache',
  dueDate: '2026-10-07T12:00:00Z',
  completed: false,
});

async function fixture(t, { events = [event()], items = [item()], platform = 'darwin' } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'personal-os-native-api-')));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = join(root, 'vault');
  await mkdir(join(vault, 'Projects'), { recursive: true });
  await atomicWrite(join(vault, 'Tasks.md'), '# Tasks\n\n## Next\n- [ ] Synthetic local task\n');
  const calls = [];
  const calendar = createAppleCalendar({
    platform,
    runner: async (_file, argv) => {
      const input = JSON.parse(argv[1]);
      calls.push({ app: 'calendar', ...input });
      return {
        stdout: JSON.stringify(
          input.operation === 'calendars'
            ? {
                calendars: [
                  { id: 'calendar-a', title: 'Synthetic calendar' },
                  { id: 'calendar-b', title: 'Unselected calendar' },
                ],
              }
            : { events, warnings: [] }
        ),
      };
    },
  });
  const reminders = createReminders({
    platform,
    runner: async (_file, argv) => {
      const input = JSON.parse(argv.at(-1));
      calls.push({ app: 'reminders', ...input });
      return {
        stdout: JSON.stringify(
          input.operation === 'lists'
            ? {
                lists: [
                  { id: 'list-a', title: 'Synthetic next actions' },
                  { id: 'list-b', title: 'Unselected list' },
                ],
              }
            : { lists: [{ id: 'list-a', title: 'Synthetic next actions' }], items, warnings: [] }
        ),
      };
    },
  });
  const options = {
    vaultRoot: vault,
    profilePath: join(root, 'profile.json'),
    workLogPath: join(root, 'work.sqlite'),
    dailySourcesPath: join(root, 'sources.sqlite'),
    mode: 'vault',
    nativeCalendar: calendar,
    nativeReminders: reminders,
    nativePlatform: platform,
    agentEnv: {},
    agentFetch: async () => {
      throw new Error('Unexpected model call');
    },
    feedFetch: async () => {
      throw new Error('Unexpected feed call');
    },
  };
  let app = createApp(options);
  return {
    calls,
    reopen: () => {
      app = createApp(options);
    },
    async request(path, { method = 'GET', body, headers = {} } = {}) {
      const response = await app.request(`http://localhost:3104${path}`, {
        method,
        headers: {
          origin: 'http://localhost:3104',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, json: await response.json() };
    },
  };
}
const post = (body) => ({ method: 'POST', body });

test('startup, native status, GTD data and Today never read Apple applications implicitly', async (t) => {
  const { request, calls } = await fixture(t);
  assert.equal(calls.length, 0);
  for (const path of [
    '/api/status',
    '/api/workspace',
    '/api/integrations/apple',
    '/api/today/sources?date=2026-10-07&timezone=UTC',
  ])
    assert.equal((await request(path)).status, 200);
  assert.deepEqual((await request('/api/integrations/apple')).json, {
    supported: true,
    calendar: null,
    reminders: null,
  });
  assert.deepEqual(calls, []);
});

test('only explicit catalog requests read calendar names and reminder lists', async (t) => {
  const { request, calls } = await fixture(t);
  const calendars = await request('/api/integrations/apple/calendars');
  assert.equal(calendars.status, 200);
  assert.equal(calendars.json.readOnly, true);
  assert.equal(calendars.json.calendars.length, 2);
  const lists = await request('/api/integrations/apple/reminder-lists');
  assert.equal(lists.status, 200);
  assert.equal(lists.json.readOnly, true);
  assert.equal(lists.json.lists.length, 2);
  assert.deepEqual(
    calls.map(({ app, operation }) => [app, operation]),
    [
      ['calendar', 'calendars'],
      ['reminders', 'lists'],
    ]
  );
  assert.equal((await request('/api/integrations/apple')).json.calendar, null);
});

test('selected calendar refresh persists and merges read-only events into Today and week results without more OS reads', async (t) => {
  const { request, calls, reopen } = await fixture(t, {
    events: [event(), { ...event(1), calendarId: 'calendar-b' }],
  });
  const refreshed = await request('/api/integrations/apple/calendar/refresh', post(windowInput));
  assert.equal(refreshed.status, 200);
  assert.deepEqual(calls[0].calendarIds, ['calendar-a']);
  assert.deepEqual(
    refreshed.json.calendar.calendars.map(({ id }) => id),
    ['calendar-a']
  );
  assert.equal(refreshed.json.calendar.events.length, 1);
  const cached = refreshed.json.calendar.events[0];
  assert.equal(cached.id, 'apple-event-0');
  assert.equal(cached.editable, false);
  assert.equal(cached.sourceId, 'apple-calendar');
  assert.equal('location' in cached, false);
  const count = calls.length;
  reopen();
  assert.deepEqual(
    (await request('/api/integrations/apple')).json.calendar,
    refreshed.json.calendar
  );
  for (const query of ['date=2026-10-07&days=1', 'date=2026-10-05&days=7']) {
    const today = await request(`/api/today/sources?${query}&timezone=UTC`);
    assert.equal(today.status, 200);
    assert.deepEqual(today.json.events, [cached]);
  }
  assert.deepEqual(
    (await request('/api/today/sources?date=2026-10-08&timezone=UTC')).json.events,
    []
  );
  assert.equal(calls.length, count);
});

test('selected reminders persist in the status API used by GTD, preserve IDs, and exclude notes and unselected lists', async (t) => {
  const { request, calls, reopen } = await fixture(t, {
    items: [item(), { ...item(1), title: item().title }, { ...item(2), listId: 'list-b' }],
  });
  const refreshed = await request(
    '/api/integrations/apple/reminders/refresh',
    post({ lists: ['list-a'] })
  );
  assert.equal(refreshed.status, 200);
  assert.deepEqual(calls[0].lists, ['list-a']);
  assert.deepEqual(refreshed.json.reminders.listIds, ['list-a']);
  assert.deepEqual(
    refreshed.json.reminders.items.map(({ id }) => id),
    ['reminder-0', 'reminder-1']
  );
  assert.equal(
    refreshed.json.reminders.items.every((entry) => !('notes' in entry)),
    true
  );
  const count = calls.length;
  reopen();
  assert.deepEqual(
    (await request('/api/integrations/apple')).json.reminders,
    refreshed.json.reminders
  );
  assert.equal(calls.length, count);
});

test('disconnect clears only local cache and does not invoke or mutate either Apple application', async (t) => {
  const { request, calls, reopen } = await fixture(t);
  await request('/api/integrations/apple/calendar/refresh', post(windowInput));
  await request('/api/integrations/apple/reminders/refresh', post({ lists: ['list-a'] }));
  const count = calls.length;
  const result = await request('/api/integrations/apple/disconnect', post({}));
  assert.deepEqual(result.json, { supported: true, calendar: null, reminders: null });
  reopen();
  assert.deepEqual((await request('/api/integrations/apple')).json, result.json);
  assert.deepEqual(
    (await request('/api/today/sources?date=2026-10-07&timezone=UTC')).json.events,
    []
  );
  assert.equal(calls.length, count);
  assert.ok(
    calls.every(({ operation }) => ['calendars', 'events', 'lists', 'items'].includes(operation))
  );
});

test('invalid selections and request fields fail before an Apple application is read', async (t) => {
  const { request, calls } = await fixture(t);
  for (const calendarIds of [
    ['calendar-a', 'calendar-a'],
    Array.from({ length: 11 }, (_, index) => `cal-${index}`),
    ['bad\nidentifier'],
  ])
    assert.equal(
      (
        await request(
          '/api/integrations/apple/calendar/refresh',
          post({ ...windowInput, calendarIds })
        )
      ).status,
      400
    );
  assert.equal(
    (
      await request(
        '/api/integrations/apple/calendar/refresh',
        post({ ...windowInput, end: '2026-10-20T00:00:00Z' })
      )
    ).status,
    400
  );
  for (const lists of [
    ['list-a', 'list-a'],
    Array.from({ length: 11 }, (_, index) => `list-${index}`),
    ['bad\nidentifier'],
  ])
    assert.equal(
      (await request('/api/integrations/apple/reminders/refresh', post({ lists }))).status,
      400
    );
  assert.equal(
    (
      await request(
        '/api/integrations/apple/reminders/refresh',
        post({ lists: ['list-a'], write: true })
      )
    ).status,
    400
  );
  assert.equal(
    (
      await request(
        '/api/integrations/apple/calendar/refresh',
        post({ ...windowInput, write: true })
      )
    ).status,
    400
  );
  assert.deepEqual(calls, []);
});

test('host and cross-origin rejection occurs before native catalog or refresh reads', async (t) => {
  const { request, calls } = await fixture(t);
  for (const path of [
    '/api/integrations/apple/calendars',
    '/api/integrations/apple/reminder-lists',
  ]) {
    assert.equal((await request(path, { headers: { host: 'remote.example' } })).status, 403);
    assert.equal(
      (await request(path, { headers: { origin: 'https://remote.example' } })).status,
      403
    );
    assert.equal(
      (await request(path, { headers: { 'sec-fetch-site': 'cross-site' } })).status,
      403
    );
  }
  assert.equal(
    (
      await request('/api/integrations/apple/calendar/refresh', {
        ...post(windowInput),
        headers: { origin: 'https://remote.example' },
      })
    ).status,
    403
  );
  assert.equal(
    (
      await request('/api/integrations/apple/reminders/refresh', {
        ...post({ lists: ['list-a'] }),
        headers: { 'sec-fetch-site': 'cross-site' },
      })
    ).status,
    403
  );
  assert.deepEqual(calls, []);
});

test('local caches stay usable together with bounded counts, titles and explicit truncation warnings', async (t) => {
  const { request } = await fixture(t, {
    events: Array.from({ length: 110 }, (_, index) => ({
      ...event(index),
      title: 'E'.repeat(500),
    })),
    items: Array.from({ length: 210 }, (_, index) => ({ ...item(index), title: 'R'.repeat(500) })),
  });
  const calendar = await request('/api/integrations/apple/calendar/refresh', post(windowInput));
  assert.equal(calendar.status, 200);
  assert.ok(
    calendar.json.calendar.events.length > 0 && calendar.json.calendar.events.length <= 100
  );
  assert.ok(
    calendar.json.calendar.events.every(({ title }) => title.length > 0 && title.length <= 300)
  );
  assert.match(calendar.json.calendar.warnings.join(' '), /cached|limit/i);
  const reminders = await request(
    '/api/integrations/apple/reminders/refresh',
    post({ lists: ['list-a'] })
  );
  assert.equal(reminders.status, 200);
  assert.ok(
    reminders.json.reminders.items.length > 0 && reminders.json.reminders.items.length <= 200
  );
  assert.ok(
    reminders.json.reminders.items.every(({ title }) => title.length > 0 && title.length <= 300)
  );
  assert.match(reminders.json.reminders.warnings.join(' '), /cached|limit/i);
});

test('unsupported platform status and catalogs need no native executable', async (t) => {
  const { request, calls } = await fixture(t, { platform: 'linux' });
  assert.equal((await request('/api/integrations/apple')).json.supported, false);
  assert.equal((await request('/api/integrations/apple/calendars')).json.supported, false);
  assert.equal((await request('/api/integrations/apple/reminder-lists')).json.supported, false);
  assert.deepEqual(calls, []);
});

test('cached Apple all-day events follow the requested local day and keep the end exclusive', async (t) => {
  const allDay = {
    ...event(),
    start: '2026-10-06T22:00:00Z',
    end: '2026-10-07T22:00:00Z',
    allDay: true,
  };
  const { request, calls } = await fixture(t, { events: [allDay] });
  assert.equal(
    (await request('/api/integrations/apple/calendar/refresh', post(windowInput))).status,
    200
  );
  const count = calls.length;
  for (const [date, expected] of [
    ['2026-10-06', 0],
    ['2026-10-07', 1],
    ['2026-10-08', 0],
  ]) {
    const result = await request(`/api/today/sources?date=${date}&timezone=Europe/Warsaw`);
    assert.equal(result.status, 200);
    assert.equal(
      result.json.events.length,
      expected,
      `${date}: all-day range must follow local midnight`
    );
  }
  assert.equal(calls.length, count);
});
