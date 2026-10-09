const assert = require('node:assert/strict');
const { fixture } = require('./test-item-sync.cjs');
const { makeItem } = require('./test-native-alarms.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
async function run() {
  let checks = 0;
  const check = message => { checks++; console.log(`PASS ${message}`); };
  const h = fixture(); h.online(true);
  await h.storage().saveItem(makeItem({ id: 'remote-delete' }));
  await h.storage().saveItem(makeItem({ id: 'untouched' }));
  await h.storage().getItems(); await h.sync().syncItems();
  const alarmIds = (await h.queue().readItemSyncState('A')).items.find(row => row.id === 'remote-delete').notificationIds;
  assert.ok(alarmIds.length); assert.equal(h.alarms.size, 2);
  const deletedAt = new Date().toISOString();
  Object.assign(h.rows.get('Bearer A:remote-delete'), { deletedAt, revision: 2 });
  await h.sync().syncItems();
  let state = await h.queue().readItemSyncState('A');
  assert.ok(!state.items.some(row => row.id === 'remote-delete')); assert.ok(state.tombstones['remote-delete'].synced);
  assert.ok(state.items.some(row => row.id === 'untouched')); check('stale local item removed; unrelated item remains');
  assert.ok(alarmIds.every(id => h.cancelled.includes(id))); assert.equal(h.alarms.size, 1); check('only removed item alarm cancelled');
  assert.ok(state.deletionCursor); const cursor = state.deletionCursor;
  h.restart(); h.select('A'); assert.equal((await h.queue().readItemSyncState('A')).deletionCursor, cursor);
  await h.sync().syncItems(); assert.ok(!(await h.storage().getItems()).some(row => row.id === 'remote-delete'));
  check('cursor survives restart and full safety replay resumes');
  const before = plain((await h.queue().readItemSyncState('A')).tombstones);
  await h.sync().syncItems(); assert.deepEqual(plain((await h.queue().readItemSyncState('A')).tombstones), before);
  assert.ok(h.calls.some(call => call.url.includes('/deletions?since='))); check('replay is idempotent and subsequent fetch is incremental');
  await h.storage().mergeServerItems('A', [makeItem({ id: 'remote-delete', serverRevision: 99 })], () => true);
  await h.storage().saveItem(makeItem({ id: 'remote-delete' }));
  assert.ok(!(await h.queue().readItemSyncState('A')).items.some(row => row.id === 'remote-delete'));
  check('later stale active merge/local snapshot cannot resurrect retired ID');

  const pending = fixture(); pending.online(true);
  for (const id of ['edit', 'delete']) await pending.storage().saveItem(makeItem({ id }));
  await pending.sync().syncItems(); pending.online(false);
  await pending.storage().updateItem({ ...(await pending.storage().getItems()).find(row => row.id === 'edit'), title: 'Local edit' });
  await pending.storage().deleteItem('delete');
  for (const id of ['edit', 'delete']) Object.assign(pending.rows.get(`Bearer A:${id}`), { deletedAt, revision: 3 });
  pending.online(true); await pending.sync().syncItems();
  state = await pending.queue().readItemSyncState('A');
  assert.equal(state.queue.length, 0); assert.ok(state.tombstones.edit.synced); assert.ok(state.tombstones.delete.synced);
  assert.equal(state.items.length, 0); check('server deletion wins pending update and confirms pending delete');

  const isolation = fixture(); isolation.online(true); isolation.select('B');
  await isolation.storage().saveItem(makeItem({ id: 'same-id' })); await isolation.sync().syncItems();
  const bBefore = plain(await isolation.queue().readItemSyncState('B'));
  isolation.rows.get('Bearer B:same-id').deletedAt = deletedAt;
  isolation.select('A'); isolation.online(false); await isolation.storage().saveItem(makeItem({ id: 'same-id' }));
  isolation.online(true); isolation.fail(503, 'POST'); await isolation.sync().syncItems();
  assert.ok((await isolation.queue().readItemSyncState('A')).items.some(row => row.id === 'same-id'));
  await isolation.sync().syncItems(); assert.deepEqual(plain(await isolation.queue().readItemSyncState('B')), bBefore);
  assert.ok((await isolation.queue().readItemSyncState('A')).items.some(row => row.id === 'same-id'));
  assert.equal((await isolation.queue().readItemSyncState('A')).queue[0].type, 'create');
  check('same client ID and pending create in another owner namespace unaffected');

  const archived = fixture(); archived.online(true);
  await archived.storage().saveItem(makeItem({ id: 'purged' })); await archived.sync().syncItems();
  archived.archives.set('Bearer A:purged', { clientItemId: 'purged', deletedAt: '2026-09-01T00:00:00.000Z' });
  archived.rows.delete('Bearer A:purged');
  await archived.queue().transactItemState('A', s => { s.deletionCursor = '2026-10-08T00:00:00.000Z'; });
  await archived.sync().syncItems(); assert.equal((await archived.queue().readItemSyncState('A')).items.length, 0);
  check('archived evidence removes stale copy even when deletion predates cursor');

  const cancellation = fixture(); cancellation.online(true);
  await cancellation.storage().saveItem(makeItem({ id: 'retry-cancel' })); await cancellation.storage().getItems(); await cancellation.sync().syncItems();
  cancellation.rows.get('Bearer A:retry-cancel').deletedAt = deletedAt;
  const originalCancel = cancellation.bridge.cancel;
  cancellation.bridge.cancel = async () => { throw Error('native temporarily unavailable'); };
  await cancellation.sync().syncItems();
  assert.ok((await cancellation.queue().readItemSyncState('A')).pendingDeletionCancellations.length);
  cancellation.bridge.cancel = originalCancel; cancellation.restart(); cancellation.select('A'); cancellation.online(false);
  await cancellation.storage().getItems();
  assert.equal(cancellation.alarms.size, 0); assert.equal((await cancellation.queue().readItemSyncState('A')).pendingDeletionCancellations.length, 0);
  check('durable cancellation intent retries offline after restart without advancing failed cursor');

  for (const repeat of ['daily', 'weekly', 'weekdays']) {
    const series = fixture(); series.online(true);
    await series.storage().saveItem(makeItem({ id: `root-${repeat}`, repeat, weeklyDays: [0, 1, 2, 3, 4, 5, 6] }));
    await series.storage().getItems(); await series.sync().syncItems();
    series.rows.get(`Bearer A:root-${repeat}`).deletedAt = deletedAt;
    await series.sync().syncItems();
    const snapshot = await series.queue().readItemSyncState('A');
    const root = snapshot.items.find(row => row.id === `root-${repeat}`);
    assert.ok(root.dailyHidden); assert.ok(root.dailySeries.active); assert.ok(root.dailySeries.excludedDates.length);
    assert.ok(series.alarms.size); assert.equal(snapshot.queue.some(op => op.clientItemId === root.id), false);
    check(`${repeat} remote occurrence delete retains future series and excludes deleted occurrence`);
  }
  console.log(`Deletion feed checks passed: ${checks}`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
