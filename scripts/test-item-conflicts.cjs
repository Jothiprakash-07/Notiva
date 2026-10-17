const assert = require('node:assert/strict');
const { fixture } = require('./test-item-sync.cjs');
const { makeItem } = require('./test-native-alarms.cjs');
const now = new Date(2026, 9, 12, 12).getTime();
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const item = (id, extra = {}) => makeItem({ id, startAt: new Clock(now + 3600000).toISOString(), createdAt: new Clock().toISOString(), updatedAt: new Clock().toISOString(), ...extra });
const setup = async (id, revision = 3, extra = {}) => {
  const h = fixture('android', Clock); h.online(true);
  await h.storage().saveItem(item(id, extra)); await h.sync().syncItems();
  h.rows.get(`Bearer A:${id}`).revision = revision;
  await h.queue().transactItemState('A', state => { state.items[0].serverRevision = revision; });
  h.online(false); return h;
};
async function run() {
  const h = await setup('stale');
  h.select('A', 'session-A'); h.authorize('session-A');
  await h.storage().updateItem({ ...(await h.storage().getItems())[0], title: 'Offline A edit' });
  // B owns the only valid session and has saved 3 -> 4 while A is offline.
  h.authorize('session-B');
  const server = h.rows.get('Bearer A:stale'); server.revision = 4; server.title = 'B authoritative';
  h.online(true); await h.sync().syncItems(); assert.ok(h.sync().itemSyncAuthBlocked());
  assert.equal((await h.queue().readItemSyncState('A')).queue[0].expectedRevision, 3);
  // A must regain a distinct valid session before its stale edit can reach CAS.
  h.select('A', 'session-A-new'); h.authorize('session-A-new');
  await h.storage().saveItem(item('unrelated'));
  await h.sync().syncItems();
  let state = await h.queue().readItemSyncState('A');
  const local = state.items.find(i => i.id === 'stale'), op = state.queue.find(o => o.clientItemId === 'stale');
  assert.equal(server.revision, 4); assert.equal(server.title, 'B authoritative');
  assert.equal(local.title, 'Offline A edit'); assert.equal(local.syncStatus, 'conflict');
  assert.equal(op.error, 'conflict'); assert.equal(op.expectedRevision, 3);
  assert.equal(local.conflict.expectedRevision, 3); assert.equal(local.conflict.serverRevision, 4);
  assert.equal(local.conflict.serverItem.title, 'B authoritative'); assert.equal(local.conflict.detectedAt, new Clock().toISOString());
  assert.equal(h.calls.find(c => c.method === 'PATCH' && c.account === 'Bearer session-A-new').body.expectedRevision, 3);
  assert.equal(state.items.find(i => i.id === 'unrelated').syncStatus, 'synced');
  console.log('PASS takeover: revoked auth stops upload; valid new session preserves base 3 and conflicts with server 4; unrelated item syncs');
  const attempts = h.calls.filter(c => c.method === 'PATCH').length;
  await h.sync().syncItems(); h.restart(); h.select('A', 'session-A-new'); await h.sync().syncItems();
  assert.equal(h.calls.filter(c => c.method === 'PATCH').length, attempts);
  state = await h.queue().readItemSyncState('A'); assert.equal(state.queue[0].conflict.serverItem.title, 'B authoritative');
  await h.storage().updateItem({ ...(await h.storage().getItems()).find(i => i.id === 'stale'), description: 'Further local edit' });
  await h.sync().syncItems(); state = await h.queue().readItemSyncState('A');
  assert.equal(state.queue[0].error, 'conflict'); assert.equal(state.items.find(i => i.id === 'stale').description, 'Further local edit');
  assert.equal(h.calls.filter(c => c.method === 'PATCH').length, attempts);
  assert.equal(h.queue().itemPayload(state.items.find(i => i.id === 'stale')).conflict, undefined);
  console.log('PASS conflicts survive restart/further local edits, retain both copies, and never auto-retry or enter server payload');

  const deletion = await setup('delete', 5);
  await deletion.storage().deleteItem('delete');
  const latest = deletion.rows.get('Bearer A:delete'); latest.revision = 6; latest.title = 'Newer server data';
  deletion.online(true); await deletion.sync().syncItems();
  state = await deletion.queue().readItemSyncState('A');
  assert.equal(latest.deletedAt, undefined); assert.equal(latest.revision, 6);
  assert.equal(state.queue[0].expectedRevision, 5); assert.equal(state.queue[0].payload.title, 'Read');
  assert.equal(state.queue[0].conflict.serverItem.title, 'Newer server data');
  assert.equal(state.tombstones.delete.synced, false); assert.equal(state.tombstones.delete.syncStatus, 'conflict');
  const deleteCount = deletion.calls.filter(c => c.method === 'DELETE').length;
  await deletion.sync().syncItems(); assert.equal(deletion.calls.filter(c => c.method === 'DELETE').length, deleteCount);
  console.log('PASS stale delete 5 vs 6 preserves server, local deletion snapshot and blocked tombstone without server deletion');

  const success = await setup('success', 10); success.online(true);
  await success.storage().updateItem({ ...(await success.storage().getItems())[0], title: 'Matching' }); await success.sync().syncItems();
  assert.equal(success.rows.get('Bearer A:success').revision, 11);
  assert.equal((await success.queue().readItemSyncState('A')).items[0].serverRevision, 11);
  await success.storage().deleteItem('success'); await success.sync().syncItems();
  assert.equal(success.rows.get('Bearer A:success').revision, 12);
  assert.equal((await success.queue().readItemSyncState('A')).tombstones.success.synced, true);
  console.log('PASS matching update 10 -> 11 and delete 11 -> 12 acknowledge authoritative revision and deletion feed');

  const series = await setup('master', 3, { repeat: 'daily' });
  await series.storage().updateItem({ ...(await series.storage().getItems())[0], title: 'Local rule' });
  series.rows.get('Bearer A:master').revision = 4;
  series.rows.get('Bearer A:master').title = 'Server rule';
  series.online(true); await series.sync().syncItems();
  state = await series.queue().readItemSyncState('A');
  assert.equal(state.items.length, 1); assert.equal(state.items[0].syncStatus, 'conflict');
  assert.equal(series.rows.get('Bearer A:master').title, 'Server rule');
  const seriesAttempts = series.calls.filter(c => c.method === 'PATCH').length;
  await series.sync().syncItems(); assert.equal(series.calls.filter(c => c.method === 'PATCH').length, seriesAttempts);
  console.log('PASS recurring master uses the same conflict policy, with no merge/rebase/retry');

  const missing = await setup('missing');
  await missing.storage().updateItem({ ...(await missing.storage().getItems())[0], title: 'Pending' });
  missing.rows.get('Bearer A:missing').deletedAt = new Clock().toISOString();
  missing.rows.get('Bearer A:missing').revision++;
  missing.online(true); await missing.sync().syncItems();
  state = await missing.queue().readItemSyncState('A');
  assert.equal(state.items.length, 0); assert.equal(state.queue.length, 0); assert.ok(state.tombstones.missing.synced);
  console.log('PASS authoritative remote deletion removes stale pending edit without resurrection');

  const isolated = await setup('same');
  await isolated.storage().updateItem({ ...(await isolated.storage().getItems())[0], title: 'A pending' });
  isolated.rows.get('Bearer A:same').revision++;
  isolated.online(true); await isolated.sync().syncItems();
  isolated.select('B'); assert.equal((await isolated.queue().readItemSyncState('B')).queue.length, 0);
  assert.equal((await isolated.storage().getItems()).length, 0);
  await isolated.storage().saveItem(item('same')); await isolated.sync().syncItems();
  assert.equal(isolated.rows.get('Bearer B:same').revision, 1);
  assert.equal((await isolated.queue().readItemSyncState('A')).items[0].conflict.serverRevision, 4);
  console.log('PASS conflicts and identical IDs stay account-scoped');

  const retry = fixture('android', Clock);
  await retry.storage().saveItem(item('retry'));
  const queued = (await retry.queue().readItemSyncState('A')).queue[0];
  retry.rows.set('Bearer A:retry', { ...queued.payload, revision: 1, serverUpdatedAt: new Clock().toISOString() });
  retry.online(true); await retry.sync().syncItems();
  assert.equal(retry.rows.size, 1); assert.equal((await retry.queue().readItemSyncState('A')).queue.length, 0);
  assert.equal((await retry.queue().readItemSyncState('A')).items[0].serverRevision, 1);
  console.log('PASS lost create response retries acknowledge only the identical existing item without duplicates');

  const race = await setup('race', 10); race.online(true);
  await race.storage().updateItem({ ...(await race.storage().getItems())[0], title: 'First edit' });
  let release; race.gate(new Promise(resolve => { release = resolve; }));
  const syncing = race.sync().syncItems();
  while (!race.calls.some(c => c.method === 'PATCH')) await new Promise(resolve => setImmediate(resolve));
  await race.storage().updateItem({ ...(await race.storage().getItems())[0], title: 'New edit during save' });
  race.gate(undefined); release(); await syncing;
  state = await race.queue().readItemSyncState('A');
  assert.equal(state.queue[0].expectedRevision, 11); assert.equal(state.items[0].title, 'New edit during save');
  await race.sync().syncItems(); assert.equal(race.rows.get('Bearer A:race').revision, 12);
  assert.equal(race.rows.get('Bearer A:race').title, 'New edit during save');
  console.log('PASS successful in-flight PATCH advances only its own dependent pending edit base');

  const legacy = await setup('legacy'); await legacy.storage().deleteItem('legacy');
  await legacy.queue().transactItemState('A', state => { delete state.queue[0].expectedRevision; });
  legacy.online(true); await legacy.sync().syncItems();
  state = await legacy.queue().readItemSyncState('A');
  assert.equal(legacy.calls.filter(c => c.method === 'DELETE').length, 0);
  assert.equal(state.queue.length, 1); assert.equal(state.queue[0].error, 'invalid_or_missing_item');
  assert.ok(state.queue[0].payload); assert.equal(legacy.rows.get('Bearer A:legacy').revision, 3);
  console.log('PASS unknown legacy delete base stays blocked without borrowing the latest server revision');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
