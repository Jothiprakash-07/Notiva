/* global __dirname */
const assert = require('node:assert/strict');
const { harness, makeItem: baseMakeItem } = require('./test-native-alarms.cjs');
const wait = () => new Promise(resolve => setImmediate(resolve));
const clone = value => JSON.parse(JSON.stringify(value));
function fixture(os = 'android', Clock = Date) {
  const rows = new Map(), archives = new Map(), calls = [], appListeners = [], networkListeners = [];
  const owners = new Map();
  let activeToken;
  let online = false, gate, failStatus, failMethod, state = 'active';
  const network = {
    getNetworkStateAsync: async () => ({ isConnected: online, isInternetReachable: online }),
    addNetworkStateListener: fn => { networkListeners.push(fn); return { remove: () => networkListeners.splice(networkListeners.indexOf(fn), 1) }; },
  };
  const fetch = async (url, init) => {
    calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body), account: init.headers.Authorization });
    if (gate) await gate;
    if (!online) throw Error('offline');
    if (activeToken && init.headers.Authorization !== `Bearer ${activeToken}`) return { ok: false, status: 401, json: async () => ({ code: 'SESSION_REVOKED' }) };
    if (failStatus && (!failMethod || init.method === failMethod)) return { ok: false, status: failStatus };
    const parsed = new URL(url);
    const owner = `Bearer ${owners.get(init.headers.Authorization.slice(7)) ?? init.headers.Authorization.slice(7)}`, id = decodeURIComponent(parsed.pathname.split('/api/items')[1].slice(1));
    const key = `${owner}:${id}`, body = init.body && JSON.parse(init.body);
    const res = (status, value) => ({ ok: status < 400, status, json: async () => clone(value) });
    if (init.method === 'POST') {
      const k = `${owner}:${body.clientItemId}`; if (rows.has(k)) return res(409, {});
      const item = { ...body, revision: 1, serverUpdatedAt: new Clock().toISOString() }; rows.set(k, item); return res(201, { item });
    }
    if (init.method === 'GET') {
      if (id === 'deletions') {
        const since = parsed.searchParams.get('since');
        const found = new Map();
        for (const [k, v] of [...rows, ...archives]) if (k.startsWith(`${owner}:`) && v.deletedAt && (!since || v.deletedAt > since)) {
          found.set(v.clientItemId, { clientItemId: v.clientItemId, deletedAt: v.deletedAt, ...(v.revision ? { revision: v.revision } : {}) });
        }
        const deletions = [...found.values()].sort((a, b) => a.deletedAt.localeCompare(b.deletedAt));
        const latest = deletions.at(-1)?.deletedAt;
        return res(200, { deletions, cursor: latest ? new Date(Math.max(Date.parse(since || '1970-01-01'), Date.parse(latest) - 1)).toISOString() : since });
      }
      if (!id) return res(200, { items: [...rows.entries()].filter(([k, v]) => k.startsWith(`${owner}:`) && !v.deletedAt).map(([, v]) => v) });
      return rows.has(key) && !rows.get(key).deletedAt ? res(200, { item: rows.get(key) }) : res(404, {});
    }
    if (!rows.has(key)) return res(404, {});
    const item = rows.get(key);
    if (item.deletedAt) return init.method === 'DELETE' ? res(200, { success: true, item }) : res(404, {});
    if (!Number.isSafeInteger(body?.expectedRevision) || body.expectedRevision < 1) return res(400, {});
    if (item.revision !== body.expectedRevision) return res(409, { code: 'ITEM_REVISION_CONFLICT', serverItem: item });
    if (init.method === 'DELETE') { item.deletedAt = new Clock().toISOString(); item.revision++; return res(200, { success: true, item }); }
    const { expectedRevision, ...changes } = body;
    Object.assign(item, changes); for (const field of Object.keys(changes)) if (changes[field] === null && !['category', 'priority', 'alertBefore'].includes(field)) delete item[field];
    item.revision++; item.serverUpdatedAt = new Clock().toISOString(); return res(200, { item });
  };
  const web = new Map();
  const h = harness(os, Clock, { sync: true, fetch, mocks: { 'expo-network': network }, localStorage: { getItem: key => web.get(key) ?? null, setItem: (key, value) => web.set(key, value) } });
  h.setNextTrigger(() => Clock.now() + 100000);
  // Augment the harness's existing React Native mock without changing alarm APIs.
  // Runtime loader obtains this same object through a tiny test module below.
  const account = () => h.load('services/itemAccount.ts');
  const select = (user, token = user) => { if (user) owners.set(token, user); account().selectItemAccount(user ? { token, user: { id: user } } : null); };
  select('A');
  return { ...h, web, rows, archives, calls, select, account, networkListeners, appListeners,
    authorize(token) { activeToken = token; },
    storage: () => h.load('services/itemStorage.ts'), queue: () => h.load('services/itemSyncQueue.ts'), sync: () => h.load('services/itemSyncService.ts'),
    online(value) { online = value; networkListeners.forEach(fn => fn({ isConnected: value, isInternetReachable: value })); },
    gate(value) { gate = value; }, fail(value, method) { failStatus = value; failMethod = method; }, state(value) { state = value; appListeners.forEach(fn => fn(value)); },
  };
}
// Numeric local components deliberately follow the product's local calendar rule.
// Explicit Date arguments retain normal parsing; only "now" is frozen in the VM.
function frozenClock(parts) {
  let now = new Date(...parts).getTime();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  return { Clock, set: value => { now = value.getTime(); } };
}
async function run(fixtureFactory = fixture) {
  // Monday: the existing M/W/F completion case is a real occurrence today.
  const { Clock } = frozenClock([2026, 9, 12, 12]);
  const fixture = (os = 'android') => fixtureFactory(os, Clock);
  const makeItem = (overrides = {}) => baseMakeItem({
    startAt: new Clock(Clock.now() + 3600000).toISOString(),
    createdAt: new Clock().toISOString(), updatedAt: new Clock().toISOString(), ...overrides,
  });
  let checks = 0;
  const check = message => { checks++; console.log(`PASS ${message}`); };
  const h = fixture(), s = h.storage(), q = h.queue();
  await s.saveItem(makeItem({ id: 'one' }));
  assert.equal(h.calls.length, 0); assert.equal((await s.getItems()).length, 1);
  let state = await q.readItemSyncState('A'); assert.equal(state.queue[0].type, 'create');
  assert.equal(state.items[0].syncStatus, 'pending_create'); check('local save precedes API and queues offline');
  await s.updateItem({ ...state.items[0], title: 'Latest' });
  await s.updateItem({ ...(await s.getItems())[0], description: 'Latest description' });
  state = await q.readItemSyncState('A'); assert.equal(state.queue.length, 1); assert.equal(state.queue[0].type, 'create'); assert.equal(state.queue[0].payload.title, 'Latest');
  check('create + updates compact to the latest payload');
  await s.saveItem(makeItem({ id: 'never-sent' })); await s.deleteItem('never-sent');
  state = await q.readItemSyncState('A'); assert.ok(!state.queue.some(row => row.clientItemId === 'never-sent')); assert.ok(!state.tombstones['never-sent']);
  check('unattempted create + delete removes pending create without a ghost');
  h.restart(); h.select('A'); assert.equal((await h.queue().readItemSyncState('A')).queue.length, 1);
  check('items and persistent queue survive module restart');
  h.online(true); await h.sync().syncItems();
  state = await h.queue().readItemSyncState('A'); assert.equal(state.queue.length, 0); assert.equal(state.items[0].serverRevision, 1); assert.equal(state.items[0].syncStatus, 'synced');
  check('online create acknowledges revision and removes queue');
  await h.storage().updateItem({ ...state.items[0], title: 'Edit one' });
  await h.storage().updateItem({ ...(await h.storage().getItems())[0], title: 'Edit two' });
  state = await h.queue().readItemSyncState('A'); assert.equal(state.queue.length, 1); assert.equal(state.queue[0].type, 'update');
  check('repeated updates collapse safely');
  h.online(false); await h.sync().syncItems();
  state = await h.queue().readItemSyncState('A'); assert.ok(state.queue[0].attemptCount >= 1); assert.ok(state.queue[0].retryAt);
  check('temporary failure retains item and queue with backoff');
  await h.storage().mergeServerItems('A', [makeItem({ id: 'one', title: 'Stale', serverRevision: 1 })], () => true);
  assert.equal((await h.storage().getItems())[0].title, 'Edit two'); check('pending update wins over server merge');
  const patchesBeforeRetry = h.calls.filter(row => row.method === 'PATCH').length;
  h.online(true); await h.queue().transactItemState('A', state => { state.queue.forEach(op => op.retryAt = 0); });
  await Promise.all([h.sync().syncItems(), h.sync().syncItems(), h.sync().syncItems()]);
  assert.equal(h.calls.filter(row => row.method === 'PATCH').length, patchesBeforeRetry + 1); check('concurrent triggers do not duplicate writes');
  h.online(false); await h.storage().deleteItem('one');
  state = await h.queue().readItemSyncState('A'); assert.equal(state.queue[0].type, 'delete'); assert.ok(state.tombstones.one); assert.equal(state.items.length, 0);
  await h.storage().mergeServerItems('A', [makeItem({ id: 'one', serverRevision: 2 })], () => true); assert.equal((await h.storage().getItems()).length, 0);
  check('offline delete hides immediately and tombstone prevents resurrection');
  h.online(true); await h.sync().syncItems(); state = await h.queue().readItemSyncState('A'); assert.equal(state.queue.length, 0); assert.equal(state.tombstones.one.synced, true);
  check('delete sends after reconnect and retains minimal synced tombstone');
  const remote = { ...makeItem({ id: 'remote', title: 'Restored' }), clientItemId: 'remote', revision: 4, serverUpdatedAt: new Clock().toISOString() };
  h.rows.set('Bearer A:remote', remote); await h.sync().syncItems();
  assert.equal((await h.storage().getItemById('remote')).title, 'Restored'); assert.equal(h.alarms.size, 1);
  await h.sync().syncItems(); assert.equal(h.alarms.size, 1); check('server-only future item restores and schedules once');
  await h.storage().saveItem(makeItem({ id: 'pending' })); await h.sync().syncItems();
  h.select(null); assert.equal((await h.storage().getItems()).length, 0);
  h.select('B'); assert.equal((await h.storage().getItems()).length, 0);
  await h.storage().saveItem(makeItem({ id: 'remote', title: 'B only' }));
  assert.equal((await h.storage().getItems())[0].title, 'B only'); h.select('A'); assert.ok((await h.storage().getItems()).some(item => item.title === 'Restored'));
  assert.ok(!Array.from(h.files.keys()).includes('docs/notiva.items.v1.json')); check('logout/account switching isolates namespaces and preserves A data');
  h.files.set('docs/notiva.items.v1.json', JSON.stringify([makeItem({ id: 'legacy' })]));
  assert.equal(await h.storage().getItemById('legacy'), undefined); assert.ok(h.files.has('docs/notiva.items.v1.json')); check('unknown-owner legacy items are preserved without automatic assignment');
  const account = h.account(); assert.equal(account.localAlarmItemId('notiva-account[B]::remote'), undefined);
  assert.equal(account.localAlarmItemId('daily:notiva-account[A]::root:2026-10-07'), 'daily:root:2026-10-07'); check('alarm identifiers and responses are account-isolated');

  const race = fixture(); race.online(true); await race.storage().saveItem(makeItem({ id: 'race' }));
  let release; race.gate(new Promise(resolve => { release = resolve; })); const syncing = race.sync().syncItems();
  while (!race.calls.length) await wait();
  await race.storage().deleteItem('race'); race.gate(undefined); release(); await syncing;
  state = await race.queue().readItemSyncState('A'); assert.equal(state.queue[0].type, 'delete');
  await race.sync().syncItems(); assert.ok(race.rows.get('Bearer A:race').deletedAt); check('delete during in-flight create survives acknowledgement');
  const conflict = fixture(); conflict.online(true); await conflict.storage().saveItem(makeItem({ id: 'conflict' })); await conflict.sync().syncItems();
  await conflict.storage().updateItem({ ...(await conflict.storage().getItems())[0], title: 'Local change' }); conflict.rows.get('Bearer A:conflict').revision++;
  await conflict.sync().syncItems(); state = await conflict.queue().readItemSyncState('A'); assert.equal(state.items[0].syncStatus, 'conflict'); assert.equal(state.items[0].title, 'Local change');
  check('revision conflict preserves local change and marks conflict');
  const pending = fixture(); await pending.storage().saveItem(makeItem({ id: 'local-only' }));
  await pending.storage().mergeServerItems('A', [], () => true);
  assert.equal((await pending.storage().getItems())[0].id, 'local-only'); check('pending create survives absence in server fetch');
  const editRace = fixture(); editRace.online(true); await editRace.storage().saveItem(makeItem({ id: 'edit-race' }));
  let releaseEdit; editRace.gate(new Promise(resolve => { releaseEdit = resolve; })); const creating = editRace.sync().syncItems();
  while (!editRace.calls.length) await wait(); await editRace.storage().updateItem({ ...(await editRace.storage().getItems())[0], title: 'Edited in flight' });
  editRace.gate(undefined); releaseEdit(); await creating;
  assert.equal((await editRace.queue().readItemSyncState('A')).queue[0].type, 'update'); await editRace.sync().syncItems();
  assert.equal(editRace.rows.get('Bearer A:edit-race').title, 'Edited in flight'); check('edit during create survives and PATCH follows acknowledged create');
  const alarmRetry = fixture(); alarmRetry.setExact(false);
  await alarmRetry.storage().mergeServerItems('A', [makeItem({ id: 'alarm-retry', serverRevision: 1 })], () => true);
  assert.equal(alarmRetry.alarms.size, 0); alarmRetry.setExact(true); await alarmRetry.storage().getItems();
  assert.equal(alarmRetry.alarms.size, 1); assert.equal(alarmRetry.calls.length, 0); check('restore scheduling retries offline after permission recovery');
  const stopped = fixture(); stopped.online(true); await stopped.storage().saveItem(makeItem({ id: 'auth' })); stopped.fail(401);
  await stopped.sync().syncItems(); const requestCount = stopped.calls.length; await stopped.sync().syncItems(); assert.equal(stopped.calls.length, requestCount);
  assert.equal((await stopped.queue().readItemSyncState('A')).queue.length, 1); check('401 stops transport until session generation changes');
  const stale = fixture(); stale.online(true); await stale.storage().saveItem(makeItem({ id: 'stale-owner' }));
  let releaseStale; stale.gate(new Promise(resolve => { releaseStale = resolve; })); const oldSync = stale.sync().syncItems();
  while (!stale.calls.length) await wait(); stale.select('B'); stale.gate(undefined); releaseStale(); await oldSync;
  assert.equal((await stale.storage().getItems()).length, 0); assert.equal((await stale.queue().readItemSyncState('B')).items.length, 0);
  check('in-flight User A response cannot enter User B namespace');
  const runtime = fixture(); await runtime.storage().saveItem(makeItem({ id: 'reconnect' }));
  const stop = runtime.load('services/itemSyncRuntime.ts').startItemSyncRuntime(); await wait(); await wait();
  assert.equal(runtime.calls.length, 0); runtime.online(true);
  for (let i = 0; i < 100 && (await runtime.queue().readItemSyncState('A')).queue.length; i++) await wait();
  assert.equal((await runtime.queue().readItemSyncState('A')).queue.length, 0);
  check('offline → online listener triggers automatic sync');
  runtime.foreground('background'); const backgroundCount = runtime.calls.length;
  await runtime.storage().saveItem(makeItem({ id: 'foreground' })); assert.equal(runtime.calls.length, backgroundCount);
  runtime.foreground('active');
  for (let i = 0; i < 100 && (await runtime.queue().readItemSyncState('A')).queue.length; i++) await wait();
  assert.equal((await runtime.queue().readItemSyncState('A')).queue.length, 0); stop();
  check('foreground reconciliation drains pending operations');
  const startup = fixture(); startup.online(true); startup.rows.set('Bearer A:startup', { ...makeItem({ id: 'startup' }), clientItemId: 'startup', revision: 1, serverUpdatedAt: new Clock().toISOString() });
  const stopStartup = startup.load('services/itemSyncRuntime.ts').startItemSyncRuntime();
  for (let i = 0; i < 100 && !(await startup.queue().readItemSyncState('A')).items.length; i++) await wait();
  assert.equal((await startup.storage().getItems()).length, 1); stopStartup(); check('startup/session runtime restores server-only items');
  const web = fixture('web'); await web.storage().saveItem(makeItem({ id: 'web' })); web.restart(); web.select('A');
  assert.equal((await web.queue().readItemSyncState('A')).queue.length, 1); assert.ok(web.web.has('notiva.item.sync.queue.v1:A'));
  web.select('B'); assert.equal((await web.storage().getItems()).length, 0); web.select('A'); assert.equal((await web.storage().getItems()).length, 1);
  check('web localStorage queue persists with account isolation');
  const journal = fixture(); await journal.storage().saveItem(makeItem({ id: 'durable' }));
  await journal.storage().updateItem({ ...(await journal.storage().getItems())[0], title: 'Second snapshot' });
  journal.files.delete('docs/notiva.items.v1:A.json'); journal.restart(); journal.select('A');
  assert.equal((await journal.storage().getItems())[0].title, 'Second snapshot');
  const journalKey = 'docs/notiva.item.sync.queue.v1:A.json'; journal.files.set(journalKey, '{interrupted');
  assert.equal((await journal.queue().readItemSyncState('A')).items[0].id, 'durable');
  await journal.storage().updateItem({ ...(await journal.storage().getItems())[0], title: 'Recovered' });
  assert.equal((await journal.storage().getItems())[0].title, 'Recovered'); check('authoritative outbox survives missing mirror and recovers interrupted primary write');
  const history = fixture(); await history.storage().saveItem(makeItem({ id: 'series', repeat: 'weekly', weeklyDays: [1, 3, 5] }));
  await history.storage().toggleComplete('series', 'Finished'); state = await history.queue().readItemSyncState('A');
  assert.equal(state.items.find(item => item.id === 'series').completionNote, 'Finished'); assert.ok(state.items.find(item => item.id === 'series').dailySeries);
  assert.ok(history.alarms.size); assert.equal(history.calls.length, 0); check('offline recurring alarms and completion history remain local');
  const future = fixture();
  await future.storage().saveItem(makeItem({ id: 'future-series', repeat: 'weekly', weeklyDays: [2],
    startAt: new Clock(2026, 9, 13, 13).toISOString() }));
  await future.storage().toggleComplete('future-series', 'Must not complete tomorrow');
  const futureState = await future.queue().readItemSyncState('A');
  assert.equal(futureState.items[0].completionNote, undefined);
  assert.equal(Boolean(futureState.items[0].completed), false);
  check('future weekly occurrence cannot be completed before its local date');
  for (const [name, parts] of [
    ['mid-month Saturday', [2026, 9, 17, 12]],
    ['month-end', [2026, 3, 30, 12]],
    ['year-end near midnight', [2026, 11, 31, 23, 59, 59, 999]],
    ['next-day midnight', [2027, 0, 1, 0, 0, 0, 0]],
    ['leap day', [2028, 1, 29, 12]],
    ['DST spring date', [2026, 2, 8, 0, 0]],
    ['DST autumn date', [2026, 10, 1, 0, 0]],
  ]) {
    const clock = frozenClock(parts), now = new clock.Clock();
    const boundary = fixtureFactory('android', clock.Clock);
    const timestamp = now.toISOString();
    await boundary.storage().saveItem(baseMakeItem({ id: 'boundary', repeat: 'weekly', weeklyDays: [now.getDay()],
      startAt: timestamp, createdAt: timestamp, updatedAt: timestamp }));
    await boundary.storage().toggleComplete('boundary', 'Finished');
    let saved = await boundary.queue().readItemSyncState('A');
    assert.equal(saved.items.length, 1, name);
    assert.equal(saved.items[0].completionNote, 'Finished', name);
    assert.equal(saved.items[0].completedAt, timestamp, name);
    assert.equal(saved.items[0].occurrenceHistory[0].completionNote, 'Finished', name);
    assert.equal(saved.queue.length, 1, name);
    assert.equal(boundary.calls.length, 0, name);
    // Advance by local calendar arithmetic, including across DST and year-end.
    clock.set(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0));
    await boundary.storage().getItems();
    saved = await boundary.queue().readItemSyncState('A');
    assert.equal(saved.items.length, 1, name);
    assert.equal(saved.items[0].occurrenceHistory[0].completionNote, 'Finished', name);
    boundary.online(true); await boundary.sync().syncItems();
    assert.equal(boundary.rows.size, 1, name);
    assert.equal((await boundary.queue().readItemSyncState('A')).queue.length, 0, name);
    check(`controlled local clock: ${name}, completion history survives midnight and sync`);
  }
  for (const type of ['reminder', 'task']) {
    const group = fixture();
    const selected = makeItem({ id: 'selected', type });
    await group.storage().saveItem(selected);
    await group.storage().saveItem({ ...selected, id: 'sibling' });
    await group.storage().saveItem({ ...selected, id: 'other', type: 'event' });
    const sibling = clone(await group.storage().getItemById('sibling'));
    const completed = await group.storage().toggleComplete('selected', '  Only selected  ');
    assert.equal(completed.status, 'Done'); assert.equal(completed.completionNote, 'Only selected');
    assert.ok(Number.isFinite(Date.parse(completed.completedAt)));
    assert.equal(group.load('utils/itemStatus.ts').getItemStatus(completed, new Clock(Clock.now() + 86400000)), 'Done');
    assert.deepEqual(clone(await group.storage().getItemById('sibling')), sibling);
    state = await group.queue().readItemSyncState('A');
    assert.equal(Boolean(state.items.find(row => row.id === 'other').completed), false);
    group.online(true); await group.sync().syncItems();
    const sent = group.calls.find(call => call.body?.clientItemId === 'selected');
    assert.equal(sent.body.status, 'Done'); assert.equal(sent.body.completionNote, 'Only selected');
    assert.equal(sent.body.completedAt, completed.completedAt);
    check(`${type}: shared completion persists timestamp/note, queues sync, preserves same-time siblings and never becomes overdue`);
  }
  console.log(`Sync checks passed: ${checks}`);
}
module.exports = { fixture };
if (require.main === module) run().catch(error => { console.error(error); process.exitCode = 1; });
