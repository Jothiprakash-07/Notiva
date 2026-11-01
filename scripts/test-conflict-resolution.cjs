const assert = require('node:assert/strict');
const { fixture } = require('./test-item-sync.cjs');
const { makeItem } = require('./test-native-alarms.cjs');
const now = new Date(2026, 9, 21, 9).getTime();
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const base = extra => makeItem({ startAt: new Clock(now + 3600000).toISOString(), createdAt: new Clock().toISOString(), updatedAt: new Clock().toISOString(), ...extra });
async function setup({ deleting = false, repeat = 'none', type = 'reminder' } = {}) {
  const h = fixture('android', Clock); h.online(true);
  await h.storage().saveItem(base({ id: 'conflicted', repeat, type })); await h.sync().syncItems();
  h.online(false);
  if (deleting) await h.storage().deleteItem('conflicted');
  else await h.storage().updateItem({ ...(await h.storage().getItemById('conflicted')), title: 'Mine' });
  Object.assign(h.rows.get('Bearer A:conflicted'), { title: 'Server', revision: 2 });
  h.online(true); await h.sync().syncItems(); h.online(false);
  const [row] = await h.storage().getItemConflicts('A'); assert.ok(row); return { h, row };
}
async function resolve(h, row, choice) { return h.storage().resolveItemConflict('A', row.id, row.operationId, choice); }
async function run() {
  for (const type of ['reminder', 'task', 'event', 'birthday']) {
    const { h, row } = await setup({ type });
    await h.storage().saveItem(base({ id: 'unrelated' }));
    const unrelated = JSON.stringify((await h.queue().readItemSyncState('A')).queue.find(op => op.clientItemId === 'unrelated'));
    h.restart(); h.select('A'); assert.equal((await h.storage().getItemConflicts('A')).length, 1);
    await resolve(h, row, 'mine');
    let state = await h.queue().readItemSyncState('A');
    const pending = state.queue.find(op => op.clientItemId === row.id);
    assert.equal(pending.expectedRevision, 2); assert.equal(pending.error, undefined);
    assert.equal(state.items.find(item => item.id === row.id).title, 'Mine');
    assert.equal(state.items.find(item => item.id === row.id).syncStatus, 'pending_update');
    assert.equal(JSON.stringify(state.queue.find(op => op.clientItemId === 'unrelated')), unrelated);
    await assert.rejects(resolve(h, row, 'server'), /conflict changed/);
    h.rows.get('Bearer A:conflicted').revision = 3;
    h.online(true); await h.sync().syncItems();
    const [again] = await h.storage().getItemConflicts('A'); assert.equal(again.conflict.serverItem.serverRevision, 3);
    assert.equal((await h.queue().readItemSyncState('A')).items.find(item => item.id === 'unrelated').syncStatus, 'synced');
    h.online(false); await resolve(h, again, 'server');
    state = await h.queue().readItemSyncState('A');
    assert.equal(state.items.find(item => item.id === row.id).title, 'Server');
    assert.equal(state.items.find(item => item.id === row.id).serverRevision, 3);
    assert.equal(state.queue.length, 0); assert.equal((await h.storage().getItemConflicts('A')).length, 0);
    assert.equal(h.alarms.size, 2); assert.equal(h.expo.size, 0);
    console.log(`PASS ${type}: persistence, offline Keep Mine/reconflict, offline server replacement, revision, alarms, unrelated queue and stale choice guard`);
  }
  for (const choice of ['mine', 'server']) {
    const { h, row } = await setup({ deleting: true });
    assert.equal(row.deleting, true); assert.equal(row.local.title, 'Read');
    await resolve(h, row, choice);
    let state = await h.queue().readItemSyncState('A');
    if (choice === 'mine') {
      assert.equal(state.items.length, 0); assert.equal(state.queue[0].type, 'delete');
      assert.equal(state.queue[0].expectedRevision, 2); assert.equal(state.tombstones.conflicted.syncStatus, 'pending_delete');
      h.online(true); await h.sync().syncItems(); assert.ok(h.rows.get('Bearer A:conflicted').deletedAt); assert.equal(h.alarms.size, 0);
    } else {
      assert.equal(state.queue.length, 0); assert.equal(state.tombstones.conflicted, undefined);
      assert.equal(state.items[0].title, 'Server'); assert.equal(h.alarms.size, 1);
    }
    console.log(`PASS stale delete: ${choice}`);
  }
  const { h, row } = await setup({ repeat: 'daily' });
  h.select('B'); assert.equal((await h.storage().getItemConflicts('B')).length, 0);
  await assert.rejects(resolve(h, row, 'server'), /active account changed/);
  h.select('A'); await resolve(h, row, 'server');
  assert.equal((await h.queue().readItemSyncState('A')).items.length, 1); assert.equal(h.alarms.size, 1);
  await h.storage().getItems(); assert.equal(h.alarms.size, 1);
  console.log('PASS recurring master and account isolation');

  const changed = await setup({ repeat: 'daily' });
  const nextTime = new Clock(now + 7200000).toISOString();
  await changed.h.queue().transactItemState('A', state => {
    const remote = state.queue[0].conflict.serverItem;
    Object.assign(remote, { repeat: 'none', seriesId: undefined, dailySeries: undefined, startAt: nextTime });
  });
  await resolve(changed.h, changed.row, 'server');
  assert.equal(changed.h.alarms.size, 1);
  assert.equal([...changed.h.alarms.values()][0].startAt, Date.parse(nextTime));
  assert.ok(![...changed.h.alarms.keys()][0].includes('daily-series'));
  assert.equal((await changed.h.queue().readItemSyncState('A')).queue.length, 0);
  console.log('PASS server recurrence/time change cancels old series and schedules only replacement');

  const removed = await setup();
  Object.assign(removed.h.rows.get('Bearer A:conflicted'), { deletedAt: new Clock().toISOString(), revision: 3 });
  removed.h.online(true); await removed.h.sync().syncItems();
  await assert.rejects(resolve(removed.h, removed.row, 'server'), /conflict changed/);
  assert.equal((await removed.h.queue().readItemSyncState('A')).items.length, 0);
  assert.equal(removed.h.alarms.size, 0);
  assert.ok((await removed.h.queue().readItemSyncState('A')).tombstones.conflicted.synced);
  console.log('PASS authoritative deletion feed removes conflict and rejects stale UI resurrection');

  const cancelled = await setup();
  const cancel = cancelled.h.bridge.cancel; cancelled.h.bridge.cancel = async () => { throw Error('OS unavailable'); };
  const schedule = cancelled.h.bridge.schedule;
  let schedules = 0; cancelled.h.bridge.schedule = async raw => { schedules++; return schedule(raw); };
  await resolve(cancelled.h, cancelled.row, 'server');
  assert.ok((await cancelled.h.queue().readItemSyncState('A')).pendingDeletionCancellations.length);
  cancelled.h.online(true); await cancelled.h.sync().syncItems();
  assert.equal(schedules, 0, 'sync must not bypass pending cancellation before scheduling replacement');
  cancelled.h.bridge.cancel = cancel; await cancelled.h.storage().getItems();
  assert.equal((await cancelled.h.queue().readItemSyncState('A')).pendingDeletionCancellations.length, 0);
  assert.equal(cancelled.h.alarms.size, 1); await cancelled.h.storage().getItems(); assert.equal(cancelled.h.alarms.size, 1);
  console.log('PASS interrupted cancellation retries before replacement scheduling');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
