/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { harness, makeItem } = require('./test-native-alarms.cjs');
let now = new Date(2026, 8, 24, 21, 56).getTime();
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
// Exercise the actual Home filter without rendering unrelated UI.
const home = fs.readFileSync(path.join(__dirname, '../app/screens/home/HomeScreen.tsx'), 'utf8');
const start = home.indexOf('function matchesDateFilter(');
const end = home.indexOf('\nfunction ', start + 1);
const filterSource = home.slice(start, end > start ? end : home.indexOf('export default', start));
const filterCode = ts.transpileModule(filterSource, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
const context = { Date, matchesDateFilter: undefined };
vm.runInNewContext(filterCode, context);

async function run() {
  const nativeSource = fs.readFileSync(path.join(__dirname, '../plugins/native-alarm/AlarmStore.kt'), 'utf8');
  const dismiss = nativeSource.match(/if \(intent.action == "dismiss"\) \{([\s\S]*?)\n    \}/)[1];
  assert.match(dismiss, /AlarmService.instance\?\.remove/);
  assert.doesNotMatch(dismiss, /cancel\(|schedule\(|prefs|done:|complete/i,
    'Dismiss removes ringing service state only; never writes Done or cancels the durable series');
  assert.ok(nativeSource.indexOf('schedule(c, data, maxOf(due') < nativeSource.indexOf('c.startForegroundService(service)'),
    'future alarm is rearmed before current alarm/Dismiss UI is started');
  for (const type of ['reminder', 'task']) {
    now = new Date(2026, 8, 24, 21, 56).getTime();
    const h = harness('android', Clock);
    let storage = h.load('services/itemStorage.ts');
    const recurrence = h.load('utils/dailyRecurrence.ts');
    const status = h.load('utils/itemStatus.ts');
    const first = makeItem({ id: type, type, title: 'Daily Report', description: 'Send summary', category: 'Work', priority: 'High',
      repeat: 'daily', startAt: new Clock(2026, 8, 24, 22).toISOString(),
      createdAt: new Clock().toISOString(), updatedAt: new Clock().toISOString(), notes: 'Keep this metadata' });
    await storage.saveItem(first);
    await storage.saveItem(first);
    let rows = await storage.getItems();
    assert.equal(rows.filter(row => row.startAt === first.startAt).length, 1);
    const nextId = `daily:${type}:2026-09-25`;
    const tomorrow = rows.find(row => row.id === nextId);
    assert.ok(tomorrow);
    assert.equal(new Date(tomorrow.startAt).getHours(), 22);
    assert.equal(status.getItemStatus(tomorrow), 'Pending');
    for (const key of ['title', 'description', 'category', 'priority', 'notes', 'repeat']) assert.equal(tomorrow[key], first[key]);
    assert.equal(tomorrow.alertBefore.minutes, 5);
    assert.equal(h.alarms.size, 1, 'one durable native series, not duplicate alarms per projected row');
    assert.equal(h.expo.size, 0, 'native Daily pre-alert must not also be scheduled through Expo');
    assert.equal([...h.alarms.values()][0].preAlertMinutes, 5);
    assert.equal(h.popups.length, 0, 'expired initial pre-alert does not reject/save or warn');

    h.alarms.clear();
    h.restart(); storage = h.load('services/itemStorage.ts');
    await storage.getItems(); await storage.getItems();
    assert.equal(h.alarms.size, 1, 'restart repairs a missing Daily main/pre-alert pair exactly once');
    assert.equal([...h.alarms.values()][0].preAlertMinutes, 5);
    assert.equal(h.expo.size, 0);

    await Promise.all([storage.toggleComplete(first.id, ' Report sent '), storage.toggleComplete(first.id, 'duplicate')]);
    rows = await storage.getItems();
    const done = rows.find(row => row.id === first.id);
    assert.equal(status.getItemStatus(done), 'Done'); assert.equal(done.completionNote, 'Report sent');
    assert.equal(done.startAt, first.startAt); assert.ok(done.completedAt);
    assert.equal(rows.filter(row => row.id === nextId).length, 1);
    assert.equal(status.getItemStatus(rows.find(row => row.id === nextId)), 'Pending');
    assert.ok([...h.alarms.values()][0].excludedDates.includes('2026-09-24'));
    const filter = name => rows.filter(row => context.matchesDateFilter(row.startAt, name, new Clock(), true));
    assert.deepEqual(Array.from(filter('Today'), row => row.id), [type]);
    assert.deepEqual(Array.from(filter('Tomorrow'), row => row.id), [nextId]);
    assert.equal(filter('This Week').length, 4); // Thu–Sun, only dates since series start.
    assert.equal(filter('This Month').length, 7);
    now = new Date(2026, 8, 26, 12).getTime();
    assert.ok(filter('This Week').some(row => row.id === type), 'current-week completed history remains visible');
    assert.ok(filter('This Month').some(row => row.id === type), 'current-month completed history remains visible');

    // Reload JS/storage after days closed: history and missing dated rows survive.
    h.restart(); storage = h.load('services/itemStorage.ts');
    now = new Date(2026, 10, 2, 12).getTime();
    rows = await storage.getItems();
    assert.ok(rows.some(row => row.id === `daily:${type}:2026-11-02`));
    assert.equal(rows.filter(row => row.id === nextId).length, 1);
    assert.equal(rows.find(row => row.id === type).completionNote, 'Report sent');
    const count = rows.length; await storage.getItems(); assert.equal((await storage.getItems()).length, count);
    assert.equal(h.alarms.size, 1);

    const current = rows.find(row => row.id === `daily:${type}:2026-11-02`);
    await storage.updateItem({ ...current, repeat: 'none' });
    rows = await storage.getItems();
    assert.equal(rows.find(row => row.id === type).status, 'Done');
    assert.equal(rows.find(row => row.id === current.id).repeat, 'none');
    assert.ok(!rows.some(row => row.seriesId === type && new Date(row.startAt) > new Date(current.startAt)));
    assert.ok(![...h.alarms.values()].some(alarm => alarm.repeat === 'daily'));
    assert.equal([...h.alarms.values()][0].repeat, 'none');
    h.restart(); assert.equal((await h.load('services/itemStorage.ts').getItems()).length, rows.length);

    // Calendar construction preserves wall-clock time through DST and month/year ends.
    for (const date of [new Date(2026, 2, 7, 22), new Date(2026, 9, 31, 22), new Date(2026, 11, 31, 22)]) {
      const seed = recurrence.attachDailySeries({ ...first, id: 'dst', startAt: date.toISOString() });
      const generated = recurrence.materializeDaily([seed], date);
      assert.ok(generated.length > 1);
      assert.ok(generated.every(row => new Date(row.startAt).getHours() === 22));
    }
  }
  now = new Date(2026, 8, 24, 20).getTime();
  const edits = harness('android', Clock);
  const editStorage = edits.load('services/itemStorage.ts');
  await editStorage.saveItem(makeItem({ id: 'edit-series', repeat: 'daily', startAt: new Clock(2026, 8, 24, 22).toISOString() }));
  const editing = await editStorage.getItemById('daily:edit-series:2026-09-25');
  await editStorage.updateItem({ ...editing, title: 'Updated', startAt: new Clock(2026, 8, 25, 23).toISOString() });
  assert.ok([...edits.alarms.values()].some(alarm => alarm.itemId === 'edit-series' && alarm.repeat === 'none'), 'editing tomorrow preserves today alarm');
  assert.equal((await editStorage.getItemById('daily:edit-series:2026-09-26')).title, 'Updated');
  assert.equal(new Date((await editStorage.getItemById('daily:edit-series:2026-09-26')).startAt).getHours(), 23);
  assert.equal((await editStorage.getItemById('edit-series')).title, 'Read');
  const failed = harness('android', Clock); failed.setFail(true);
  await failed.load('services/itemStorage.ts').saveItem(makeItem({ id: 'retry', repeat: 'daily', startAt: new Clock(2026, 8, 24, 22).toISOString() }));
  failed.setFail(false); failed.restart();
  await failed.load('services/itemStorage.ts').getItems();
  assert.equal(failed.alarms.size, 1, 'durable dirty state retries failed scheduling after restart');
  console.log('PASS Daily dated rows, history/note, metadata, duplicate completion, all date filters, native pre-alert contract, restart/backfill, Repeat None, DST/calendar arithmetic');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
