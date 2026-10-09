/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { harness, makeItem } = require('./test-native-alarms.cjs');
let now;
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const home = fs.readFileSync(path.join(__dirname, '../app/screens/home/HomeScreen.tsx'), 'utf8');
const start = home.indexOf('function matchesDateFilter(');
const end = home.indexOf('\nfunction ', start + 1);
const context = { Date: Clock };
vm.runInNewContext(ts.transpileModule(home.slice(start, end > start ? end : home.indexOf('export default', start)), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, context);
const at = (month, day, hour = 10, minute = 0) => new Clock(2026, month - 1, day, hour, minute);
const id = date => `weekly:team:${date}`;
async function run() {
  for (const zone of ['Asia/Kolkata', 'America/New_York', 'UTC']) {
    process.env.TZ = zone;
    now = at(9, 28, 9, 56).getTime();
    const h = harness('android', Clock);
    let storage = h.load('services/itemStorage.ts');
    const helper = h.load('utils/weeklyRecurrence.ts');
    for (const [from, to] of [[at(9, 28), at(9, 30)], [at(9, 30), at(10, 2)], [at(10, 2), at(10, 5)]]) {
      assert.equal(helper.nextWeeklyOccurrence(from, [1, 3, 5]).getTime(), to.getTime());
    }
    assert.equal(helper.nextWeeklyOccurrence(at(9, 30), [3]).getTime(), at(10, 7).getTime());
    assert.throws(() => helper.nextWeeklyOccurrence(at(9, 30), []), /weekday/);
    assert.deepEqual(Array.from(helper.normalizeWeeklyDays([5, 1, 3, 3])), [1, 3, 5]);
    const first = makeItem({ id: 'team', repeat: 'weekly', weeklyDays: [1, 3, 5], startAt: at(9, 28).toISOString(),
      title: 'Team Review', description: 'Review work', category: 'Work', priority: 'High', notes: 'Agenda' });
    await storage.saveItem(first); await storage.saveItem(first);
    let rows = await storage.getItems();
    assert.equal(rows.filter(row => row.startAt === first.startAt).length, 1);
    assert.ok(rows.some(row => row.id === id('2026-09-30')));
    assert.ok(rows.some(row => row.id === id('2026-10-02')));
    assert.ok(rows.every(row => [1, 3, 5].includes(new Date(row.startAt).getDay())));
    assert.ok(rows.every(row => new Date(row.startAt).getHours() === 10));
    for (const row of rows) {
      for (const key of ['title', 'description', 'category', 'priority', 'notes', 'repeat']) assert.equal(row[key], first[key]);
      assert.deepEqual(Array.from(row.weeklyDays), [1, 3, 5]);
      assert.equal(row.alertBefore.minutes, 5);
    }
    assert.equal(h.alarms.size, 1); assert.equal(h.expo.size, 0); assert.equal(h.popups.length, 0);
    assert.equal([...h.alarms.values()][0].preAlertMinutes, 5);
    assert.deepEqual([...h.alarms.values()][0].weeklyDays, [1, 3, 5]);
    const filtered = name => rows.filter(row => context.matchesDateFilter(row.startAt, name, new Clock(), true));
    assert.deepEqual(Array.from(filtered('Today'), row => row.id), ['team']);
    assert.equal(filtered('Tomorrow').length, 0);
    assert.equal(filtered('This Week').length, 3);
    assert.equal(filtered('This Month').length, 2);
    await storage.toggleComplete('team', ' Reviewed ');
    rows = await storage.getItems();
    const done = rows.find(row => row.id === 'team');
    assert.equal(done.status, 'Done'); assert.equal(done.completionNote, 'Reviewed');
    assert.equal(done.startAt, first.startAt);
    assert.equal(rows.find(row => row.id === id('2026-09-30')).completed, false);
    assert.ok([...h.alarms.values()][0].excludedDates.includes('2026-09-28'));
    // Simulate lost native storage and a fresh JS runtime; reconcile repairs the schedule.
    h.alarms.clear();
    h.editStoredItems(stored => stored.filter(row => row.id !== id('2026-09-30')));
    h.restart(); storage = h.load('services/itemStorage.ts');
    const repaired = await storage.getItems(); assert.equal(h.alarms.size, 1);
    assert.equal(repaired.filter(row => row.id === id('2026-09-30')).length, 1, 'missing occurrence restored exactly once');
    now = at(11, 2, 9).getTime(); h.restart(); storage = h.load('services/itemStorage.ts');
    rows = await storage.getItems();
    assert.ok(rows.some(row => row.id === id('2026-11-02')));
    const count = rows.length;
    await storage.getItems(); assert.equal((await storage.getItems()).length, count);
    assert.equal(rows.find(row => row.id === 'team').completionNote, 'Reviewed');
    const history = rows.filter(row => new Date(row.startAt).getTime() < now).map(row => JSON.stringify({ ...row, dailySeries: undefined }));
    // Edit Monday to Tue/Thu: current editable row aligns to Tuesday, all future rows use new clock/pre-alert.
    const editing = rows.find(row => row.id === id('2026-11-02'));
    await storage.updateItem({ ...editing, weeklyDays: [2, 4], startAt: at(11, 2, 11).toISOString(), alertBefore: { label: '10 minutes', minutes: 10 } });
    rows = await storage.getItems();
    assert.deepEqual(rows.filter(row => new Date(row.startAt).getTime() < now).map(row => JSON.stringify({ ...row, dailySeries: undefined })), history);
    const future = rows.filter(row => new Date(row.startAt).getTime() >= now);
    assert.ok(future.length > 2);
    assert.ok(future.every(row => [2, 4].includes(new Date(row.startAt).getDay())));
    assert.ok(future.every(row => new Date(row.startAt).getHours() === 11 && row.alertBefore.minutes === 10));
    assert.equal(h.alarms.size, 1); assert.equal([...h.alarms.values()][0].preAlertMinutes, 10);
    const current = rows.find(row => row.id === editing.id);
    await storage.updateItem({ ...current, repeat: 'none', weeklyDays: undefined });
    rows = await storage.getItems();
    assert.equal(rows.find(row => row.id === 'team').completionNote, 'Reviewed');
    assert.equal(rows.filter(row => new Date(row.startAt).getTime() >= now).length, 1);
    assert.equal([...h.alarms.values()][0].repeat, 'none');
    assert.equal(h.alarms.size, 1);
    h.restart(); assert.equal((await h.load('services/itemStorage.ts').getItems()).length, rows.length);
    // DST and year boundary calculations retain local clock time.
    for (const [from, days, to] of [[at(3, 6), [1, 3, 5], at(3, 9)], [at(10, 30), [1, 3, 5], at(11, 2)],
      [at(12, 30), [3], new Date(2027, 0, 6, 10)]]) {
      assert.equal(helper.nextWeeklyOccurrence(from, days).getTime(), to.getTime());
    }
  }
  now = at(9, 28, 9).getTime();
  const retry = harness('android', Clock); retry.setFail(true);
  await retry.load('services/itemStorage.ts').saveItem(makeItem({ id: 'retry', repeat: 'weekly', weeklyDays: [1, 3], startAt: at(9, 28).toISOString() }));
  retry.setFail(false); retry.restart(); await retry.load('services/itemStorage.ts').getItems();
  assert.equal(retry.alarms.size, 1, 'interrupted scheduling repaired');
  const source = fs.readFileSync(path.join(__dirname, '../plugins/native-alarm/AlarmStore.kt'), 'utf8');
  const dismiss = source.match(/if \(intent.action == "dismiss"\) \{([\s\S]*?)\n    \}/)[1];
  assert.doesNotMatch(dismiss, /cancel\(|schedule\(|prefs|done:|complete/i);
  assert.ok(source.indexOf('schedule(c, data, maxOf(due') < source.indexOf('c.startForegroundService(service)'));
  const plugin = fs.readFileSync(path.join(__dirname, '../plugins/withNativeAlarm.js'), 'utf8');
  assert.match(plugin, /RECEIVE_BOOT_COMPLETED/); assert.match(plugin, /android.intent.action.BOOT_COMPLETED/);
  assert.match(source, /AlarmStore.restore\(context\)/);
  assert.match(source, /if \(!allowed\(c\)\) return/);
  console.log('PASS Weekly helpers, generation, metadata, Done/note, filters, edits, None, restart/repair, duplicates, DST; native Dismiss/re-arm/boot wiring contracts');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
