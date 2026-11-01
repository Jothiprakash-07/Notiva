const assert = require('node:assert/strict');
const { harness } = require('./test-native-alarms.cjs');
const calendar = require('../shared/recurrence.cjs');
let now = Date.parse('2030-01-01T06:00:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const clone = value => JSON.parse(JSON.stringify(value));
const row = (repeat = 'daily', extra = {}) => ({ item: { id: 'series', organizationId: 'one', type: 'task', title: 'Daily shared work', description: '', status: 'active', createdByUserId: 'A',
  schedule: { startAt: '2030-01-01T06:30:00.000Z', alertBefore: { minutes: 5, label: '5 minutes' } }, recurrence: { repeat, timeZone: 'Asia/Kolkata', effectiveFrom: '2030-01-01T06:30:00.000Z', ...(repeat === 'weekly' ? { weeklyDays: [2, 4] } : {}) },
  serverRevision: 1, scheduleRevision: 1, completionMode: 'individual', occurrenceHistory: [], createdAt: '2030-01-01T00:00:00Z', ...extra },
  recipient: { userId: 'A', accessStatus: 'active', status: 'pending', occurrenceHistory: [], recipientRevision: 1 } });
async function run() {
  let count = 0; const pass = label => { count++; console.log('PASS ' + label); };
  const h = harness('android', Clock, { sync: true });
  h.load('services/itemAccount.ts').selectItemAccount({ user: { id: 'A' }, token: 'A' });
  const derive = h.load('utils/sharedRecurrence.ts').deriveSharedOccurrence;
  for (const repeat of ['daily', 'weekly', 'weekdays', 'monthly', 'yearly']) {
    const entry = row(repeat), view = derive(entry);
    assert.equal(view.occurrence.key, '1|2030-01-01T12:00');
    assert.equal(view.occurrence.startAt, entry.item.schedule.startAt);
    assert.equal(JSON.stringify(entry).includes('occurrenceKey'), false);
    pass(repeat + ' derives one current slot without future records');
  }
  const entry = row(), key = derive(entry).occurrence.key;
  const pending = [{ itemId: 'series', occurrenceKey: key, action: 'complete', expectedRevision: 1, state: 'pending' }];
  let view = derive(entry, pending);
  assert.equal(view.effectiveStatus, 'pending_sync'); assert.equal(view.occurrence.status, 'completed');
  assert.equal(view.alarm.startAt, '2030-01-02T06:30:00.000Z'); assert.equal(view.occurrence.date, '2030-01-01');
  assert.equal(entry.recipient.occurrenceHistory.length, 0); pass('offline intent projects current completion and future alarm without activating tomorrow');
  now = Date.parse('2030-01-01T18:29:59.999Z'); assert.equal(derive(entry, pending).occurrence.key, key);
  now++; view = derive(entry, pending); assert.equal(view.occurrence.date, '2030-01-02'); assert.equal(view.occurrence.status, 'pending');
  assert.equal(calendar.nextMidnight(new Clock(), 'Asia/Kolkata'), Date.parse('2030-01-02T18:30:00Z')); pass('series midnight activates a fresh occurrence while offline');
  const collective = row('daily', { completionMode: 'collective', occurrenceHistory: [{ occurrenceKey: view.occurrence.key, scheduledAt: view.occurrence.startAt, status: 'completed', completedByUserId: 'B' }] });
  assert.equal(derive(collective).occurrence.completedByUserId, 'B'); assert.equal(derive(collective).item.status, 'active');
  assert.equal(derive(collective, [], new Date('2030-01-02T18:30:00Z')).occurrence.status, 'pending'); pass('collective ANY result resets independently of active series');
  assert.equal(derive(row('daily', { status: 'cancelled' })).alarm.eligible, false); pass('cancelled cached series cannot schedule');
  now = Date.parse('2030-01-01T06:00:00Z');
  const alarms = h.load('services/sharedAlarms.ts');
  await alarms.reconcileSharedAlarms('A', 'one', [entry]); assert.equal(h.alarms.size, 1);
  const first = [...h.alarms.keys()][0], native = [...h.alarms.values()][0];
  assert.ok(native.itemId.includes(encodeURIComponent(key))); assert.equal(native.preAlertMinutes, 5); // stable series handle; occurrence-specific delivery identity
  await alarms.reconcileSharedAlarms('A', 'one', [entry]); assert.equal(h.alarms.size, 1); assert.equal(h.cancelled.length, 1);
  h.restart(); await h.load('services/sharedAlarms.ts').reconcileSharedAlarms('A', 'one', [entry]); assert.equal(h.alarms.size, 1);
  pass('occurrence alarm identity, paired pre-alert and restart reconciliation are idempotent');
  await h.load('services/sharedAlarms.ts').reconcileSharedAlarms('A', 'one', [derive(entry, pending)]);
  assert.equal(h.alarms.size, 1); assert.notEqual(h.alarms.get(first).itemId, native.itemId); pass('completion removes old occurrence and registers exactly one next alarm');
  const identity = h.load('services/sharedAlarms.ts');
  assert.notEqual(identity.sharedAlarmItemId('one', 'series', key), identity.sharedAlarmItemId('two', 'series', key));
  assert.equal(identity.parseSharedAlarmId(identity.sharedAlarmItemId('one', 'series', key)).occurrenceKey, key); pass('alarm namespace round-trips occurrence and isolates organizations');
  let offline = false, reject = false; const posts = [], server = row();
  const fetch = async (url, init) => {
    if (offline) throw Error('offline');
    const endpoint = new URL(url).pathname.split('/api/organizations')[1];
    const response = (status, data) => ({ status, ok: status < 400, json: async () => clone(data) });
    if (!endpoint || endpoint === '/') return response(200, { organizations: [{ organization: { id: 'one', status: 'active' }, membership: { role: 'owner', userId: 'A', status: 'active' } }] });
    if (init.method === 'POST') { const body = JSON.parse(init.body); posts.push(body); if (reject) return response(409, { message: 'Changed' });
      const due = calendar.dueOn(server.item, body.occurrenceKey.split('|')[1].slice(0, 10)); server.recipient.occurrenceHistory = calendar.mergeHistory(server.recipient.occurrenceHistory, { occurrenceKey: body.occurrenceKey, scheduledAt: due.startAt, status: 'completed' }); return response(200, server); }
    if (/\/(inbox|created-by-me)$/.test(endpoint)) return response(200, { items: [server] });
    return response(200, server);
  };
  const q = harness('android', Clock, { sync: true, fetch }); q.load('services/itemAccount.ts').selectItemAccount({ user: { id: 'A' }, token: 'A' });
  const workspace = q.load('services/sharedWorkspace.ts'), cache = q.load('services/sharedCache.ts'); const stop = workspace.startSharedWorkspace('A');
  await new Promise(resolve => setImmediate(resolve)); await workspace.refreshSharedWorkspace(); await workspace.loadSharedDetail('A', 'one', 'series');
  offline = true; const result = await workspace.mutateSharedClient('A', 'one', 'series', 'complete', 1, undefined, key);
  assert.equal(result.cached, true); assert.equal(result.entry.effectiveStatus, 'pending_sync');
  await workspace.mutateSharedClient('A', 'one', 'series', 'complete', 1, undefined, key);
  assert.equal((await cache.readSharedCache('A', 'one')).occurrenceActions.length, 1); pass('offline write queue durably deduplicates exact occurrence intents');
  now = Date.parse('2030-01-02T06:00:00Z'); offline = false; await workspace.refreshSharedWorkspace();
  assert.equal(posts[0].occurrenceKey, key); assert.equal((await cache.readSharedCache('A', 'one')).occurrenceActions.length, 0);
  assert.equal((await workspace.loadSharedDetail('A', 'one', 'series')).entry.occurrence.status, 'pending'); pass('reconnect replays original date without completing new current occurrence');
  offline = true; const second = calendar.currentOccurrence(server.item, new Clock()).key;
  await workspace.mutateSharedClient('A', 'one', 'series', 'complete', 1, undefined, second);
  offline = false; reject = true; await workspace.refreshSharedWorkspace();
  assert.equal((await cache.readSharedCache('A', 'one')).occurrenceActions[0].state, 'conflict'); pass('stale queued response stays visibly conflicted and is never retargeted');
  stop(); console.log(`${count} shared recurrence frontend checks passed`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });

