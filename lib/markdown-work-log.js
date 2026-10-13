import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiError } from './config.js';
import { listRecordFiles } from './record-store.js';
import { workDate } from './work-log.js';

export function splitNative(data) {
  const settings = structuredClone(data || {});
  const cache = {};
  for (const kind of ['calendar', 'reminders']) {
    if (!settings[kind] || typeof settings[kind] !== 'object') continue;
    cache[kind] = {};
    for (const field of ['calendars', 'events', 'lists', 'items', 'lastSync', 'warnings']) {
      if (Object.hasOwn(settings[kind], field)) {
        cache[kind][field] = settings[kind][field];
        delete settings[kind][field];
      }
    }
  }
  return { settings, cache };
}
export function joinNative(settings, cache) {
  const result = structuredClone(settings || {});
  for (const kind of ['calendar', 'reminders'])
    if (result[kind] && cache[kind]) result[kind] = { ...result[kind], ...cache[kind] };
  return result;
}
export function createMarkdownWorkLog({ records, now = Date.now }) {
  function stateKey(key) {
    if (
      typeof key !== 'string' ||
      !/^(?:home|career|learning|main|checkin|focus|library)-[a-zA-Z0-9_-]{1,58}$/.test(key)
    )
      throw new ApiError('Invalid state key');
  }
  async function getState(key) {
    stateKey(key);
    const row = await records.read(key);
    const data =
      key === 'main-native-connections' && row.exists
        ? joinNative(row.data, await records.cached(key))
        : row.data;
    return { data, revision: row.revision, hash: row.hash, path: row.path };
  }
  async function putState(key, input) {
    stateKey(key);
    if (
      !input ||
      !Object.hasOwn(input, 'data') ||
      !Number.isInteger(input.revision) ||
      input.revision < 0 ||
      Object.keys(input).some((k) => !['data', 'revision', 'hash'].includes(k))
    )
      throw new ApiError('Invalid saved state');
    const json = JSON.stringify(input.data);
    if (typeof json !== 'string' || Buffer.byteLength(json) > 128 * 1024)
      throw new ApiError('Saved state exceeds 128 KiB', 413);
    const native = key === 'main-native-connections' ? splitNative(input.data) : null;
    const result = await records.write(key, native ? native.settings : input.data, input);
    if (native) await records.cached(key, native.cache);
    return result;
  }
  async function list({ date = workDate(now()), timezone = 'UTC' } = {}) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(Date.parse(date)) ||
      new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date
    )
      throw new ApiError('Invalid work day');
    try {
      new Intl.DateTimeFormat('en', { timeZone: timezone });
    } catch {
      throw new ApiError('Invalid timezone');
    }
    const entries = (await records.read(`work-completed-${date}`)).data || [];
    const all = (await records.read('work-sessions')).data || [];
    return {
      date,
      entries: [...entries].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id)),
      sessions: all.filter(
        (s) =>
          s.endedAt !== null &&
          workDate(s.startedAt, timezone) <= date &&
          workDate(s.endedAt, timezone) >= date
      ),
      active: all.find((s) => s.endedAt === null) || null,
    };
  }
  async function add(input) {
    if (
      !input ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date || '') ||
      Number.isNaN(Date.parse(input.date)) ||
      new Date(`${input.date}T12:00:00Z`).toISOString().slice(0, 10) !== input.date ||
      !z.string().trim().min(1).max(1200).safeParse(input.text).success
    )
      throw new ApiError('Add a dated work note of 1 to 1200 characters');
    const entry = { id: randomUUID(), text: input.text.trim(), createdAt: now() };
    await records.mutate(`work-completed-${input.date}`, (data) => {
      const rows = data || [];
      if (rows.length >= 100) throw new ApiError('This day already has 100 entries', 413);
      return [...rows, entry];
    });
    return entry;
  }
  async function remove(id) {
    if (!z.uuid().safeParse(id).success) throw new ApiError('Invalid work entry');
    const files = await listRecordFiles(records.root);
    for (const file of files.filter((f) => f.id.startsWith('work-completed-'))) {
      const { data } = await records.read(file.id);
      if (!data?.some((e) => e.id === id)) continue;
      await records.mutate(file.id, (rows) => rows.filter((e) => e.id !== id));
      return { ok: true };
    }
    throw new ApiError('Work entry not found', 404);
  }
  async function session(input) {
    if (
      !input ||
      !['start', 'end'].includes(input.action) ||
      Object.keys(input).some((k) => k !== 'action')
    )
      throw new ApiError('Invalid session action');
    await records.mutate('work-sessions', (data) => {
      const rows = data || [];
      const active = rows.find((s) => s.endedAt === null);
      if (input.action === 'start' && !active)
        return [...rows, { id: randomUUID(), startedAt: now(), endedAt: null }];
      if (input.action === 'end' && active)
        return rows.map((s) =>
          s.id === active.id ? { ...s, endedAt: Math.max(now(), s.startedAt) } : s
        );
      return rows;
    });
    return { ok: true };
  }
  return { getState, putState, list, add, remove, session, close: async () => {} };
}
