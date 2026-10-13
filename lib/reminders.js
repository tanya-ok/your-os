import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ApiError } from './config.js';

const execute = promisify(execFile);
export const REMINDERS_TIMEOUT = 20000;
export const REMINDERS_BUFFER = 512 * 1024;
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
// User choices are JSON argv, never script source or shell text. No app access occurs on import.
export const REMINDERS_SCRIPT = `function run(argv) {
  var input = JSON.parse(argv[0]);
  var app = Application('Reminders');
  function text(value, max) { return value === null || value === undefined ? '' : String(value).slice(0, max); }
  if (input.operation === 'lists') {
    var lists = app.lists.properties();
    return JSON.stringify({ lists: lists.slice(0, 1000).map(function(list) { return { id: text(list.id,256), title:text(list.name,120) }; }) });
  }
  var output = [], lists = [], warnings = [];
  for (var i = 0; i < input.lists.length; i++) {
    var list = app.lists.byId(input.lists[i]);
    if (!list.exists()) { warnings.push('A selected list is unavailable.'); continue; }
    var listTitle = text(list.name(),120);
    lists.push({id:input.lists[i],title:listTitle});
    var items = list.reminders.whose({completed:false}).properties();
    for(var j=0;j<items.length;j++) {
      if(output.length>=500) { warnings.push('Reminder items are limited to 500.'); break; }
      var item=items[j], due=null;
      if(item.dueDate) { var parsed=new Date(item.dueDate); if(!isNaN(parsed.getTime())) due=parsed.toISOString(); }
      output.push({id:text(item.id,256),listId:input.lists[i],listTitle:listTitle,title:text(item.name,500),notes:text(item.body,2000),dueDate:due,completed:!!item.completed});
    }
  }
  return JSON.stringify({lists:lists,items:output,warnings:warnings});
}`;

function parseOutput(stdout) {
  if (typeof stdout !== 'string' || Buffer.byteLength(stdout) > REMINDERS_BUFFER)
    throw new ApiError('Apple Reminders returned an oversized response', 502);
  try {
    const result = JSON.parse(stdout.trim());
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    return result;
  } catch {
    throw new ApiError('Apple Reminders returned an invalid response', 502);
  }
}
export function normalizeReminderSelection(lists) {
  if (!Array.isArray(lists) || lists.length > 10)
    throw new ApiError('Choose at most 10 reminder lists');
  const ids = lists.map((item) => (typeof item === 'string' ? item : item?.id));
  if (ids.some((id) => !validId(id)) || new Set(ids).size !== ids.length)
    throw new ApiError('Choose unique reminder list IDs');
  return ids;
}
export function createReminders({ platform = process.platform, runner = execute } = {}) {
  const supported = platform === 'darwin';
  async function run(input) {
    if (!supported) throw new ApiError('Apple Reminders is available only on macOS', 503);
    try {
      const { stdout } = await runner(
        '/usr/bin/osascript',
        ['-l', 'JavaScript', '-e', REMINDERS_SCRIPT, '--', JSON.stringify(input)],
        {
          timeout: REMINDERS_TIMEOUT,
          maxBuffer: REMINDERS_BUFFER,
          encoding: 'utf8',
          shell: false,
          killSignal: 'SIGTERM',
        }
      );
      return parseOutput(stdout);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      const detail = `${String(error?.stderr || '')} ${String(error?.message || '')}`;
      if (/-1743|not authorized|not permitted/i.test(detail))
        throw new ApiError(
          'Allow this app to read Reminders in macOS Privacy & Security > Automation, then connect again',
          403
        );
      if (error?.killed || error?.code === 'ETIMEDOUT')
        throw new ApiError('Apple Reminders timed out; no reminders were changed', 504);
      throw new ApiError(
        'Could not read Apple Reminders; check macOS permission and try again',
        502
      );
    }
  }
  return {
    async listLists() {
      if (!supported)
        return {
          supported: false,
          readOnly: true,
          lists: [],
          message: 'Apple Reminders is available only on macOS',
        };
      const result = await run({ operation: 'lists' });
      if (!Array.isArray(result.lists) || result.lists.length > 1000)
        throw new ApiError('Apple Reminders returned an invalid list catalog', 502);
      const seen = new Set();
      const lists = result.lists
        .filter((item) => validId(item?.id) && !seen.has(item.id) && seen.add(item.id))
        .map((item) => ({ id: item.id, title: clean(item.title, 120) || 'Untitled list' }));
      return { supported: true, readOnly: true, lists };
    },
    async listItems({ lists } = {}) {
      const ids = normalizeReminderSelection(lists);
      if (!supported) throw new ApiError('Apple Reminders is available only on macOS', 503);
      if (!ids.length)
        return { supported: true, readOnly: true, lists: [], items: [], warnings: [] };
      const result = await run({ operation: 'items', lists: ids });
      if (!Array.isArray(result.items) || result.items.length > 500 || !Array.isArray(result.lists))
        throw new ApiError('Apple Reminders returned invalid items', 502);
      const seen = new Set();
      const items = result.items
        .filter(
          (item) =>
            validId(item?.id) &&
            ids.includes(item.listId) &&
            !seen.has(`${item.listId}:${item.id}`) &&
            seen.add(`${item.listId}:${item.id}`)
        )
        .map((item) => ({
          id: item.id,
          listId: item.listId,
          listTitle: clean(item.listTitle, 120),
          title: clean(item.title, 500) || 'Untitled reminder',
          notes: clean(item.notes, 2000),
          dueDate:
            typeof item.dueDate === 'string' && Number.isFinite(Date.parse(item.dueDate))
              ? new Date(item.dueDate).toISOString()
              : null,
          completed: item.completed === true,
        }));
      return {
        supported: true,
        readOnly: true,
        lists: result.lists
          .filter((item) => ids.includes(item?.id))
          .map((item) => ({ id: item.id, title: clean(item.title, 120) })),
        items,
        warnings: Array.isArray(result.warnings)
          ? result.warnings.slice(0, 10).map((value) => clean(value, 200))
          : [],
      };
    },
  };
}
