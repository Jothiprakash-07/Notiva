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
const at = (month, day, hour = 9, minute = 0) => new Clock(2026, month - 1, day, hour, minute);
const id = date => `weekdays:office:${date}`;
const home = fs.readFileSync(path.join(__dirname, '../app/screens/home/HomeScreen.tsx'), 'utf8');
const start = home.indexOf('function matchesDateFilter(');
const end = home.indexOf('\nfunction ', start + 1);
const context = { Date: Clock };
vm.runInNewContext(ts.transpileModule(home.slice(start, end > start ? end : home.indexOf('export default', start)), {
  compilerOptions: { target: ts.ScriptTarget.ES2020 },
}).outputText, context);
async function run() {
  for (const zone of ['Asia/Kolkata', 'America/New_York', 'UTC']) {
    process.env.TZ = zone;
    now = at(9, 25, 8, 56).getTime();
    const h = harness('android', Clock);
    let storage = h.load('services/itemStorage.ts');
    const helper = h.load('utils/weeklyRecurrence.ts');
    for (const [from, to] of [[21, 22], [22, 23], [23, 24], [24, 25], [25, 28], [26, 28], [27, 28]]) {
      const next = helper.nextWeekdayOccurrence(at(9, from, 9, 17));
      assert.equal(next.getTime(), at(9, to, 9, 17).getTime(), `${zone}: day ${from} -> ${to}`);
    }
    for (const [from, to] of [[at(3, 6), at(3, 9)], [at(10, 30), at(11, 2)],
      [at(12, 31), new Date(2027, 0, 1, 9)]]) {
      assert.equal(helper.nextWeekdayOccurrence(from).getTime(), to.getTime());
    }
    const first = makeItem({ id: 'office', repeat: 'weekdays', weeklyDays: [0, 6], startAt: at(9, 21).toISOString(),
      title: 'Daily Office Report', description: 'Send report', category: 'Work', priority: 'High', notes: 'Office metadata' });
    await storage.saveItem(first); await storage.saveItem(first);
    let rows = await storage.getItems();
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
    assert.ok(rows.every(row => [1, 2, 3, 4, 5].includes(new Date(row.startAt).getDay())));
    for (const row of rows) {
      assert.equal(new Date(row.startAt).getHours(), 9);
      assert.equal(row.seriesId, 'office'); assert.equal(row.weeklyDays, undefined, 'Weekdays ignores selectable Weekly metadata');
      for (const key of ['title', 'description', 'category', 'priority', 'notes', 'repeat']) assert.equal(row[key], first[key]);
      assert.equal(row.alertBefore.minutes, 5);
    }
    const filter = name => rows.filter(row => context.matchesDateFilter(row.startAt, name, new Clock(), true));
    assert.deepEqual(Array.from(filter('Today'), row => row.id), [id('2026-09-25')]);
    assert.equal(filter('Tomorrow').length, 0); assert.equal(filter('This Week').length, 5); assert.equal(filter('This Month').length, 8);
    now = at(9, 26).getTime(); assert.equal(filter('Tomorrow').length, 0);
    now = at(9, 27).getTime(); assert.deepEqual(Array.from(filter('Tomorrow'), row => row.id), [id('2026-09-28')]);
    now = at(9, 25, 8, 56).getTime();
    assert.equal(h.alarms.size, 1); assert.equal(h.expo.size, 0); assert.equal(h.popups.length, 0);
    assert.equal([...h.alarms.values()][0].repeat, 'weekdays');
    assert.equal([...h.alarms.values()][0].preAlertMinutes, 5);
    await storage.toggleComplete(id('2026-09-25'), ' Sent Friday report ');
    rows = await storage.getItems();
    const friday = rows.find(row => row.id === id('2026-09-25'));
    assert.equal(friday.status, 'Done'); assert.equal(friday.completionNote, 'Sent Friday report');
    assert.equal(friday.startAt, at(9, 25).toISOString());
    assert.equal(rows.find(row => row.id === id('2026-09-28')).completed, false);
    assert.ok([...h.alarms.values()][0].excludedDates.includes('2026-09-25'));
    h.editStoredItems(stored => stored.filter(row => row.id !== id('2026-09-28')));
    h.alarms.clear(); h.restart(); storage = h.load('services/itemStorage.ts');
    rows = await storage.getItems(); assert.equal(h.alarms.size, 1);
    assert.equal(rows.filter(row => row.id === id('2026-09-28')).length, 1);
    const count = rows.length; await storage.getItems(); assert.equal((await storage.getItems()).length, count);
    now = at(11, 2, 8).getTime(); h.restart(); storage = h.load('services/itemStorage.ts');
    rows = await storage.getItems();
    const editing = rows.find(row => row.id === id('2026-11-02')); assert.ok(editing);
    const history = () => rows.filter(row => new Date(row.startAt).getTime() < now).map(row => JSON.stringify({ ...row, dailySeries: undefined }));
    const before = history();
    await storage.updateItem({ ...editing, startAt: at(11, 2, 10).toISOString(), alertBefore: { label: '10 minutes', minutes: 10 } });
    rows = await storage.getItems(); assert.deepEqual(history(), before);
    assert.ok(rows.filter(row => new Date(row.startAt).getTime() >= now).every(row => new Date(row.startAt).getHours() === 10 && row.alertBefore.minutes === 10));
    assert.equal(h.alarms.size, 1); assert.equal([...h.alarms.values()][0].preAlertMinutes, 10);
    await storage.updateItem({ ...rows.find(row => row.id === editing.id), repeat: 'none' });
    rows = await storage.getItems(); assert.deepEqual(history(), before);
    assert.equal(rows.filter(row => new Date(row.startAt).getTime() >= now).length, 1);
    assert.equal(h.alarms.size, 1); assert.equal([...h.alarms.values()][0].repeat, 'none');
    h.restart(); assert.equal((await h.load('services/itemStorage.ts').getItems()).length, rows.length);
    const weekend = harness('android', Clock);
    for (const day of [7, 8]) { // November Saturday/Sunday
      const saved = await weekend.load('services/itemStorage.ts').saveItem(makeItem({ id: `weekend-${day}`, repeat: 'weekdays', startAt: at(11, day).toISOString() }));
      assert.equal(saved.startAt, at(11, 9).toISOString());
    }
  }
  const retry = harness('android', Clock); retry.setFail(true);
  await retry.load('services/itemStorage.ts').saveItem(makeItem({ id: 'retry', repeat: 'weekdays', startAt: at(11, 3).toISOString() }));
  retry.setFail(false); retry.restart(); await retry.load('services/itemStorage.ts').getItems();
  assert.equal(retry.alarms.size, 1);
  const source = fs.readFileSync(path.join(__dirname, '../plugins/native-alarm/AlarmStore.kt'), 'utf8');
  const dismiss = source.match(/if \(intent.action == "dismiss"\) \{([\s\S]*?)\n    \}/)[1];
  assert.match(dismiss, /AlarmService.instance\?\.remove/);
  assert.doesNotMatch(dismiss, /cancel\(|schedule\(|prefs|done:|complete/i);
  assert.ok(source.indexOf('schedule(c, data, maxOf(due') < source.indexOf('c.startForegroundService(service)'));
  const plugin = fs.readFileSync(path.join(__dirname, '../plugins/withNativeAlarm.js'), 'utf8');
  assert.match(plugin, /RECEIVE_BOOT_COMPLETED/); assert.match(plugin, /android.intent.action.BOOT_COMPLETED/);
  assert.match(source, /AlarmStore.restore\(context\)/);
  console.log('PASS Weekdays: seven transitions, local time/DST, fixed days, metadata, Done/note, filters, repair/idempotence, None, edits; Dismiss/re-arm/boot contracts');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
