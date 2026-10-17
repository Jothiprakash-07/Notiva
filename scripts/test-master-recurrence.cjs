const assert = require('node:assert/strict');
const { harness, makeItem } = require('./test-native-alarms.cjs');
let now = new Date(2026, 9, 12, 9).getTime();
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
async function run() {
  let checks = 0;
  for (const repeat of ['daily', 'weekly', 'weekdays', 'monthly', 'yearly']) {
    now = new Date(2026, 9, 12, 9).getTime();
    const h = harness('android', Clock), storage = h.load('services/itemStorage.ts');
    const recurrence = h.load('utils/dailyRecurrence.ts');
    await storage.saveItem(makeItem({ id: repeat, repeat, startAt: new Clock(2026, 9, 12, 12).toISOString() }));
    let items = await storage.getItems();
    assert.equal(items.length, 1); assert.equal(h.alarms.size, 1); checks += 2;
    const nextDate = repeat === 'weekly' ? new Clock(2026, 9, 19) : repeat === 'monthly' ? new Clock(2026, 10, 12) : repeat === 'yearly' ? new Clock(2027, 9, 12) : new Clock(2026, 9, 13);
    const preview = recurrence.itemsForDate(items, nextDate)[0];
    assert.equal(preview.preview, true); assert.equal(preview.id, repeat);
    await assert.rejects(storage.saveItem(preview));
    assert.equal((await storage.getItems()).length, 1); checks += 4;
    await storage.toggleComplete(repeat, 'done note');
    items = await storage.getItems();
    assert.equal(items[0].status, 'Done'); assert.equal(items[0].completionNote, 'done note');
    assert.equal(new Date(items[0].startAt).getDate(), 12); checks += 3;
    now = nextDate.getTime();
    items = await storage.getItems();
    assert.equal(items.length, 1); assert.equal(items[0].id, repeat); assert.equal(items[0].completed, false);
    assert.equal(items[0].occurrenceHistory[0].completionNote, 'done note');
    assert.equal(new Date(items[0].startAt).getHours(), 12); checks += 5;
    h.restart();
    assert.equal((await h.load('services/itemStorage.ts').getItems()).length, 1); checks++;
    await h.load('services/itemStorage.ts').deleteItem(repeat);
    assert.equal((await h.load('services/itemStorage.ts').getItems()).length, 0); assert.equal(h.alarms.size, 0); checks += 2;
  }
  const h = harness('android', Clock), r = h.load('utils/dailyRecurrence.ts');
  for (const day of [29, 30, 31]) {
    const item = r.attachDailySeries(makeItem({ repeat: 'monthly', startAt: new Date(2026, 0, day, 12).toISOString() }));
    assert.equal(r.occurrenceOn(item, new Date(2026, 1, 28)), undefined);
    assert.ok(r.occurrenceOn(item, new Date(2026, 2, day))); checks += 2;
  }
  const leap = r.attachDailySeries(makeItem({ repeat: 'yearly', startAt: new Date(2024, 1, 29, 12).toISOString() }));
  assert.equal(r.occurrenceOn(leap, new Date(2025, 1, 28)), undefined);
  assert.equal(r.occurrenceOn(leap, new Date(2025, 2, 1)), undefined);
  assert.ok(r.occurrenceOn(leap, new Date(2028, 1, 29))); checks += 3;
  const weekdays = r.attachDailySeries(makeItem({ repeat: 'weekdays', startAt: new Date(2026, 9, 9, 12).toISOString() }));
  assert.equal(r.itemsForDate([weekdays], new Date(2026, 9, 10)).length, 0);
  assert.equal(r.itemsForDate([weekdays], new Date(2026, 9, 11)).length, 0); checks += 2;
  now = new Date(2026, 0, 1).getTime();
  const storage = h.load('services/itemStorage.ts');
  await storage.saveItem(makeItem({ repeat: 'daily', startAt: new Date(2026, 0, 1, 12).toISOString() }));
  for (let day = 0; day < 400; day++) {
    now = new Date(2026, 0, 1 + day).getTime();
    const items = await storage.getItems();
    assert.equal(items.length, 1); assert.ok((items[0].occurrenceHistory ?? []).length <= 366); checks += 2;
  }
  now = new Clock(2026, 9, 12, 9).getTime();
  const legacy = harness('android', Clock), ls = legacy.load('services/itemStorage.ts'), lr = legacy.load('utils/dailyRecurrence.ts');
  const root = lr.attachDailySeries(makeItem({ id: 'legacy', repeat: 'daily', startAt: new Clock(2026, 9, 11, 12).toISOString() }));
  delete root.dailySeries.masterVersion;
  const child = { ...root, id: 'daily:legacy:2026-10-12', dailySeries: undefined, startAt: new Clock(2026, 9, 12, 12).toISOString(), completed: true, status: 'Done', completionNote: 'Preserve old note' };
  const future = { ...child, id: 'daily:legacy:2026-10-13', startAt: new Clock(2026, 9, 13, 12).toISOString(), completed: false, status: undefined, completionNote: undefined };
  legacy.files.set('docs/notiva.items.v1.json', JSON.stringify([root, child, future, { ...future, id: 'daily:legacy:2026-10-14', startAt: new Clock(2026, 9, 14, 12).toISOString(), title: 'User edited' }]));
  let migrated = await ls.getItems();
  assert.equal(migrated.find(row=>row.id==='legacy').completionNote, 'Preserve old note');
  assert.equal(migrated.some(row=>row.id===future.id), false);
  assert.equal(migrated.filter(row=>new Date(row.startAt).getDate()===12).length,1);
  assert.ok(migrated.some(row=>row.title==='User edited')); checks+=4;
  await ls.updateItem(makeItem({ id: 'legacy', repeat: 'daily', startAt: new Clock(2026, 9, 12, 14).toISOString() }));
  const edited = (await ls.getItems()).find(row=>row.id==='legacy');
  assert.ok(edited.occurrenceHistory.some(row=>row.completionNote==='Preserve old note')); checks++;
  const historical = lr.historyItems([edited]).find(row=>row.completionNote==='Preserve old note');
  assert.ok(historical.historical); checks++;
  assert.equal((await ls.getItemById(historical.id)).completionNote,'Preserve old note'); checks++;
  const morning = lr.attachDailySeries(makeItem({ repeat:'daily',startAt:new Clock(2026,9,12,12).toISOString() }));
  assert.equal(legacy.load('utils/itemAnalytics.ts').calculateAnalytics([morning],'all',new Clock()).pending,1); checks++;
  console.log(`PASS master recurrence: ${checks} assertions`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
