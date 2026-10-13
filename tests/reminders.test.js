import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Script } from 'node:vm';
import {
  createReminders,
  REMINDERS_BUFFER,
  REMINDERS_SCRIPT,
  REMINDERS_TIMEOUT,
} from '../lib/reminders.js';

test('Reminders is opt-in: construction and unsupported/empty calls never invoke runner', async () => {
  let calls = 0;
  const runner = async () => {
    calls++;
    throw new Error('must not run');
  };
  const unavailable = createReminders({ platform: 'linux', runner });
  assert.equal(calls, 0);
  assert.equal((await unavailable.listLists()).supported, false);
  await assert.rejects(unavailable.listItems({ lists: ['list-id'] }), /only on macOS/);
  const available = createReminders({ platform: 'darwin', runner });
  assert.deepEqual((await available.listItems({ lists: [] })).items, []);
  assert.equal(calls, 0);
});
test('fixed JXA reads only selected list references; arbitrary ID text stays JSON argv', async () => {
  new Script(REMINDERS_SCRIPT);
  const calls = [];
  const id = 'list-"; do shell script "touch /tmp/not-run" \\ 🌲';
  const adapter = createReminders({
    platform: 'darwin',
    runner: async (...args) => {
      calls.push(args);
      return {
        stdout: JSON.stringify({
          lists: [{ id, title: 'Same name' }],
          items: [
            {
              id: 'reminder-1',
              listId: id,
              listTitle: 'Same name',
              title: 'Observe a tree',
              notes: 'One detail',
              dueDate: '2026-10-07T10:00:00Z',
              completed: false,
            },
          ],
          warnings: [],
        }),
      };
    },
  });
  const result = await adapter.listItems({ lists: [{ id, title: 'Untrusted title' }] });
  assert.equal(result.items[0].id, 'reminder-1');
  assert.equal(result.items[0].dueDate, '2026-10-07T10:00:00.000Z');
  const [file, args, options] = calls[0];
  assert.equal(file, '/usr/bin/osascript');
  assert.equal(args[3], REMINDERS_SCRIPT);
  assert.ok(!args[3].includes(id));
  assert.deepEqual(JSON.parse(args.at(-1)), { operation: 'items', lists: [id] });
  assert.equal(options.timeout, REMINDERS_TIMEOUT);
  assert.equal(options.maxBuffer, REMINDERS_BUFFER);
  assert.equal(options.shell, false);
  assert.match(REMINDERS_SCRIPT, /app\.lists\.byId\(input\.lists\[i\]\)/);
  assert.ok(!/\.reminders\.push\(|\.delete\(|\.make\(|\.completed\s*=/.test(REMINDERS_SCRIPT));
});
test('list catalogs preserve same-name lists and bounded sanitized display data', async () => {
  const adapter = createReminders({
    platform: 'darwin',
    runner: async () => ({
      stdout: JSON.stringify({
        lists: [
          { id: 'one', title: 'Inbox' },
          { id: 'two', title: 'Inbox' },
          { id: 'one', title: 'Duplicate' },
          { id: 'bad\n', title: 'Hidden' },
          { id: 'three', title: `\u0000${'x'.repeat(200)}` },
        ],
      }),
    }),
  });
  const { lists } = await adapter.listLists();
  assert.deepEqual(lists.slice(0, 2), [
    { id: 'one', title: 'Inbox' },
    { id: 'two', title: 'Inbox' },
  ]);
  assert.equal(lists.length, 3);
  assert.equal(lists[2].title.length, 120);
});
test('invalid selection fails before app access; out-of-scope items are rejected', async () => {
  let calls = 0;
  const adapter = createReminders({
    platform: 'darwin',
    runner: async () => {
      calls++;
      return {
        stdout: JSON.stringify({
          lists: [{ id: 'one', title: 'Selected' }],
          items: [
            { id: 'r1', listId: 'other', title: 'Do not expose' },
            {
              id: 'r2',
              listId: 'one',
              title: 'x'.repeat(600),
              notes: 'y'.repeat(3000),
              dueDate: 'invalid',
              completed: true,
            },
          ],
          warnings: [],
        }),
      };
    },
  });
  for (const lists of [
    null,
    ['one', 'one'],
    Array.from({ length: 11 }, (_, i) => `list-${i}`),
    ['bad\n'],
    [{}],
  ])
    await assert.rejects(adapter.listItems({ lists }));
  assert.equal(calls, 0);
  const result = await adapter.listItems({ lists: ['one'] });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].title.length, 500);
  assert.equal(result.items[0].notes.length, 2000);
  assert.equal(result.items[0].dueDate, null);
  assert.equal(result.items[0].completed, true);
});
test('permission/timeout failures are clear and never expose runner stderr or private content', async () => {
  for (const [failure, expected] of [
    [{ stderr: 'Private note:SECRET -1743' }, /Privacy/],
    [{ killed: true, stderr: 'SECRET' }, /timed out/],
    [{ message: 'SECRET arbitrary failure' }, /Could not read/],
  ]) {
    const adapter = createReminders({
      platform: 'darwin',
      runner: async () => {
        throw failure;
      },
    });
    await assert.rejects(adapter.listLists(), (error) => {
      assert.match(error.message, expected);
      assert.ok(!error.message.includes('SECRET'));
      return true;
    });
  }
  const malformed = createReminders({
    platform: 'darwin',
    runner: async () => ({ stdout: 'not JSON PRIVATE' }),
  });
  await assert.rejects(malformed.listLists(), /invalid response/);
  const huge = createReminders({
    platform: 'darwin',
    runner: async () => ({ stdout: 'x'.repeat(REMINDERS_BUFFER + 1) }),
  });
  await assert.rejects(huge.listLists(), /oversized/);
});
