/* global __dirname */
// Render the real Login screen; mock only native controls, API and auth boundary.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window; global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const root = createRoot(document.getElementById('root'));
let calls, sessions, routes, notices, registrations, request, persist, key = 0;
const controls = {};
let restoredSession = null, authLoading = false;
const view = tag => ({ children, onPress, accessibilityLabel, accessibilityRole, accessibilityState, disabled, ...props }) => {
  if (tag === 'section') controls.scroll = props;
  if (tag === 'main') controls.keyboard = props;
  return React.createElement(tag === 'button' && !accessibilityRole ? 'div' : tag, { onClick: onPress, 'aria-label': accessibilityLabel,
    role: accessibilityRole, 'aria-busy': accessibilityState?.busy, disabled }, children);
};
const native = {
  Platform: { OS: 'android' }, StyleSheet: { create: value => value },
  View: view('div'), Text: view('span'), Pressable: view('button'), SafeAreaView: view('div'),
  ScrollView: view('section'), KeyboardAvoidingView: view('main'), Image: () => null, ActivityIndicator: () => null,
  Alert: { alert: (...args) => notices.push(args) },
  Modal: ({ visible, children }) => visible ? React.createElement('article', null, children) : null,
  TextInput: React.forwardRef(({ value, placeholder, onChangeText, onSubmitEditing, accessibilityLabel, secureTextEntry, editable, onFocus, onBlur }, ref) =>
    React.createElement('input', { ref, value, placeholder, 'aria-label': accessibilityLabel, type: secureTextEntry ? 'password' : 'text',
      disabled: editable === false, onInput: event => onChangeText(event.target.value), onChange() {}, onFocus, onBlur,
      onKeyDown: event => { if (event.key === 'Enter') onSubmitEditing?.(); } })),
};
const source = fs.readFileSync(path.join(__dirname, '../app/screens/login/LoginScreen.tsx'), 'utf8');
const moduleContext = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText, {
  module: moduleContext, exports: moduleContext.exports, Error, TypeError, SyntaxError, AbortController, setTimeout, clearTimeout,
  fetch: async (...args) => { calls.push(args); return request(...args); },
  require: name => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return native;
    if (name === 'react-native-safe-area-context') return { SafeAreaView: native.SafeAreaView };
    if (name === '@expo/vector-icons/Ionicons') return { default: () => null };
    if (name === 'expo-router') return { Redirect: ({ href }) => { React.useEffect(() => { routes.push(href); }, [href]); return null; }, router: { replace: route => routes.push(route), push: route => routes.push(route) } };
    if (name.endsWith('deviceIdentity')) return { getLoginDevice: async () => ({ deviceId: 'test-device' }) };
    if (name.endsWith('apiConfig')) return { API_BASE_URL: 'https://notiva.test' };
    if (name.endsWith('AuthContext')) return { useAuth: () => ({ session: restoredSession, isLoading: authLoading, signIn: async session => { await persist(); sessions.push(session); } }) };
    if (name.endsWith('.png')) return 1;
    throw Error(`Unexpected import: ${name}`);
  },
});
const Screen = moduleContext.exports.default;
const result = (data, ok = true, status = ok ? 200 : 500) => ({ ok, status, json: async () => data });
const session = { token: 'test-token', sessionId: 'session-id', refreshToken: 'refresh', accessExpiresAt: '2099-01-01', user: { id: 'id', fullName: 'Test User', organizationCode: 'ORG-123' } };
async function render() {
  calls = []; sessions = []; routes = []; notices = []; registrations = [];
  request = async () => result(session); persist = async () => {};
  await act(async () => root.render(React.createElement(Screen, { key: ++key,
    onUserRegister: () => registrations.push('user'), onOrganizationRegister: () => registrations.push('organization') })));
}
function button(label) {
  const found = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === label || el.textContent === label);
  assert.ok(found, `Missing ${label}`); return found;
}
async function click(label) { await act(async () => button(label).click()); }
const input = label => document.querySelector(`input[aria-label="${label}"]`);
async function type(label, value) { await act(async () => { input(label).value = value; input(label).dispatchEvent(new window.Event('input', { bubbles: true })); }); }
async function credentials() { await type('Notiva ID', '  person@example.com  '); await type('Password', 'secret  '); }
function enter(label) { input(label).dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); }
async function run() {
  await render();
  assert.ok(document.body.textContent.includes('Welcome back'));
  assert.ok(document.body.textContent.includes('Sign in to continue to Notiva'));
  assert.equal(controls.scroll.keyboardShouldPersistTaps, 'handled');
  assert.equal(controls.keyboard.behavior, 'height'); assert.equal(controls.keyboard.keyboardVerticalOffset, 0);
  await click('Log In'); assert.ok(document.querySelector('[role="alert"]').textContent.includes('Please enter your Notiva ID and password.'));
  await type('Notiva ID', 'bad!'); await type('Password', 'secret'); await click('Log In');
  assert.ok(document.body.textContent.includes('valid Notiva ID or your legacy email'));
  for (const email of ['@.', 'person@@example.com', 'person @example.com', 'person@example..com', 'person@example.com extra']) {
    await type('Notiva ID', email); await click('Log In');
    assert.ok(document.body.textContent.includes('valid Notiva ID or your legacy email'), email);
    assert.equal(calls.length, 0);
  }
  await type('Notiva ID', 'person@example.com'); await type('Password', '123'); await click('Log In');
  assert.ok(document.body.textContent.includes('at least 6')); assert.equal(calls.length, 0);
  await credentials(); assert.equal(document.querySelector('[role="alert"]'), null);
  await act(async () => enter('Notiva ID')); assert.equal(document.activeElement, input('Password'));
  assert.equal(input('Password').type, 'password'); await click('Show password');
  assert.equal(input('Password').type, 'text'); assert.equal(input('Password').value, 'secret  ');
  await click('Hide password'); assert.equal(input('Password').type, 'password');
  await click('Forgot Password?'); await click('Continue with Google');
  assert.deepEqual(notices.map(notice => notice[1]), ['Google Sign-In will be available soon.']);
  assert.equal(calls.length, 0); assert.equal(sessions.length, 0); assert.deepEqual(routes, ['/screens/login/ForgotPasswordScreen']); routes = [];
  await click('Create account');
  await act(async () => [...document.querySelectorAll('button')].find(el => el.textContent.startsWith('User')).click());
  assert.deepEqual(registrations, ['user']); assert.equal(document.querySelector('article'), null);
  await click('Create account');
  await act(async () => [...document.querySelectorAll('button')].find(el => el.textContent.startsWith('Organization')).click());
  assert.deepEqual(registrations, ['user', 'organization']);
  await click('Create account'); await click('Close registration options'); assert.equal(document.querySelector('article'), null);
  let releaseRequest;
  request = () => new Promise(resolve => { releaseRequest = resolve; });
  await act(async () => { enter('Password'); enter('Password'); });
  assert.equal(calls.length, 1, 'synchronous duplicate keyboard submits are ignored');
  assert.ok(button('Logging in').disabled); assert.equal(button('Logging in').getAttribute('aria-busy'), 'true');
  assert.equal(calls[0][0], 'https://notiva.test/api/auth/login');
  assert.equal(calls[0][1].method, 'POST');
  assert.equal(calls[0][1].headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(calls[0][1].body), { identifier: 'person@example.com', password: 'secret  ', deviceId: 'test-device' });
  let releasePersistence;
  persist = () => new Promise(resolve => { releasePersistence = resolve; });
  await act(async () => releaseRequest(result(session)));
  assert.equal(routes.length, 0, 'navigation awaits AuthContext persistence');
  await act(async () => releasePersistence());
  assert.equal(sessions[0].token, session.token); assert.equal(sessions[0].user.organizationCode, 'ORG-123');
  assert.deepEqual(routes, ['/(tabs)']);
  for (const [response, expected] of [
    [() => result({ message: 'Invalid Notiva ID or password.' }, false, 401), 'Invalid Notiva ID or password.'],
    [() => result({ message: { secret: 'raw object' } }, false), 'Unable to log in right now.'],
    [() => result({ message: 'SQL stack trace token=private password=secret' }, false), 'Unable to log in right now.'],
    [() => result({ token: 'incomplete' }), 'Unable to log in right now.'],
    [() => result({ ...session, token: { secret: 'invalid token' } }), 'Unable to log in right now.'],
    [() => result({ ...session, user: { id: 123, fullName: 'Test' } }), 'Unable to log in right now.'],
    [() => { throw new TypeError('Network request failed'); }, 'Unable to connect.'],
    [() => ({ ok: false, json: async () => { throw new SyntaxError('raw server HTML'); } }), 'Unable to log in right now.'],
  ]) {
    await render(); await credentials(); request = response; await click('Log In');
    assert.ok(document.querySelector('[role="alert"]').textContent.includes(expected));
    assert.equal(routes.length, 0); assert.equal(sessions.length, 0); assert.ok(!button('Log In').disabled);
  }
  await render(); await credentials();
  persist = async () => { throw Error('Sensitive storage path and session details'); };
  await click('Log In');
  assert.ok(document.querySelector('[role="alert"]').textContent.includes('Unable to log in right now.'));
  assert.equal(routes.length, 0); assert.equal(sessions.length, 0); assert.ok(!button('Log In').disabled);
  persist = async () => {};
  await click('Log In'); assert.deepEqual(routes, ['/(tabs)'], 'can retry after storage failure');
  await render();
  assert.equal(input('Notiva ID').getAttribute('placeholder'), 'Enter your Notiva ID');
  await type('Notiva ID', 'PERSON_01'); await type('Password', 'secret123'); await click('Log In');
  assert.equal(JSON.parse(calls[0][1].body).identifier, 'person_01');
  assert.equal(sessions[0].token, session.token);
  assert.doesNotMatch(source, /<StatusBar\b/, 'global status bar is retained');
  assert.doesNotMatch(source.slice(0, source.indexOf('{/* Register selection modal */}')), /allowFontScaling=\{false\}/);
  console.log('PASS Login: UI, validation, show/hide, focus, placeholders, registration, duplicate/loading guard, Notiva ID and legacy identifier payloads, preserved session/navigation contract, friendly errors and keyboard/status-bar configuration');
  await render(); await credentials();
  const conflictBody = { code: 'ACTIVE_SESSION_EXISTS', transferToken: 'one-use-proof', userId: 'id', activeSession: { deviceName: 'Vivo device', lastSeenAt: '2026-01-01T00:00:00Z' } };
  request = async () => result(conflictBody, false, 409);
  await click('Log In');
  assert.ok(document.body.textContent.includes('Account already active'));
  assert.ok(document.body.textContent.includes('Vivo device'));
  assert.equal(sessions.length, 0); assert.equal(input('Password').value, '');
  await click('Cancel'); assert.equal(document.querySelector('article'), null); assert.equal(calls.length, 1);
  await credentials(); await click('Log In');
  request = async (url, options) => { assert.ok(url.endsWith('/replace-session'));
    assert.deepEqual(JSON.parse(options.body), { userId: 'id', transferToken: 'one-use-proof', deviceId: 'test-device' }); return result(session); };
  await click('Sign out other device & continue');
  assert.equal(sessions.length, 1); assert.deepEqual(routes, ['/(tabs)']);
  await render(); await credentials(); request = async () => result(conflictBody, false, 409); await click('Log In');
  request = async () => result({}, false, 401); await click('Sign out other device & continue');
  assert.equal(sessions.length, 0); assert.equal(document.querySelector('article'), null);
  assert.ok(document.body.textContent.includes('request expired'));
  console.log('PASS conflict metadata, cancellation without takeover, password clearing, proof-only transfer, success and expired challenge');
  restoredSession = session; routes = [];
  await act(async () => root.render(React.createElement(Screen, { key: ++key })));
  assert.deepEqual(routes, ['/(tabs)']); assert.equal(document.querySelector('input'), null);
  restoredSession = null; routes = [];
  await act(async () => root.render(React.createElement(Screen, { key: ++key })));
  assert.deepEqual(routes, ['/']); assert.equal(document.querySelector('input'), null);
  authLoading = true; routes = [];
  await act(async () => root.render(React.createElement(Screen, { key: ++key })));
  assert.deepEqual(routes, []); assert.equal(document.querySelector('input'), null);
  console.log('PASS direct Login redirects to tabs or canonical entry and waits for session restoration');
  await act(async () => root.unmount());
}
run().catch(error => { console.error(error); process.exitCode = 1; });
