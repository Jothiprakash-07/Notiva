const assert = require('node:assert/strict');
const { harness } = require('./test-native-alarms.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
const wait = () => new Promise(resolve => setImmediate(resolve));
const org = (id, role = 'owner', permissions = [], enabled = true) => ({ organization: { id, name: `Workspace ${id}`, status: 'active', employeeSharingEnabled: enabled }, membership: { organizationId: id, userId: 'A', role, permissions, status: 'active' } });
const entry = (id, organizationId = 'one', overrides = {}) => ({ item: { id, organizationId, title: `Shared ${id}`, description: 'Shared description', type: 'task', status: 'active', createdByUserId: 'A',
  schedule: { startAt: new Date(Date.now() + 3600000).toISOString(), alertBefore: { label: '5 minutes', minutes: 5 } }, completionMode: 'individual', serverRevision: 1, scheduleRevision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...overrides },
  recipient: { userId: 'A', status: 'pending', accessStatus: 'active', recipientRevision: 1 }, alarm: { eligible: true, key: `${organizationId}:${id}:1`, scheduleRevision: 1 }, targets: [{ targetType: 'user', targetId: 'A' }],
  recipientSummary: [{ status: 'pending', accessStatus: 'active', count: 2 }] });
async function run() {
  let checks = 0, offline = false, lostPost = false, statusOverride, failAfterAction = false, detailGate;
  const check = label => { checks++; console.log(`PASS ${label}`); };
  const organizations = { A: [org('one'), org('two')], B: [org('other')] };
  const rows = new Map([['one', [entry('first'), entry('collective', 'one', { completionMode: 'collective' })]], ['two', [entry('second', 'two')]], ['other', []]]);
  const calls = [], creates = new Map();
  const fetch = async (url, init) => {
    const path = new URL(url).pathname.split('/api/organizations')[1], parts = path.split('/').filter(Boolean), query = new URL(url).searchParams;
    const account = init.headers.Authorization?.replace('Bearer ', ''), body = init.body && JSON.parse(init.body);
    calls.push({ path, account, method: init.method, body });
    if (offline) throw Error('offline');
    const response = (status, data) => ({ status, ok: status < 400, json: async () => clone(data) });
    if (statusOverride?.(path, init.method)) return response(statusOverride(path, init.method), { message: 'Denied' });
    const slice = data => data.slice(Number(query.get('offset') || 0), Number(query.get('offset') || 0) + Number(query.get('limit') || 100));
    if (!parts.length) return response(200, { organizations: slice(organizations[account] || []) });
    const organization = (organizations[account] || []).find(row => row.organization.id === parts[0]);
    if (!organization) return response(403, { message: 'Active organization membership required.' });
    if (parts.length === 1) return response(200, organization);
    if (parts[1] === 'teams') return response(200, { teams: [{ id: 'sales', name: 'Sales', memberCount: 2 }] });
    if (parts[1] === 'members') return response(200, { members: [{ userId: 'A', profile: { fullName: 'Alice', notivaId: 'alice' }, role: 'owner' }] });
    const values = rows.get(parts[0]) || [];
    if (init.method === 'POST' && parts.length === 2) {
      let value = creates.get(body.clientRequestId);
      if (!value) { value = entry(`created-${creates.size}`, parts[0], body); creates.set(body.clientRequestId, value); values.push(value); }
      if (lostPost) { lostPost = false; throw Error('response lost'); }
      return response(201, value);
    }
    if (parts[2] === 'inbox' || parts[2] === 'created-by-me' || parts.length === 2) return response(200, { items: slice(values) });
    const value = values.find(row => row.item.id === parts[2]); if (!value) return response(403, { message: 'Receipt revoked.' });
    if (parts[3] === 'recipients') return response(200, { recipients: [value.recipient] });
    if (init.method === 'GET') { if (detailGate) await detailGate; return response(200, value); }
    if (body.expectedRevision !== value.item.serverRevision) return response(409, { message: 'Changed.' });
    if (init.method === 'PATCH') { Object.assign(value.item, body); value.item.serverRevision++; value.item.scheduleRevision++; value.alarm.key += ':edit'; }
    else if (parts[3] === 'cancel') { value.item.status = 'cancelled'; value.item.serverRevision++; value.alarm.eligible = false; }
    else { value.recipient.status = parts[3] === 'acknowledge' ? 'acknowledged' : 'completed'; value.recipient.recipientRevision++; value.alarm.eligible = false;
      if (value.item.completionMode === 'collective') { value.item.status = 'completed'; value.item.completedByUserId = account; value.item.serverRevision++; } }
    if (failAfterAction) offline = true;
    return response(200, value);
  };
  const h = harness('android', Date, { sync: true, fetch });
  const account = h.load('services/itemAccount.ts');
  const select = id => account.selectItemAccount(id ? { user: { id }, token: id, sessionId: `session-${id}` } : null);
  select('A');
  const workspace = h.load('services/sharedWorkspace.ts'), cache = h.load('services/sharedCache.ts'), alarms = h.load('services/sharedAlarms.ts');
  let stop = workspace.startSharedWorkspace('A');
  await wait(); await workspace.refreshSharedWorkspace();
  assert.equal(workspace.getWorkspaceState().organizations.length, 2); assert.equal(workspace.getWorkspaceState().selectedId, 'one');
  check('organization context loads current memberships and fallback selection');
  await workspace.selectSharedOrganization('two'); assert.equal((await cache.readSharedStorage(cache.sharedAccountKey('A'), {})).selectedId, 'two');
  assert.equal(h.alarms.size, 3); check('org switching persists per account without cancelling other-org alerts');
  const firstList = await workspace.loadSharedList('A', 'one', 'inbox'); assert.equal(firstList.entries.length, 2);
  assert.equal((await workspace.loadSharedList('A', 'one', 'created')).entries[0].recipientSummary[0].count, 2); check('inbox and enriched Created by Me load with recipient summaries');
  const firstDetail = await workspace.loadSharedDetail('A', 'one', 'first'); assert.equal(firstDetail.cached, false);
  assert.equal(firstDetail.entry.item.organizationId, 'one'); check('detail content is scoped and cached separately');
  assert.equal(workspace.dedupeSharedEntries([entry('same'), entry('same', 'one', { serverRevision: 2 }), entry('foreign', 'two')], 'one').length, 1);
  assert.equal(workspace.dedupeSharedEntries([entry('same'), entry('same', 'one', { serverRevision: 2 })], 'one')[0].item.serverRevision, 2); check('moving pages dedupe shared identity using newest revision and reject foreign rows');
  const perms = h.load('utils/sharedPermissions.ts');
  assert.deepEqual(clone(perms.allowedTargetModes(org('one'))), ['organization', 'team', 'user']); check('Owner has all creation target modes');
  assert.equal(perms.canCreateSharedItem(org('one', 'admin')), false);
  assert.equal(perms.canCreateSharedItem(org('one', 'admin', ['create_shared_items'])), true);
  assert.equal(perms.canEditSharedItem(org('one', 'admin', ['create_shared_items']), firstDetail.entry, 'A'), false); check('Admin create and edit permissions stay independent');
  assert.deepEqual(clone(perms.allowedTargetModes(org('one', 'member'))), ['user']);
  assert.equal(perms.canCreateSharedItem(org('one', 'member', [], false)), false); check('Member sharing is employee-only and policy-gated');
  assert.equal(perms.canEditSharedItem(org('one', 'member'), { ...firstDetail.entry, targets: [{ targetType: 'team', targetId: 'sales' }] }, 'A'), false);
  check('demoted creators cannot edit broad-target items as Members');
  assert.deepEqual(clone(perms.recipientActions({ ...firstDetail.entry, item: { ...firstDetail.entry.item, type: 'event' } })), ['acknowledge']);
  assert.deepEqual(clone(perms.recipientActions({ ...firstDetail.entry, item: { ...firstDetail.entry.item, status: 'cancelled' } })), []);
  assert.deepEqual(clone(perms.recipientActions({ ...firstDetail.entry, item: { ...firstDetail.entry.item, status: 'completed' } })), []); check('Event acknowledgement and cancelled/completed recipient controls');
  const builder = h.load('utils/sharedDraft.ts'), draftValues = { type: 'task', title: 'Plan', description: '', start: new Date(Date.now() + 3600000), end: new Date(Date.now() + 7200000), completionMode: 'individual', mode: 'user', teamIds: [], userIds: ['A', 'employee'], preAlert: 5 };
  const individual = builder.buildSharedDraft(draftValues, org('one'));
  assert.equal(individual.completionMode, 'individual'); assert.equal(individual.targets.length, 2);
  const collective = builder.buildSharedDraft({ ...draftValues, completionMode: 'collective' }, org('one'));
  assert.equal(collective.collectiveRule, 'any'); assert.equal('recurrence' in collective, false); check('individual/collective ANY create payloads omit recurrence');
  assert.equal(builder.buildSharedDraft({ ...draftValues, mode: 'team', teamIds: ['sales', 'design'] }, org('one')).targets.length, 2);
  assert.equal(builder.buildSharedDraft({ ...draftValues, mode: 'organization' }, org('one')).targets[0].targetType, 'organization');
  assert.throws(() => builder.buildSharedDraft({ ...draftValues, mode: 'team' }, org('one', 'member'))); check('team multi-select, selected employees and organization targeting obey scope');
  assert.equal(perms.toggleTarget(['sales'], 'design').length, 2); assert.equal(perms.toggleTarget(['sales', 'design'], 'sales')[0], 'design'); check('multi-select state toggles independently');
  const nativeId = [...h.alarms.keys()].find(id => id.includes('first'));
  assert.ok(nativeId.includes('notiva-account[A]::notiva-shared[one]::first'));
  assert.equal([...h.alarms.values()].find(row => row.id === nativeId).preAlertMinutes, 5); check('stable shared/account alarm namespace reuses existing native pre-alert scheduler');
  const cancelBefore = h.cancelled.length;
  await alarms.reconcileSharedAlarms('A', 'one', rows.get('one')); await alarms.reconcileSharedAlarms('A', 'one', rows.get('one'));
  assert.equal(h.alarms.size, 3); assert.equal(h.cancelled.length, cancelBefore); check('repeat reconciliation schedules no duplicate native alarms');
  await workspace.mutateSharedClient('A', 'one', 'first', 'complete', 1);
  assert.equal((await cache.readSharedCache('A', 'one')).details.first.recipient.status, 'completed');
  assert.equal(h.alarms.has(nativeId), false); check('recipient completion refreshes own status and cancels own alarm');
  await workspace.mutateSharedClient('A', 'one', 'collective', 'complete', 1);
  assert.equal((await workspace.loadSharedList('A', 'one', 'inbox')).entries.find(row => row.item.id === 'collective').item.status, 'completed');
  assert.equal(h.alarms.size, 1); check('collective completion refreshes inbox and suppresses all local eligibility');
  await workspace.mutateSharedClient('A', 'two', 'second', 'cancel', 1); assert.equal(h.alarms.size, 0);
  assert.equal((await workspace.loadSharedList('A', 'two', 'inbox')).entries[0].item.status, 'cancelled'); check('cancellation remains in history and cancels alarms');
  rows.get('one').push(entry('revision'));
  await workspace.refreshSharedWorkspace(); await workspace.loadSharedDetail('A', 'one', 'revision');
  rows.get('one').find(row => row.item.id === 'revision').item.serverRevision = 2;
  await assert.rejects(workspace.mutateSharedClient('A', 'one', 'revision', 'edit', 1, { title: 'Stale', description: '', schedule: draftValues }), error => error.status === 409);
  assert.equal((await cache.readSharedCache('A', 'one')).details.revision.item.serverRevision, 2); check('edit conflict refreshes authoritative shared revision without personal conflict UI');
  const api = h.load('services/sharedApi.ts');
  calls.length = 0; await api.sharedApi.edit('A', 'one', 'revision', { title: 'Changed', description: '', schedule: { startAt: individual.schedule.startAt } }, 2);
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['description', 'expectedRevision', 'schedule', 'title']); check('edit contract never sends targets or recurrence');
  offline = true; assert.equal((await workspace.loadSharedDetail('A', 'one', 'revision')).cached, true); offline = false; check('offline detail is a marked read-only snapshot');
  statusOverride = path => path.endsWith('/revision') ? 403 : 0;
  await assert.rejects(workspace.loadSharedDetail('A', 'one', 'revision'), error => error.status === 403);
  assert.equal((await cache.readSharedCache('A', 'one')).details.revision, undefined); statusOverride = undefined; check('denied detail evicts cached content and its alarm');
  lostPost = true;
  await assert.rejects(workspace.createSharedClient('A', 'one', individual));
  const pending = (await cache.readSharedCache('A', 'one')).pendingCreate;
  assert.ok(pending.clientRequestId); await workspace.createSharedClient('A', 'one', individual);
  assert.equal(creates.size, 1); assert.equal((await cache.readSharedCache('A', 'one')).pendingCreate, undefined); check('lost create response persists and reuses one idempotency key');
  const created = rows.get('one').find(row => row.item.id.startsWith('created'));
  await workspace.loadSharedDetail('A', 'one', created.item.id); await workspace.refreshSharedWorkspace();
  failAfterAction = true;
  await workspace.mutateSharedClient('A', 'one', created.item.id, 'complete', 1); failAfterAction = false;
  assert.equal((await cache.readSharedCache('A', 'one')).details[created.item.id].recipient.status, 'completed');
  assert.ok(![...h.alarms.keys()].some(id => id.endsWith(created.item.id))); offline = false; check('successful action evidence cancels alarm even when follow-up refresh is offline');
  organizations.A = [org('two')]; await workspace.refreshSharedWorkspace();
  assert.equal(workspace.getWorkspaceState().selectedId, 'two'); assert.equal(Object.keys((await cache.readSharedCache('A', 'one')).details).length, 0);
  assert.ok(![...h.alarms.keys()].some(id => id.includes('[one]'))); check('membership loss removes organization, purges cache and cancels its alarms');
  let release;
  detailGate = new Promise(resolve => { release = resolve; });
  const late = workspace.loadSharedDetail('A', 'two', 'second'); await wait();
  await workspace.revokeSharedOrganization('A', 'two'); release();
  await assert.rejects(late, error => error.status === 401); detailGate = undefined;
  assert.equal((await cache.readSharedCache('A', 'two')).details.second, undefined); check('late responses cannot repopulate a cache after detected membership revocation');
  assert.notEqual(cache.sharedCacheKey('A', 'one'), cache.sharedCacheKey('B', 'one')); assert.notEqual(cache.sharedCacheKey('A', 'one'), cache.sharedCacheKey('A', 'two'));
  assert.deepEqual(clone((await cache.readSharedCache('B', 'one')).lists), {}); check('account and organization cache namespaces are isolated');
  stop(); select('B'); stop = workspace.startSharedWorkspace('B'); await wait(); await workspace.refreshSharedWorkspace();
  assert.equal(workspace.getWorkspaceState().account, 'B'); assert.equal(workspace.getWorkspaceState().selectedId, 'other'); check('account switch discards prior UI context and selects only own orgs');
  stop(); select(null); await alarms.clearSharedAlarms('B');
  assert.ok(![...h.files.keys()].some(key => key.includes('notiva.item.sync.queue') || key.includes('notiva.items.v1'))); check('shared workflow never writes personal item storage');
  for (const os of ['android', 'ios']) {
    const device = harness(os, Date, { sync: true }); device.load('services/itemAccount.ts').selectItemAccount({ user: { id: 'A' }, token: 'A' });
    let scheduler = device.load('services/sharedAlarms.ts'); const values = [entry('restart')];
    await scheduler.reconcileSharedAlarms('A', 'one', values); const size = os === 'android' ? device.alarms.size : device.expo.size;
    device.restart(); device.load('services/itemAccount.ts').selectItemAccount({ user: { id: 'A' }, token: 'A' }); scheduler = device.load('services/sharedAlarms.ts');
    await scheduler.reconcileSharedAlarms('A', 'one', values); assert.equal(os === 'android' ? device.alarms.size : device.expo.size, size);
    const updated = clone(values); updated[0].item.schedule.startAt = new Date(Date.now() + 7200000).toISOString(); updated[0].alarm.key += ':2';
    await scheduler.reconcileSharedAlarms('A', 'one', updated); assert.equal(os === 'android' ? device.alarms.size : device.expo.size, size);
    await scheduler.clearSharedAlarms('A'); assert.equal(device.alarms.size + device.expo.size, 0);
  }
  check('Android/iOS relaunch and schedule replacement preserve one logical alert pair');
  console.log(`${checks} shared frontend service checks passed`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
