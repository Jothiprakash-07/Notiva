/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Run the actual organization API and renewal transport together.
async function scenario(expired) {
  let session = { user: { id: 'creator' }, token: 'fresh-login', sessionId: 'device-session',
    refreshToken: 'refresh-proof', accessExpiresAt: expired ? '2020-01-01' : '2099-01-01' };
  const calls = [], cache = new Map();
  const details = { name: 'Office', email: 'office@example.com', mobileNumber: '9999999999', address: 'Office address' };
  const response = body => ({ status: 200, ok: true, json: async () => body });
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith('/refresh')) return response({ ...session, token: 'renewed-token', refreshToken: 'rotated-proof', accessExpiresAt: '2099-01-01' });
    assert.equal(init.headers.Authorization, `Bearer ${expired ? 'renewed-token' : 'fresh-login'}`);
    assert.deepEqual(JSON.parse(init.body), details);
    assert.ok(url.endsWith('/api/organizations'));
    return { ...response({ organization: { id: 'org', name: details.name, joinCode: 'ORG-123456789ABC' }, membership: { role: 'owner' } }), status: 201 };
  };
  function load(relative) {
    const file = path.resolve(__dirname, '..', relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, fetch: fetcher, AbortController, setTimeout, clearTimeout, Date,
      require: name => {
        if (name.endsWith('apiConfig')) return { API_BASE_URL: 'http://test' };
        if (name.endsWith('itemAccount')) return { getItemSyncSession: () => session };
        return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name + '.ts')));
      } });
    return module.exports;
  }
  load('services/sessionTransport.ts').bindSessionTransport({ current: () => session,
    replace: async (token, next) => { assert.equal(token, session.token); session = next; return true; },
    invalidate: async () => assert.fail('Valid creation must not invalidate the session') });
  const api = load('services/sharedApi.ts').organizationApi;
  const result = await api.create('creator', details);
  assert.equal(result.membership.role, 'owner');
  assert.equal(calls.filter(call => call.url.endsWith('/api/organizations')).length, 1);
  assert.equal(calls.filter(call => call.url.endsWith('/refresh')).length, expired ? 1 : 0);
  session = { ...session, user: { id: 'different-account' } };
  const count = calls.length;
  await assert.rejects(api.create('creator', details), error => error.status === 401);
  assert.equal(calls.length, count);
}
(async () => {
  await scenario(false); await scenario(true);
  console.log('PASS organization creation uses fresh login bearer; expired access renews before one POST; account mismatch never sends');
})().catch(error => { console.error(error); process.exitCode = 1; });
