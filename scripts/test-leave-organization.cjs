/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
function load(file, imports, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, ...globals, require: id => {
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    if (id.endsWith('itemAccount')) return { selectItemAccount() {} };
    if (Object.hasOwn(imports, id)) return imports[id];
    throw new Error(`Unexpected dependency (including data deletion or logout): ${id}`);
  } });
  return module.exports;
}
let fetchImpl;
const service = load('services/profileService.ts', { './apiConfig': { API_BASE_URL: 'https://notiva.test' } }, {
  AbortController, setTimeout, clearTimeout, fetch: (...args) => fetchImpl(...args),
});
const original = { token: 'same-token', user: { id: 'user-1', fullName: 'Personal Name', email: 'me@example.com',
  mobileNumber: '1234567890', department: 'Design', role: 'user', organizationCode: 'ORG-ABC123' } };
const linked = { user: original.user, organization: { organizationName: 'Example Org', organizationCode: 'ORG-ABC123' } };
const left = { user: { ...original.user, organizationCode: '' }, organization: null };
let stored, failWrite, auth, updates, getImpl, leaveImpl, leaveCalls, focused = true;
const context = load('contexts/AuthContext.tsx', { '../services/authStorage': {
  readAuthSession: async () => stored,
  writeAuthSession: async value => { if (failWrite) throw Error('disk unavailable'); stored = value; },
  clearAuthSession: async () => assert.fail('must not clear authentication'),
} });
const plain = tag => ({ children }) => React.createElement(tag, null, children);
let handlers = {};
const screen = load('app/screens/profile/OrganizationScreen.tsx', {
  'react-native': { Text: plain('span'), View: plain('div'), ActivityIndicator: () => React.createElement('span', null, 'Loading'),
    Modal: ({ visible, children }) => visible ? React.createElement('div', { role: 'dialog' }, children) : null,
    StyleSheet: { create: value => value } },
  'expo-router': { router: { push: () => {} }, useFocusEffect: callback => React.useEffect(() => focused ? callback() : undefined, [callback, focused]) },
  '../../../contexts/AuthContext': { useAuth: () => {
    auth = context.useAuth();
    const updateUser = React.useCallback(async (token, user) => { updates.push({ token, user }); await auth.updateUser(token, user); }, [auth.updateUser]);
    return { ...auth, updateUser, signOut: () => assert.fail('must not sign out') };
  } },
  '../../../services/profileService': { ProfileError: service.ProfileError,
    getProfile: token => getImpl(token), leaveOrganization: token => { leaveCalls++; return leaveImpl(token); } },
  '../../../components/profile/ProfileUI': { ui: {}, ProfilePage: plain('main'), Info: ({ value }) => React.createElement('span', null, value),
    Action: ({ label, onPress, busy, disabled }) => { handlers[label] = onPress; return React.createElement('button', { disabled: busy || disabled, onClick: onPress }, label); } },
}).default;
let root;
const button = label => [...document.querySelectorAll('button')].find(node => node.textContent === label);
const click = async label => { assert.ok(button(label), `Missing ${label}`); await act(async () => button(label).click()); };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function mount(profile = linked) {
  if (root) await act(async () => root.unmount());
  stored = { ...original, user: { ...profile.user } }; failWrite = false; updates = []; leaveCalls = 0; focused = true; handlers = {};
  getImpl = async () => profile; leaveImpl = async () => left;
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(context.AuthProvider, null, React.createElement(screen))));
}
(async () => {
  let sent;
  fetchImpl = async (url, options) => { sent = { url, options }; return { ok: true, json: async () => left }; };
  assert.equal(await service.leaveOrganization(original.token), left);
  assert.equal(sent.url, 'https://notiva.test/api/auth/leave-organization');
  assert.equal(sent.options.method, 'POST');
  assert.equal(sent.options.headers.Authorization, `Bearer ${original.token}`);
  assert.equal(sent.options.body, undefined);
  const errors = {
    401: 'Your session has expired. Please sign in again.',
    403: 'You are not allowed to leave this organization. Please contact your organization administrator.',
    404: 'Your account could not be found. Please sign in again.',
    409: 'Your organization changed before the leave request completed. Please refresh and try again.',
    503: 'Unable to leave the organization right now. Please try again.',
  };
  for (const [status, message] of Object.entries(errors)) {
    fetchImpl = async () => ({ ok: false, status: Number(status), json: async () => { throw Error('raw server details'); } });
    await assert.rejects(service.leaveOrganization(original.token), error => error.message === message);
  }
  fetchImpl = async () => { throw Error('raw network details'); };
  await assert.rejects(service.leaveOrganization(original.token), error => error.message === errors[503]);
  console.log('PASS endpoint, POST, same token, safe 401/403/404/409/503/network messages');

  await mount();
  assert.ok(button('Leave Organization'));
  await click('Leave Organization');
  assert.ok(document.querySelector('[role="dialog"]'));
  assert.ok(document.body.textContent.includes('Your Notiva account, profile, and personal reminders will remain unchanged.'));
  await click('Cancel');
  assert.equal(document.querySelector('[role="dialog"]'), null);
  assert.equal(leaveCalls, 0);
  assert.equal(updates.length, 0);
  console.log('PASS linked visibility, confirmation text, cancel without API or session changes');

  const pending = deferred();
  leaveImpl = token => { assert.equal(token, original.token); return pending.promise; };
  await click('Leave Organization');
  const confirm = handlers.Leave;
  await act(async () => { confirm(); confirm(); });
  assert.equal(leaveCalls, 1);
  assert.equal(button('Leave').disabled, true);
  await act(async () => pending.resolve(left));
  assert.equal(updates.length, 1);
  assert.equal(updates[0].user, left.user);
  assert.equal(updates[0].token, original.token);
  assert.deepEqual(JSON.parse(JSON.stringify(stored)), { token: original.token, user: left.user });
  assert.equal(auth.session.token, original.token);
  assert.equal(button('Leave Organization'), undefined);
  assert.ok(button('Join Organization'));
  assert.equal(document.body.textContent.includes('Example Org'), false);
  assert.ok(document.body.textContent.includes('You have left the organization.'));
  console.log('PASS one request, duplicate lock, full user persistence, personal fields, same authenticated session, cleared details and immediate Join state');

  await mount(left);
  assert.equal(button('Leave Organization'), undefined);
  console.log('PASS initially unlinked user hides Leave');

  for (const message of [errors[409], errors[503]]) {
    await mount();
    leaveImpl = async () => { throw new service.ProfileError(message); };
    await click('Leave Organization'); await click('Leave');
    assert.ok(document.body.textContent.includes(message));
    assert.equal(updates.length, 0);
    assert.equal(stored.user.organizationCode, original.user.organizationCode);
    assert.ok(button('Refresh Organization'));
  }
  console.log('PASS conflict and service/network failure retain session and offer refresh');

  await mount();
  failWrite = true;
  await click('Leave Organization'); await click('Leave');
  assert.ok(document.body.textContent.includes('could not be saved on this device'));
  assert.equal(document.body.textContent.includes('You have left the organization.'), false);
  assert.equal(document.body.textContent.includes('Example Org'), false);
  assert.ok(button('Join Organization'));
  assert.equal(button('Join Organization').disabled, true);
  getImpl = async () => left;
  await click('Refresh Organization');
  assert.ok(document.body.textContent.includes('could not be saved on this device'));
  failWrite = false;
  await click('Refresh Organization');
  assert.equal(stored.user.organizationCode, '');
  assert.equal(button('Join Organization').disabled, false);
  console.log('PASS storage failure clears visible organization, reports recovery, retries backend reconciliation without relinking');

  await mount();
  leaveImpl = async () => { throw new service.ProfileError(errors[409]); };
  await click('Leave Organization'); await click('Leave');
  await click('Leave Organization');
  const capturedConfirm = handlers.Leave;
  const oldProfile = deferred();
  getImpl = () => oldProfile.promise;
  await click('Refresh Organization');
  leaveImpl = async () => left;
  await act(async () => capturedConfirm());
  await act(async () => oldProfile.resolve(linked));
  assert.equal(document.body.textContent.includes('Example Org'), false);
  assert.ok(button('Join Organization'));
  assert.equal(stored.user.organizationCode, '');
  console.log('PASS profile response started before leave cannot restore the old organization');
  await act(async () => root.unmount());
  console.log('PASS no logout, auth clearing, item/history/settings deletion or alarm dependency invoked');
})().catch(error => { console.error(error); process.exitCode = 1; });
