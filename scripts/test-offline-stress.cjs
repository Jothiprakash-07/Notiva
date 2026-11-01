const assert = require('node:assert/strict');
const { fixture } = require('./test-item-sync.cjs');
const { makeItem } = require('./test-native-alarms.cjs');
let now = new Date(2026, 9, 21, 9).getTime();
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const item = extra => makeItem({ startAt: new Clock(now + 3600000).toISOString(), createdAt: new Clock().toISOString(), updatedAt: new Clock().toISOString(), ...extra });
const flush = async () => { for (let n = 0; n < 20; n++) await new Promise(resolve => setImmediate(resolve)); };
const restart = h => { h.restart(); h.select('A'); };
const state = h => h.queue().readItemSyncState('A');
const unique = rows => assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
async function drain(h) { now += 600000; h.online(true); await h.sync().syncItems(); }
async function run() {
  const h = fixture('android', Clock);
  const seeds = [];
  for (const [type, count] of [['reminder', 5], ['task', 5], ['event', 3], ['birthday', 2]])
    for (let n = 0; n < count; n++) seeds.push(item({ id: `${type}-${n}`, type }));
  seeds.push(item({ id: 'daily', repeat: 'daily' }), item({ id: 'weekly', repeat: 'weekly', weeklyDays: [3] }));
  await Promise.all(seeds.map(row => h.storage().saveItem(row))); await h.storage().getItems();
  let saved = await state(h); assert.equal(saved.items.length, 17); assert.equal(saved.queue.length, 17); unique(saved.items);
  assert.ok(saved.items.every(row => row.syncStatus === 'pending_create')); assert.equal(h.alarms.size, 17);
  for (let n = 0; n < 3; n++) { restart(h); assert.equal((await h.storage().getItems()).length, 17); assert.equal((await state(h)).queue.length, 17); }
  await drain(h); saved = await state(h); assert.equal(saved.queue.length, 0); assert.equal(h.rows.size, 17);
  assert.ok(saved.items.every(row => row.serverRevision === 1)); assert.equal(h.calls.filter(call => call.method === 'POST').length, 17);
  assert.equal(h.alarms.size, 17);
  console.log('PASS 17 concurrent offline creates: local alarms, pending state, three restarts, one POST/document each and acknowledged revisions');

  h.online(false);
  for (let n = 0; n < 25; n++) {
    const current = await h.storage().getItemById('reminder-0');
    await h.storage().rescheduleItem({ ...current, title: `Title ${n}`, description: `Description ${n}`, startAt: new Clock(now + (n + 2) * 3600000).toISOString() });
  }
  await h.storage().updateItem({ ...(await h.storage().getItemById('reminder-0')), repeat: 'daily' });
  saved = await state(h); assert.equal(saved.queue.length, 1); assert.equal(saved.queue[0].expectedRevision, 1);
  restart(h); assert.equal((await state(h)).queue[0].payload.title, 'Title 24');
  await drain(h); assert.equal(h.rows.get('Bearer A:reminder-0').title, 'Title 24');
  assert.equal(h.rows.get('Bearer A:reminder-0').repeat, 'daily'); assert.equal(h.rows.get('Bearer A:reminder-0').revision, 2);
  assert.equal((await state(h)).queue.length, 0); assert.equal(h.alarms.size, 17);
  console.log('PASS 25 offline title/description/time edits plus recurrence edit compact to one revision-based operation and one replacement alarm');

  h.online(false);
  await h.storage().updateItem({ ...(await h.storage().getItemById('task-0')), title: 'Edited then deleted' });
  for (const id of ['task-0', 'task-1', 'event-0', 'birthday-0']) await h.storage().deleteItem(id);
  await h.storage().saveItem(item({ id: 'never-sent' })); await h.storage().getItems(); await h.storage().deleteItem('never-sent');
  saved = await state(h); assert.equal(saved.items.length, 13); assert.equal(saved.queue.length, 4);
  assert.ok(saved.queue.every(op => op.type === 'delete' && op.expectedRevision === 1)); assert.equal(h.alarms.size, 13);
  restart(h); assert.equal((await state(h)).queue.length, 4); await drain(h);
  assert.equal((await state(h)).queue.length, 0); assert.equal(h.rows.size, 17); assert.ok(!h.rows.has('Bearer A:never-sent'));
  for (const id of ['task-0', 'task-1', 'event-0', 'birthday-0']) assert.ok((await state(h)).tombstones[id].synced);
  assert.equal([...h.rows.values()].filter(row => !row.deletedAt).length, 13);
  console.log('PASS offline multi-delete, edit/delete, never-sent create/delete, restart, tombstones, count agreement and no resurrection');

  // An item-specific server failure must not hold unrelated queue operations.
  for (const mode of ['500', 'network', 'timeout']) {
    const partial = fixture('android', Clock);
    for (const id of ['bad', 'good']) await partial.storage().saveItem(item({ id }));
    partial.injectFault(call => {
      if (call.phase !== 'before' || call.method !== 'POST' || call.body.clientItemId !== 'bad') return;
      if (mode === '500') return { ok: false, status: 500, json: async () => ({}) };
      const error = Error(mode); if (mode === 'timeout') error.name = 'AbortError'; throw error;
    });
    partial.online(true); await partial.sync().syncItems();
    saved = await state(partial);
    assert.ok(partial.rows.has('Bearer A:good'), `${mode}: unrelated item must sync in the same pass`);
    assert.equal(saved.queue.length, 1); assert.ok(saved.queue[0].retryAt > now); assert.equal(saved.queue[0].error, undefined);
    const before = partial.calls.filter(call => call.method === 'POST').length;
    await partial.sync().syncItems(); assert.equal(partial.calls.filter(call => call.method === 'POST').length, before);
    restart(partial); assert.equal((await state(partial)).queue.length, 1);
    partial.injectFault(undefined); await drain(partial); assert.equal((await state(partial)).queue.length, 0); assert.equal(partial.rows.size, 2);
    console.log(`PASS isolated ${mode} failure: unrelated progress, durable backoff, restart and recovery`);
  }

  const lost = fixture('android', Clock); await lost.storage().saveItem(item({ id: 'lost' }));
  let lostResponse = false;
  lost.injectFault(call => { if (!lostResponse && call.phase === 'after' && call.method === 'POST' && call.status === 201) { lostResponse = true; throw Error('response lost after commit'); } });
  lost.online(true); await lost.sync().syncItems(); assert.equal(lost.rows.size, 1); assert.equal((await state(lost)).queue.length, 1);
  restart(lost); await drain(lost); assert.equal(lost.rows.size, 1); assert.equal((await state(lost)).queue.length, 0);
  console.log('PASS lost POST response/restart retries acknowledge existing identical document without duplicates');

  const uncertain = fixture('android', Clock);
  await uncertain.storage().saveItem(item({ id: 'uncertain-delete' }));
  let release;
  const waiting = new Promise(resolve => { release = resolve; });
  uncertain.gate(waiting); uncertain.online(true);
  const inFlight = uncertain.sync().syncItems();
  while (!uncertain.calls.length) await new Promise(resolve => setImmediate(resolve));
  await uncertain.storage().updateItem({ ...(await uncertain.storage().getItemById('uncertain-delete')), title: 'Edited during POST' });
  await uncertain.storage().deleteItem('uncertain-delete');
  uncertain.injectFault(call => { if (call.phase === 'after' && call.method === 'POST' && call.status === 201) throw Error('lost create acknowledgement'); });
  uncertain.gate(undefined); release(); await inFlight;
  uncertain.injectFault(undefined); restart(uncertain); await drain(uncertain);
  assert.equal((await state(uncertain)).queue.length, 0, 'delete after uncertain create must recover its original revision safely');
  assert.ok(uncertain.rows.get('Bearer A:uncertain-delete').deletedAt);
  console.log('PASS delete during lost create acknowledgement recovers original create proof without orphan server record');

  for (const revision of [1, 2]) {
    const guarded = fixture('android', Clock);
    await guarded.storage().saveItem(item({ id: 'guarded' }));
    const original = (await state(guarded)).queue[0].payload;
    await guarded.queue().transactItemState('A', data => {
      data.queue[0].attempted = true; data.queue[0].createAttemptPayload = original;
    });
    // A later local edit must not replace the original in-flight POST evidence.
    await guarded.storage().updateItem({ ...(await guarded.storage().getItemById('guarded')), title: 'Later local edit' });
    await guarded.storage().deleteItem('guarded');
    guarded.rows.set('Bearer A:guarded', { ...original, revision, serverUpdatedAt: new Clock().toISOString(),
      ...(revision === 1 ? { title: 'Different server content' } : {}) });
    restart(guarded); await drain(guarded);
    const pending = (await state(guarded)).queue[0];
    assert.equal(pending.error, 'conflict'); assert.equal(pending.conflict.serverRevision, revision);
    assert.equal(guarded.rows.get('Bearer A:guarded').deletedAt, undefined);
    assert.equal(guarded.calls.filter(call => call.method === 'DELETE').length, 0);
    assert.equal(pending.createAttemptPayload.title, original.title);
  }
  console.log('PASS uncertain-create delete never borrows changed revision/content; original evidence survives later edit and restart');

  const backoff = fixture('android', Clock); await backoff.storage().saveItem(item({ id: 'backoff' }));
  backoff.online(true); backoff.fail(500, 'POST');
  let previousDelay = 0;
  for (let attempt = 1; attempt <= 10; attempt++) {
    await backoff.sync().syncItems();
    const op = (await state(backoff)).queue[0];
    const delay = op.retryAt - now;
    assert.equal(op.attemptCount, attempt); assert.ok(delay >= previousDelay && delay <= 300000);
    previousDelay = delay; now = op.retryAt + 1;
  }
  assert.equal(previousDelay, 300000); backoff.fail(undefined); await backoff.sync().syncItems();
  assert.equal((await state(backoff)).queue.length, 0);
  console.log('PASS repeated server errors persist bounded exponential backoff through ten attempts then recover');

  const flap = fixture('android', Clock); const stop = flap.load('services/itemSyncRuntime.ts').startItemSyncRuntime();
  await flush(); assert.equal(flap.networkListeners.length, 1);
  for (let n = 0; n < 12; n++) {
    flap.online(false); await flap.storage().saveItem(item({ id: `flap-${n}` }));
    await flap.storage().updateItem({ ...(await flap.storage().getItemById(`flap-${n}`)), title: `Latest ${n}` });
    if (n % 3 === 0) await flap.storage().deleteItem(`flap-${n}`);
    flap.online(true); flap.foreground('background'); flap.foreground('active');
    await Promise.all([flap.sync().syncItems(), flap.sync().syncItems()]);
    assert.equal(flap.networkListeners.length, 1);
  }
  await drain(flap); await flush(); stop(); assert.equal(flap.networkListeners.length, 0);
  const calls = flap.calls.length; flap.online(false); flap.online(true); flap.foreground('active'); await flush(); assert.equal(flap.calls.length, calls);
  saved = await state(flap); assert.equal(saved.items.length, 8); assert.equal(saved.queue.length, 0); assert.equal(flap.rows.size, 8); unique(saved.items);
  assert.equal(flap.alarms.size, 8);
  console.log('PASS 12 network flaps with create/edit/delete, foreground and concurrent triggers: one listener, clean disposal and no item/alarm duplicates');

  for (const choice of ['mine', 'server']) for (const online of [false, true]) {
    const conflict = fixture('android', Clock); conflict.online(true);
    await conflict.storage().saveItem(item({ id: 'conflict' })); await conflict.sync().syncItems(); conflict.online(false);
    await conflict.storage().updateItem({ ...(await conflict.storage().getItemById('conflict')), title: 'Mine' });
    Object.assign(conflict.rows.get('Bearer A:conflict'), { title: 'Remote', revision: 2 });
    await conflict.storage().saveItem(item({ id: 'unrelated' })); await drain(conflict);
    restart(conflict); const [row] = await conflict.storage().getItemConflicts('A'); assert.ok(row.conflict.serverItem);
    const attempted = conflict.calls.filter(call => call.method === 'PATCH').length;
    await conflict.sync().syncItems(); assert.equal(conflict.calls.filter(call => call.method === 'PATCH').length, attempted);
    conflict.online(online); await conflict.storage().resolveItemConflict('A', row.id, row.operationId, choice);
    await drain(conflict); assert.equal((await state(conflict)).queue.length, 0);
    assert.equal(conflict.rows.get('Bearer A:conflict').title, choice === 'mine' ? 'Mine' : 'Remote');
  }
  console.log('PASS conflict persistence/blocking, unrelated progress and both resolution choices online/offline');

  const remoteDelete = fixture('android', Clock); remoteDelete.online(true);
  await remoteDelete.storage().saveItem(item({ id: 'deleted-remote' })); await remoteDelete.sync().syncItems(); remoteDelete.online(false);
  Object.assign(remoteDelete.rows.get('Bearer A:deleted-remote'), { deletedAt: new Clock().toISOString(), revision: 2 });
  await remoteDelete.storage().updateItem({ ...(await remoteDelete.storage().getItemById('deleted-remote')), title: 'Stale edit' });
  await drain(remoteDelete); assert.equal((await state(remoteDelete)).items.length, 0); assert.equal((await state(remoteDelete)).queue.length, 0);
  assert.equal(remoteDelete.alarms.size, 0); assert.ok((await state(remoteDelete)).deletionCursor);
  console.log('PASS remote deletion beats stale offline edit and cancels alarm without ghost');

  for (const parts of [[2026, 9, 21], [2026, 0, 31], [2026, 11, 31], [2028, 1, 28]]) {
    now = new Date(...parts, 23, 59).getTime();
    const boundary = fixture('android', Clock);
    for (const repeat of ['daily', 'weekly', 'weekdays', 'monthly', 'yearly'])
      await boundary.storage().saveItem(item({ id: repeat, repeat, startAt: new Clock(...parts, 23, 59, 30).toISOString(), weeklyDays: [new Clock().getDay()] }));
    await boundary.storage().getItems();
    now += 120000; restart(boundary); await boundary.storage().getItems();
    saved = await state(boundary); assert.equal(saved.items.length, 5); assert.equal(saved.queue.length, 5); unique(saved.items);
    assert.ok(saved.items.every(row => (row.occurrenceHistory?.length ?? 0) <= 366)); assert.equal(boundary.alarms.size, 5);
    await drain(boundary); assert.equal(boundary.rows.size, 5); assert.equal((await state(boundary)).queue.length, 0);
    assert.equal(boundary.alarms.size, 5);
  }
  console.log('PASS five recurrence masters offline across midnight/month-end/year-end/leap-day entry, bounded history and duplicate-free reconnect');

  const accounts = fixture('android', Clock);
  await accounts.storage().saveItem(item({ id: 'same', title: 'A pending' }));
  accounts.select('B'); assert.equal((await accounts.storage().getItems()).length, 0);
  await accounts.storage().saveItem(item({ id: 'same', title: 'B pending' })); await drain(accounts);
  assert.equal(accounts.rows.get('Bearer B:same').title, 'B pending'); assert.ok(!accounts.rows.has('Bearer A:same'));
  assert.equal((await state(accounts)).queue.length, 1);
  accounts.select('A'); await drain(accounts); assert.equal(accounts.rows.get('Bearer A:same').title, 'A pending');
  assert.equal((await state(accounts)).queue.length, 0);
  console.log('PASS account switch preserves A pending state, isolates same IDs and uploads only under correct token');

  const revoked = fixture('android', Clock); revoked.select('A', 'old'); revoked.authorize('new');
  await revoked.storage().saveItem(item({ id: 'revoked' }));
  let invalidations = 0;
  revoked.load('services/sessionTransport.ts').bindSessionTransport({ current: () => revoked.account().getItemSyncSession(),
    replace: async () => false, invalidate: async () => { invalidations++; revoked.select(null); } });
  await drain(revoked); assert.equal(invalidations, 1); assert.equal(revoked.account().getItemAccount(), null);
  assert.equal((await state(revoked)).queue.length, 1); assert.equal(revoked.rows.size, 0);
  revoked.select('A', 'new'); await drain(revoked); assert.equal((await state(revoked)).queue.length, 0); assert.equal(revoked.rows.size, 1);
  console.log('PASS revoked session signs out via bound transport, preserves pending data and resumes after legitimate login');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
