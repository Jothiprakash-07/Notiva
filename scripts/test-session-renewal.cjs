const assert = require('node:assert/strict');
const { harness, makeItem } = require('./test-native-alarms.cjs');
const { fixture } = require('./test-item-sync.cjs');
const response = (status, body = {}) => ({ status, ok: status < 400, json: async () => body });
const original = { token: 'old-token', sessionId: 'session-A', refreshToken: 'refresh-A', accessExpiresAt: '2099-01-01', user: { id: 'A', fullName: 'A' } };
function setup() {
  let current = { ...original }, fetcher;
  const calls = [], changes = [], invalidations = [];
  const h = harness('android', Date, { sync: true, fetch: async (url, init) => { calls.push({ url, init }); return fetcher(url, init); } });
  const transport = h.load('services/sessionTransport.ts');
  transport.bindSessionTransport({ current: () => current,
    replace: async (token, next) => { if (current?.token !== token) return false; current = next; changes.push(next); return true; },
    invalidate: async token => { if (current?.token === token) { current = null; invalidations.push(token); } } });
  return { transport, calls, changes, invalidations, get current() { return current; }, set current(value) { current = value; }, fetch(fn) { fetcher = fn; } };
}
async function run() {
  let h = setup(), refreshes = 0;
  const renewed = { ...original, token: 'new-token', refreshToken: 'refresh-B' };
  h.fetch(async (url, init) => {
    if (url.endsWith('/refresh')) { refreshes++; assert.equal(JSON.parse(init.body).refreshToken, 'refresh-A'); return response(200, renewed); }
    return response(init.headers.Authorization === 'Bearer new-token' ? 200 : 401);
  });
  const results = await Promise.all([h.transport.authenticatedFetch('/profile', {}, original.token), h.transport.authenticatedFetch('/items', {}, original.token)]);
  assert.ok(results.every(r => r.ok)); assert.equal(refreshes, 1); assert.equal(h.current.refreshToken, 'refresh-B'); assert.equal(h.changes.length, 1);
  console.log('PASS simultaneous expired requests share one renewal and retry with the persisted replacement');

  h = setup(); h.current = { ...original, accessExpiresAt: '2020-01-01' };
  h.fetch(async url => url.endsWith('/refresh') ? response(200, renewed) : response(200));
  await h.transport.authenticatedFetch('/items', {}, original.token);
  assert.ok(h.calls[0].url.endsWith('/refresh')); assert.equal(h.calls[1].init.headers.Authorization, 'Bearer new-token');
  console.log('PASS stored expired access renews before sending authenticated work');

  h = setup(); h.fetch(async () => response(401));
  await h.transport.authenticatedFetch('/items', {}, original.token);
  assert.equal(h.current, null); assert.equal(h.invalidations.length, 1);
  h = setup(); h.fetch(async url => { if (url.endsWith('/refresh')) throw Error('offline'); return response(401); });
  await assert.rejects(h.transport.authenticatedFetch('/items', {}, original.token)); assert.equal(h.current.token, original.token); assert.equal(h.invalidations.length, 0);
  h.fetch(async url => response(url.endsWith('/refresh') ? 503 : 401));
  await assert.rejects(h.transport.authenticatedFetch('/items', {}, original.token)); assert.equal(h.current.token, original.token);
  console.log('PASS revoked refresh clears authentication; offline and server errors preserve local access');

  h = setup(); let release;
  h.fetch(async url => url.endsWith('/refresh') ? new Promise(resolve => { release = resolve; }) : response(401));
  const pending = h.transport.authenticatedFetch('/items', {}, original.token);
  await new Promise(resolve => setImmediate(resolve));
  h.current = { ...original, token: 'account-B', sessionId: 'session-B', user: { id: 'B' } };
  release(response(200, renewed)); await pending;
  assert.equal(h.current.user.id, 'B'); assert.equal(h.changes.length, 0); assert.equal(h.calls.length, 2);
  console.log('PASS late renewal cannot restore an old account or replay work under a different account');

  h = setup(); h.fetch(async () => { throw Error('offline'); });
  await h.transport.revokeRemoteSession(original); assert.equal(h.calls.length, 1);
  assert.equal(JSON.parse(h.calls[0].init.body).sessionId, original.sessionId);
  console.log('PASS remote logout carries only own session proof and tolerates offline failure');

  const integration = fixture();
  let session = { ...original, token: 'A' };
  const account = integration.account(); account.selectItemAccount(session);
  integration.load('services/sessionTransport.ts').bindSessionTransport({ current: () => session,
    replace: async () => assert.fail('revoked session must not renew'),
    invalidate: async token => { assert.equal(token, 'A'); session = null; account.selectItemAccount(null); } });
  await integration.storage().saveItem(makeItem({ id: 'pending-private-reminder' }));
  const alarmCount = integration.alarms.size;
  integration.online(true); integration.fail(401);
  await integration.sync().syncItems();
  assert.equal(session, null); assert.equal(account.getItemAccount(), null);
  const local = await integration.queue().readItemSyncState('A');
  assert.equal(local.items.length, 1); assert.equal(local.queue.length, 1); assert.equal(integration.alarms.size, alarmCount);
  integration.select('B'); assert.equal((await integration.storage().getItems()).length, 0);
  integration.select('A'); integration.fail(undefined); await integration.sync().syncItems();
  assert.equal((await integration.queue().readItemSyncState('A')).queue.length, 0);
  console.log('PASS revoked-device sync stops, keeps pending reminders/alarms isolated, and resumes after legitimate account selection');

  const secure = new Map(); let generated = 0;
  const identity = harness('android', Date, { mocks: {
    'expo-secure-store': { getItemAsync: async key => secure.get(key), setItemAsync: async (key, value) => secure.set(key, value) },
    'expo-modules-core': { uuid: { v4: () => { generated++; return '11111111-1111-4111-8111-111111111111'; } } },
    'expo-constants': { default: { expoConfig: { version: '1.0' } } },
  } });
  const devices = await Promise.all([identity.load('services/deviceIdentity.ts').getLoginDevice(), identity.load('services/deviceIdentity.ts').getLoginDevice()]);
  assert.equal(generated, 1); assert.equal(devices[0].deviceId, devices[1].deviceId);
  identity.restart(); assert.equal((await identity.load('services/deviceIdentity.ts').getLoginDevice()).deviceId, devices[0].deviceId); assert.equal(generated, 1);
  console.log('PASS installation UUID is generated once, stored securely, survives restart, and requires no hardware identifiers');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
