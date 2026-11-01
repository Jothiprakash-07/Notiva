const assert = require('node:assert/strict');
const { harness } = require('./test-native-alarms.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const now = Date.parse('2030-01-01T08:00:00Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
const entry = { item: { id: 'series', organizationId: 'one', createdByUserId: 'B', type: 'task', title: 'Shared targets', status: 'active', completionMode: 'individual',
  schedule: { startAt: '2030-01-01T09:00:00.000Z', alertBefore: { minutes: 5, label: '5 minutes' } }, recurrence: { repeat: 'daily', timeZone: 'UTC' }, occurrenceHistory: [], serverRevision: 1, scheduleRevision: 1 },
  recipient: null, targets: [{ targetType: 'user', targetId: 'B' }], recipientSummary: [{ status: 'pending', accessStatus: 'active', count: 1 }] };
async function run() {
  let offline = false, checks = 0, otherEntry; const pass = label => { checks++; console.log('PASS ' + label); };
  const fetch = async (url, init) => {
    if (offline) throw Error('offline');
    const endpoint = new URL(url).pathname.split('/api/organizations')[1];
    const response = (status, data) => ({ status, ok: status < 400, json: async () => clone(data) });
    if (!endpoint || endpoint === '/') return response(200, { organizations: ['one', ...(otherEntry ? ['two'] : [])].map(id => ({ organization: { id, status: 'active' }, membership: { role: 'owner', userId: 'A', status: 'active' } })) });
    if (endpoint.startsWith('/two/')) return response(200, /\/inbox$/.test(endpoint) ? { items: [otherEntry] } : otherEntry);
    if (init.method === 'PATCH') {
      const body = JSON.parse(init.body); if (body.expectedRevision !== entry.item.serverRevision) return response(409, { code: 'ITEM_REVISION_CONFLICT', message: 'Changed' });
      entry.targets = body.targets; entry.item.serverRevision++;
      if (!body.targets.some(row => row.targetId === 'A')) entry.recipient = null;
      const result = response(200, { item: entry.item, targets: entry.targets, recipient: entry.recipient, alarm: { eligible: false }, targetDiff: { removed: 1, added: 1 }, recipientCount: 1 });
      offline = true; return result; // mutation ACK arrives, then all follow-up reads fail
    }
    if (/\/inbox$/.test(endpoint)) return response(200, { items: entry.recipient?.accessStatus === 'active' ? [entry] : [] });
    if (/\/created-by-me$/.test(endpoint)) return response(200, { items: [entry] });
    return response(200, entry);
  };
  const h = harness('android', Clock, { sync: true, fetch });
  h.load('services/itemAccount.ts').selectItemAccount({ user: { id: 'A' }, token: 'A' });
  const workspace = h.load('services/sharedWorkspace.ts'), cache = h.load('services/sharedCache.ts'), alarms = h.load('services/sharedAlarms.ts');
  const stop = workspace.startSharedWorkspace('A'); await new Promise(resolve => setImmediate(resolve)); await workspace.refreshSharedWorkspace();
  await workspace.loadSharedDetail('A', 'one', 'series'); assert.equal(h.alarms.size, 0); pass('manager never schedules other recipients locally');
  entry.item.serverRevision++;
  entry.recipient = { userId: 'A', status: 'pending', accessStatus: 'active', recipientRevision: 1, occurrenceHistory: [], eligibleFrom: '2030-01-01T09:00:00Z' };
  const added = await workspace.loadSharedDetail('A', 'one', 'series'); assert.equal(added.entry.occurrence.key, '1|2030-01-01T09:00');
  assert.equal(h.alarms.size, 1); assert.equal([...h.alarms.values()][0].sharedRecurrence.notBefore, Date.parse('2030-01-01T09:00:00Z')); pass('added current recipient schedules eligible native shared series and pre-alert');
  const cancellations = h.cancelled.length; await workspace.loadSharedDetail('A', 'one', 'series'); assert.equal(h.alarms.size, 1); assert.equal(h.cancelled.length, cancellations); pass('unchanged recipient detail refresh does not replace or duplicate native schedule');
  const other = clone(entry); other.item.organizationId = 'two'; otherEntry = other;
  await alarms.reconcileSharedAlarms('A', 'two', [other]); assert.equal(h.alarms.size, 2);
  const result = await workspace.mutateSharedClient('A', 'one', 'series', 'edit', 2, { targets: [{ targetType: 'user', targetId: 'B' }] });
  assert.equal(result.entry.recipient, null); assert.equal(result.entry.targets[0].targetId, 'B'); assert.equal(h.alarms.size, 1);
  assert.ok([...h.alarms.values()].every(row => row.id.includes('two')));
  const removed = await cache.readSharedCache('A', 'one'); assert.equal(removed.series?.series, undefined); assert.equal(removed.lists.inbox.length, 0); pass('target removal ACK clears native re-arm/cache even when follow-up reads fail, isolating other organization');
  offline = true;
  await assert.rejects(workspace.mutateSharedClient('A', 'one', 'series', 'edit', 3, { targets: [{ targetType: 'user', targetId: 'A' }] }), /You're offline\. Connect to update recipients\./);
  assert.equal((await cache.readSharedCache('A', 'one')).occurrenceActions?.length ?? 0, 0); pass('offline target edits fail visibly and never enter occurrence intent queue');
  offline = false; entry.item.serverRevision++;
  entry.item.occurrenceHistory = [{ occurrenceKey: '1|2030-01-01T09:00', scheduledAt: '2030-01-01T09:00:00Z', status: 'completed' }];
  entry.recipient = { userId: 'A', status: 'pending', accessStatus: 'active', recipientRevision: 3, occurrenceHistory: [], eligibleFrom: '2030-01-02T09:00:00Z' };
  const late = await workspace.loadSharedDetail('A', 'one', 'series'); assert.equal(late.entry.occurrence, null);
  assert.equal([...h.alarms.values()].find(row => row.id.includes('one')).sharedRecurrence.notBefore, Date.parse('2030-01-02T09:00:00Z'));
  const history = h.load('utils/sharedRecurrence.ts').sharedRecentHistory(late.entry); assert.equal(history.length, 0); pass('late addition derives no historical/current action and arms next eligible date');
  offline = true; const saved = await workspace.loadSharedDetail('A', 'one', 'series'); assert.equal(saved.cached, true); assert.equal(saved.entry.occurrence, null); pass('recipient activation boundary survives offline cache restore');
  offline = false;
  const foreign = clone(entry); foreign.recipient.userId = 'B'; await alarms.reconcileSharedAlarms('A', 'one', [foreign]); assert.equal(h.alarms.size, 1); pass('foreign account receipt cannot schedule on this account');
  await alarms.clearSharedAlarms('A'); assert.equal(h.alarms.size, 0); stop();
  console.log(`${checks} shared target frontend checks passed`);
}
run().catch(error => { console.error(error); process.exit(1); });
