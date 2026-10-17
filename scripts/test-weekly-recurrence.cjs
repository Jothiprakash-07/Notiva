const assert = require('node:assert/strict');
const { harness, makeItem } = require('./test-native-alarms.cjs');
let now = new Date(2026, 9, 9, 9).getTime();
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
async function run() {
 const h = harness('android', Clock), storage = h.load('services/itemStorage.ts'), r = h.load('utils/dailyRecurrence.ts');
 await storage.saveItem(makeItem({ id: 'office', repeat: 'weekly', weeklyDays: [1, 5], startAt: new Clock(2026, 9, 9, 12).toISOString() }));
 assert.equal((await storage.getItems()).length, 1);
 await storage.toggleComplete('office', 'Friday done');
 for (const day of [10, 11]) {
   now = new Clock(2026, 9, day).getTime();
   assert.equal(r.visibleCurrentItems(await storage.getItems()).length, 0);
   assert.equal(r.itemsForDate(await storage.getItems(), new Clock()).length, 0);
 }
 now = new Clock(2026, 9, 12).getTime();
 let rows = await storage.getItems();
 assert.equal(rows.length, 1); assert.equal(rows[0].id, 'office'); assert.equal(rows[0].completed, false);
 assert.equal(rows[0].occurrenceHistory[0].completionNote, 'Friday done');
 assert.equal(h.alarms.size, 1);
 await storage.updateItem({ ...rows[0], startAt: new Clock(2026, 9, 12, 14).toISOString() });
 rows = await storage.getItems(); assert.equal(rows.length, 1); assert.equal(new Date(rows[0].startAt).getHours(), 14);
 assert.equal(h.alarms.size, 1);
 await storage.updateItem({ ...rows[0], repeat: 'none' });
 rows = await storage.getItems(); assert.equal(rows[0].dailySeries, undefined); assert.equal(rows[0].seriesId, undefined);
 assert.equal(h.alarms.size, 1); assert.equal([...h.alarms.values()][0].repeat, 'none');
 await storage.deleteItem('office'); assert.equal(h.alarms.size, 0);
 console.log('PASS weekly: weekend inactivity, midnight activation, history, stable master, edits, repeat-none, deletion');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
