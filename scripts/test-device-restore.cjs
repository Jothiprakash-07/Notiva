const assert = require('node:assert/strict');
const { fixture } = require('./test-item-sync.cjs');
const { makeItem } = require('./test-native-alarms.cjs');
const now = new Date(2026, 9, 21, 9).getTime();
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const plain = value => JSON.parse(JSON.stringify(value));
const item = overrides => makeItem({ startAt: new Clock(now + 3600000).toISOString(),
  createdAt: new Clock().toISOString(), updatedAt: new Clock().toISOString(), ...overrides });
async function run() {
  const a = fixture('android', Clock); a.online(true);
  for (const type of ['reminder', 'task', 'event', 'birthday'])
    await a.storage().saveItem(item({ id: type, type }));
  for (const repeat of ['daily', 'weekly', 'weekdays', 'monthly', 'yearly'])
    await a.storage().saveItem(item({ id: repeat, repeat, weeklyDays: [3] }));
  await a.storage().saveItem(item({ id: 'completed', completed: true, status: 'Done', completedAt: new Clock().toISOString() }));
  await a.storage().saveItem(item({ id: 'deleted' }));
  await a.sync().syncItems(); await a.storage().deleteItem('deleted'); await a.sync().syncItems();
  assert.equal((await a.queue().readItemSyncState('A')).queue.length, 0);
  // Separate files, module cache and OS scheduler: only server records transfer.
  const b = fixture('android', Clock);
  assert.equal(b.files.size, 0); assert.equal(b.alarms.size, 0);
  for (const [key, value] of a.rows) b.rows.set(key, plain(value));
  b.select('A', 'device-B'); b.authorize('device-B'); b.online(true);
  await b.sync().syncItems();
  let state = await b.queue().readItemSyncState('A');
  assert.equal(state.items.length, 10); assert.equal(state.queue.length, 0);
  assert.equal(b.alarms.size, 9); assert.equal(b.expo.size, 0);
  assert.ok(state.tombstones.deleted.synced);
  assert.ok(state.items.find(row => row.id === 'completed').completed);
  for (const row of state.items) assert.equal(row.serverRevision, b.rows.get(`Bearer A:${row.id}`).revision);
  const ids = [...b.alarms.keys()].sort();
  for (let n = 0; n < 3; n++) {
    b.restart(); b.select('A', 'device-B');
    await Promise.all([b.sync().syncItems(), b.sync().syncItems()]); await b.storage().getItems();
    state = await b.queue().readItemSyncState('A');
    assert.equal(state.items.length, 10); assert.equal(new Set(state.items.map(row => row.id)).size, 10);
    assert.equal(state.queue.length, 0); assert.deepEqual([...b.alarms.keys()].sort(), ids);
  }
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 0);
  assert.equal(state.items.filter(row => row.dailySeries).length, 5);
  assert.ok(state.items.filter(row => row.dailySeries).every(row => row.seriesId === row.id));
  b.online(false); b.restart(); b.select('A', 'device-B');
  await b.sync().syncItems(); assert.equal((await b.storage().getItems()).length, 10);
  await b.storage().updateItem({ ...(await b.storage().getItemById('task')), title: 'Offline edit' });
  await b.storage().mergeServerItems('A', [item({ id: 'task', title: 'Stale remote', serverRevision: 1 })], () => true);
  assert.equal((await b.storage().getItemById('task')).title, 'Offline edit');
  b.online(true); await b.queue().transactItemState('A', s => s.queue.forEach(op => op.retryAt = 0));
  await b.sync().syncItems(); assert.equal(b.rows.get('Bearer A:task').title, 'Offline edit');
  Object.assign(b.rows.get('Bearer A:reminder'), { deletedAt: new Clock().toISOString(), revision: 2 });
  await b.sync().syncItems(); assert.equal((await b.storage().getItems()).length, 9);
  assert.equal(b.alarms.size, 8); assert.ok((await b.queue().readItemSyncState('A')).deletionCursor);
  b.select('B'); assert.equal((await b.storage().getItems()).length, 0);
  b.select('A', 'device-B'); assert.equal((await b.storage().getItems()).length, 9);
  a.authorize('device-B'); await a.sync().syncItems(); assert.ok(a.sync().itemSyncAuthBlocked());
  assert.equal((await a.queue().readItemSyncState('A')).items.length, 10);
  console.log('PASS isolated-device restore: 10 records, 9 alarms, five recurrence masters, completed/deleted state, revisions, restarts, offline edits/reconnect, deletion cursor, accounts and revoked transport');

  // A newer server revision must not erase an unfinished local scheduling retry.
  const retry = fixture('ios', Clock); retry.online(true);
  const remote = { ...item({ id: 'retry' }), clientItemId: 'retry', revision: 1, serverUpdatedAt: new Clock().toISOString() };
  retry.rows.set('Bearer A:retry', remote);
  retry.notifications.getPermissionsAsync = async () => ({ granted: false });
  await retry.sync().syncItems();
  assert.ok((await retry.queue().readItemSyncState('A')).items[0].restoreNeedsScheduling);
  remote.revision++;
  await retry.sync().syncItems();
  assert.ok((await retry.queue().readItemSyncState('A')).items[0].restoreNeedsScheduling);
  retry.notifications.getPermissionsAsync = async () => ({ granted: true });
  await retry.storage().getItems(); assert.equal(retry.expo.size, 2);
  await retry.sync().syncItems(); await retry.storage().getItems(); assert.equal(retry.expo.size, 2);
  console.log('PASS scheduling retry survives newer equivalent server revision and schedules one iOS main/pre-alert pair');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
