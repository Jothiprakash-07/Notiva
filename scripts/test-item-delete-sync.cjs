const assert = require('node:assert/strict');
const { fixture } = require('./test-item-sync.cjs');
const { makeItem } = require('./test-native-alarms.cjs');
async function run() {
  for (const repeat of ['daily', 'none', 'weekly', 'weekdays']) {
    const h = fixture(); h.online(true);
    const id = `delete-${repeat}`;
    await h.storage().saveItem(makeItem({ id, repeat, weeklyDays: [0, 1, 2, 3, 4, 5, 6] }));
    await h.storage().getItems(); await h.sync().syncItems();
    assert.ok(h.rows.get(`Bearer A:${id}`));
    h.online(false); await h.storage().deleteItem(id); await h.storage().deleteItem(id);
    let state = await h.queue().readItemSyncState('A');
    assert.equal((await h.storage().getItems()).some(item => item.id === id), false);
    const deletes = state.queue.filter(op => op.clientItemId === id);
    assert.equal(deletes.length, 1); assert.equal(deletes[0].type, 'delete', `${repeat} deletion must queue DELETE, not PATCH`);
    assert.equal(state.tombstones[id].syncStatus, 'pending_delete');
    const operationId = deletes[0].operationId;
    h.restart(); h.select('A'); state = await h.queue().readItemSyncState('A');
    assert.equal(state.queue.find(op => op.clientItemId === id).operationId, operationId);
    await h.sync().syncItems(); assert.equal((await h.queue().readItemSyncState('A')).tombstones[id].synced, false);
    h.online(true); await h.queue().transactItemState('A', state => state.queue.forEach(op => op.retryAt = 0));
    await h.sync().syncItems(); state = await h.queue().readItemSyncState('A');
    assert.ok(h.rows.get(`Bearer A:${id}`).deletedAt); assert.ok(!state.queue.some(op => op.clientItemId === id));
    assert.equal(state.tombstones[id].synced, true); assert.equal(state.tombstones[id].syncStatus, 'synced');
    await h.storage().mergeServerItems('A', [makeItem({ id, repeat, serverRevision: 100 })], () => true);
    assert.equal((await h.storage().getItems()).some(item => item.id === id), false);
    assert.ok(!h.calls.some(call => call.method === 'PATCH' && call.body?.dailyHidden));
    if (repeat !== 'none') {
      assert.equal(state.items.some(item => item.id === id), false, 'series removed');
      assert.equal(h.alarms.size, 0, 'future recurring schedule cancelled');
    }
    console.log(`PASS ${repeat}: offline delete intent, duplicate guard, restart, reconnect DELETE, Mongo-style soft delete, stale merge protection`);
  }
  const legacy = fixture(); legacy.online(true);
  await legacy.storage().saveItem(makeItem({ id: 'legacy-hidden', repeat: 'daily' }));
  await legacy.storage().getItems(); await legacy.sync().syncItems();
  await legacy.queue().transactItemState('A', state => {
    const root = state.items.find(item => item.id === 'legacy-hidden');
    root.dailyHidden = true;
    state.queue.push({ operationId: 'old-patch', clientItemId: root.id, type: 'update', queuedAt: new Date().toISOString(), attemptCount: 0, payload: { dailyHidden: true } });
  });
  legacy.online(false); legacy.restart(); legacy.select('A');
  await legacy.storage().getItems();
  const repaired = await legacy.queue().readItemSyncState('A');
  assert.equal(repaired.queue.find(op => op.clientItemId === 'legacy-hidden').type, 'delete');
  assert.equal(repaired.tombstones['legacy-hidden'].syncStatus, 'pending_delete');
  console.log('PASS existing hidden recurring anchor repairs PATCH to durable DELETE on startup read');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
