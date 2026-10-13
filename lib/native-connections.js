import { ApiError } from './config.js';

const KEY = 'main-native-connections';
function boundedCache(value, field) {
  let trimmed = false;
  while (Buffer.byteLength(JSON.stringify(value)) > 56 * 1024 && value[field].length) {
    value[field].pop();
    trimmed = true;
  }
  if (trimmed)
    value.warnings.push(
      'The local cache size limit was reached. Select fewer sources for a complete view.'
    );
  return value;
}
const clean = (value, max = 300) => String(value || '').slice(0, max);
export function createNativeConnections({
  store,
  reminders,
  calendar,
  platform = process.platform,
  now = Date.now,
}) {
  async function read() {
    const saved = await store.getState(KEY);
    return { saved, data: saved.data || {} };
  }
  async function status() {
    const { data } = await read();
    return {
      supported: platform === 'darwin',
      calendar: data.calendar || null,
      reminders: data.reminders || null,
    };
  }
  async function update(patch) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { saved, data } = await read();
      try {
        await store.putState(KEY, {
          data: { ...data, ...patch },
          revision: saved.revision,
          ...(saved.hash !== undefined ? { hash: saved.hash } : {}),
        });
        return status();
      } catch (error) {
        if (error.status !== 409 || attempt === 2) throw error;
      }
    }
  }
  async function refreshCalendar(input) {
    if (!input || Object.keys(input).some((key) => !['calendarIds', 'start', 'end'].includes(key)))
      throw new ApiError('Invalid calendar request');
    const result = await calendar.listEvents(input);
    const selected = await calendar.listCalendars();
    const events = result.events.slice(0, 100).map((event) => ({
      id: `apple-${clean(event.id, 512)}`,
      calendarId: clean(event.calendarId, 512),
      title: clean(event.title),
      start: event.start,
      end: event.end,
      allDay: event.allDay === true,
      sourceId: 'apple-calendar',
      sourceTitle: 'Apple Calendar',
      editable: false,
    }));
    return update({
      calendar: boundedCache(
        {
          calendarIds: input.calendarIds,
          calendars: selected.calendars.filter((item) => input.calendarIds.includes(item.id)),
          events,
          lastSync: new Date(now()).toISOString(),
          warnings: [
            ...(result.warnings || []),
            ...(result.events.length > 100
              ? ['Only the first 100 events are cached. Select fewer calendars for a smaller view.']
              : []),
          ],
        },
        'events'
      ),
    });
  }
  async function refreshReminders(input) {
    if (!input || Object.keys(input).some((key) => key !== 'lists'))
      throw new ApiError('Invalid reminders request');
    const result = await reminders.listItems(input);
    const items = result.items.slice(0, 200).map((item) => ({
      id: clean(item.id, 512),
      listId: clean(item.listId, 512),
      listTitle: clean(item.listTitle),
      title: clean(item.title),
      dueDate: item.dueDate || null,
      completed: item.completed === true,
    }));
    return update({
      reminders: boundedCache(
        {
          listIds: result.lists.map((item) => item.id),
          lists: result.lists,
          items,
          lastSync: new Date(now()).toISOString(),
          warnings: [
            ...(result.warnings || []),
            ...(result.items.length > 200
              ? ['Only the first 200 reminders are cached. Select fewer lists for a smaller view.']
              : []),
          ],
        },
        'items'
      ),
    });
  }
  async function eventsForRange({ date, days = 1, timezone = 'UTC' }) {
    const { calendar: cached } = await status();
    if (!cached) return [];
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const start = new Date(`${date}T12:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + Number(days));
    const endDate = end.toISOString().slice(0, 10);
    return cached.events.filter((event) => {
      const first = day.format(new Date(event.start));
      const last = day.format(new Date(new Date(event.end).getTime() - 1));
      return first < endDate && last >= date;
    });
  }
  return {
    status,
    refreshCalendar,
    refreshReminders,
    eventsForRange,
    disconnect: () => update({ calendar: null, reminders: null }),
  };
}
