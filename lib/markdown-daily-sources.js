import { randomUUID } from 'node:crypto';
import { basename, dirname } from 'node:path';
import { ApiError } from './config.js';
import { createDailySources, validateFeedUrl } from './daily-sources.js';
import { readSafe } from './safe-path.js';
import { atomicWrite } from './writer.js';

export function createMarkdownDailySources({
  records,
  credentialsPath,
  databasePath,
  fetchFeed,
  now = Date.now,
}) {
  const cache = createDailySources({
    databasePath,
    ...(fetchFeed ? { fetchFeed } : {}),
    now,
    demo: false,
  });
  const credentialsRoot = dirname(credentialsPath);
  async function credentials() {
    const file = await readSafe(credentialsRoot, basename(credentialsPath));
    if (!file.exists) return {};
    try {
      return JSON.parse(file.text);
    } catch {
      throw new ApiError('Connection credentials are unavailable', 409);
    }
  }
  async function sources() {
    const rows = (await records.read('settings-sources')).data || [];
    const secrets = await credentials();
    return rows.map((row) => {
      const url = row.public_url || secrets[row.credentialRef];
      if (!url) throw new ApiError('A source credential reference is unavailable', 409);
      return { ...row, url: validateFeedUrl(url) };
    });
  }
  async function hydrate() {
    const rows = await sources();
    cache.replaceSourceDefinitions(rows);
    return rows;
  }
  async function list(input = {}) {
    await hydrate();
    const data = await cache.list(input);
    const date =
      input.date ||
      new Intl.DateTimeFormat('en-CA', {
        timeZone: input.timezone || 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(now()));
    const endDate = new Date(`${date}T12:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + Number(input.days || 1));
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: input.timezone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const local = (await records.read('calendar-local-events')).data || [];
    data.events = data.events.filter((e) => e.sourceId !== 'local');
    for (const event of local) {
      const first = event.allDay ? event.start : day.format(new Date(event.start));
      const last = event.allDay
        ? event.end
        : day.format(new Date(new Date(event.end).getTime() - 1));
      if (first < endDate.toISOString().slice(0, 10) && (event.allDay ? last > date : last >= date))
        data.events.push(event);
    }
    data.events.sort((a, b) => a.start.localeCompare(b.start));
    return data;
  }
  async function add(input) {
    if (
      !input ||
      !['calendar', 'rss'].includes(input.kind) ||
      typeof input.title !== 'string' ||
      !input.title.trim()
    )
      throw new ApiError('Choose a source type and title');
    const url = validateFeedUrl(input.url);
    const row = { id: randomUUID(), kind: input.kind, title: input.title.trim().slice(0, 80) };
    row.credentialRef = `source-${row.id}`;
    await records.mutate('settings-sources', async (data) => {
      const rows = data || [];
      if (rows.length >= 10) throw new ApiError('Sources are limited to 10');
      const secrets = await credentials();
      if (
        rows.some(
          (item) =>
            item.kind === row.kind && (item.public_url || secrets[item.credentialRef]) === url
        )
      )
        throw new ApiError('This source is already added');
      await atomicWrite(
        credentialsPath,
        `${JSON.stringify({ ...secrets, [row.credentialRef]: url }, null, 2)}\n`
      );
      return [...rows, row];
    });
    await hydrate();
    return { ...row, url, lastFetched: null, error: null };
  }
  async function remove(id) {
    await records.mutate('settings-sources', (rows) => {
      if (!rows?.some((row) => row.id === id)) throw new ApiError('Source not found');
      return rows.filter((row) => row.id !== id);
    });
    await hydrate();
    return { removed: true };
  }
  async function refresh(id) {
    await hydrate();
    return cache.refresh(id);
  }
  async function saveEvent(input) {
    if (!input || typeof input.title !== 'string' || !input.title.trim())
      throw new ApiError('Event title is required');
    const allDay = Boolean(input.allDay);
    let start, end;
    if (allDay) {
      start = String(input.start || '').slice(0, 10);
      end = String(input.end || '').slice(0, 10);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
        Number.isNaN(Date.parse(start)) ||
        new Date(start).toISOString().slice(0, 10) !== start
      )
        throw new ApiError('Invalid calendar date');
      if (!end) end = new Date(Date.parse(start) + 86400000).toISOString().slice(0, 10);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(end) ||
        Number.isNaN(Date.parse(end)) ||
        new Date(end).toISOString().slice(0, 10) !== end ||
        end <= start
      )
        throw new ApiError('All-day end must follow start');
    } else {
      if (
        !input.start ||
        !input.end ||
        Number.isNaN(Date.parse(input.start)) ||
        Number.isNaN(Date.parse(input.end)) ||
        Date.parse(input.end) <= Date.parse(input.start)
      )
        throw new ApiError('Provide event start and end with end after start');
      start = new Date(input.start).toISOString();
      end = new Date(input.end).toISOString();
    }
    let url = '';
    if (input.url) {
      try {
        const value = new URL(input.url);
        if (['http:', 'https:'].includes(value.protocol) && !value.username && !value.password)
          url = value.href;
      } catch {
        /* An invalid optional link is left empty. */
      }
    }
    const event = {
      id: input.id || `local-${randomUUID()}`,
      sourceId: 'local',
      title: input.title.trim().slice(0, 300),
      start,
      end,
      allDay,
      location: String(input.location || '').slice(0, 300),
      url,
      editable: true,
    };
    await records.mutate('calendar-local-events', (data) => {
      const rows = data || [];
      if (input.id && !rows.some((row) => row.id === input.id))
        throw new ApiError('Local event not found');
      if (!input.id && rows.length >= 1000) throw new ApiError('Local events are limited to 1000');
      return input.id
        ? rows.map((row) => (row.id === input.id ? { ...row, ...event } : row))
        : [...rows, event];
    });
    return event;
  }
  async function removeEvent(id) {
    await records.mutate('calendar-local-events', (rows) => {
      if (!rows?.some((row) => row.id === id)) throw new ApiError('Local event not found');
      return rows.filter((row) => row.id !== id);
    });
    return { removed: true };
  }
  return { list, add, remove, refresh, saveEvent, removeEvent, close: cache.close };
}
