/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
function load(file, imports, extras = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module, exports: module.exports, Error, ...extras, require: name => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name.endsWith('sessionTransport')) return { authenticatedFetch: (...args) => fetchImpl(...args), bindSessionTransport: () => () => {}, revokeRemoteSession: async () => {} };
    if (name === 'react-native' && !imports[name]) return { AppState: { addEventListener: () => ({ remove() {} }) } };
    if (name.endsWith('apiConfig')) return { API_BASE_URL: 'https://notiva.test' };
    if (name === 'expo-router' && !imports[name]) return { router: { push() {}, replace: route => routes.push(route) } };
    if (name.endsWith('itemAccount')) return { selectItemAccount() {} };
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error(`Unexpected dependency or personal data operation: ${name}`);
  } });
  return module.exports;
}
let timers = new Map(), timerId = 0;
const clock = { setTimeout: (fn, ms) => { timers.set(++timerId, { fn, ms }); return timerId; }, clearTimeout: id => timers.delete(id) };
const view = ({ children }) => React.createElement('div', null, children);
const input = ({ accessibilityLabel, label, value, onChangeText, placeholder, editable, secureTextEntry }) => React.createElement('input', {
  'aria-label': accessibilityLabel || label, value: value || '', placeholder, disabled: editable === false,
  type: secureTextEntry ? 'password' : 'text', onInput: event => onChangeText(event.target.value),
});
const native = { Alert: { alert() {} }, View: view, Text: view, ScrollView: view, KeyboardAvoidingView: view, ActivityIndicator: () => null,
  TextInput: input, Pressable: ({ children, onPress, disabled, accessibilityLabel }) => React.createElement('button', { onClick: onPress, disabled, "aria-label": accessibilityLabel }, children),
  StyleSheet: { create: value => value }, Platform: { OS: 'android' } };
const profileUI = { ui: {}, Action: ({ label, onPress, busy, disabled }) => React.createElement('button', { onClick: onPress, disabled: busy || disabled }, label),
  Field: props => React.createElement(input, props), Info: ({ label, value }) => React.createElement('div', null, `${label}: ${value}`) };
const validation = load('utils/notivaId.ts', {});
let calls = [], handler, routes = [], fetchImpl;
const request = async (...args) => { calls.push(args); return handler(...args); };
const service = load('services/recoveryService.ts', { './apiConfig': { API_BASE_URL: 'https://notiva.test' } }, {
  AbortController, setTimeout, clearTimeout, fetch: (...args) => fetchImpl(...args),
});
const Forgot = load('app/screens/login/ForgotPasswordScreen.tsx', {
  'react-native': native, 'react-native-safe-area-context': { SafeAreaView: view },
  'expo-router': { router: { replace: route => routes.push(route) } },
  '../../../components/profile/ProfileUI': profileUI, '../../../services/recoveryService': { recoveryRequest: request },
  '../../../utils/notivaId': validation,
}, clock).default;
let stored, auth, updates = [], failSessionWrite = false, allowLogout = false;
const context = load('contexts/AuthContext.tsx', { '../services/authStorage': {
  readAuthSession: async () => stored,
  writeAuthSession: async value => { if (failSessionWrite) throw Error('Storage unavailable'); stored = value; },
  clearAuthSession: async () => { assert.ok(allowLogout, 'only deliberate password change/session logout may clear authentication'); stored = null; },
} });
let suggestionCalls = [], availabilityCalls = [];
const identityAPI = {
  suggestNotivaId: async name => { suggestionCalls.push(name); return 'personal-name-a1b2c3'; },
  checkNotivaId: async (value, signal, token) => { availabilityCalls.push({ value, token }); return true; },
};
const identityService = load('services/notivaIdentityService.ts', { './apiConfig': { API_BASE_URL: 'https://notiva.test' } }, {
  fetch: (...args) => fetchImpl(...args),
});
const identityHook = load('hooks/useNotivaIdAvailability.ts', {
  '../services/notivaIdentityService': identityAPI, '../utils/notivaId': validation,
}, { ...clock, AbortController });
const Identity = load('components/profile/IdentitySettings.tsx', {
  '@expo/vector-icons/Ionicons': () => React.createElement('span', null, 'pencil'),
  '../../hooks/useNotivaIdAvailability': identityHook,
  'react-native': native, './ProfileUI': profileUI, '../../utils/notivaId': validation,
  '../../services/recoveryService': { recoveryRequest: request },
  '../../contexts/AuthContext': { useAuth: () => {
    auth = context.useAuth();
    return { ...auth, updateUser: async (token, user) => { updates.push({ token, user }); await auth.updateUser(token, user); } };
  } },
}, clock).default;
let changeHandler;
const ChangePassword = load('app/screens/profile/ChangePasswordScreen.tsx', {
  'react-native': native,
  '../../../contexts/AuthContext': context,
  '../../../components/profile/ProfileUI': { ...profileUI, ProfilePage: view },
  '../../../services/profileService': {
    changePassword: (...args) => changeHandler(...args), ProfileError: class extends Error {},
  },
}).default;
const Register = load('app/screens/login/UserRegisterScreen.tsx', {
  'expo-router': { router: { replace: route => routes.push(route) } },
  '../../../contexts/AuthContext': context,
  '../../../services/notivaIdentityService': identityAPI,
  '../../../hooks/useNotivaIdAvailability': identityHook,
  'react-native': native, 'react-native-safe-area-context': { SafeAreaView: view },
  '@expo/vector-icons/Ionicons': () => null, '../../../utils/notivaId': validation,
  '../../../services/apiConfig': { API_BASE_URL: 'https://notiva.test' },
}, { ...clock, AbortController, fetch: async (...args) => { calls.push(args); return fetchImpl(...args); } }).default;
let root;
async function mount(element) {
  if (root) await act(async () => root.unmount());
  timers.clear(); calls = []; routes = [];
  root = createRoot(document.getElementById('root'));
  await act(async () => root.render(element));
}
const button = label => [...document.querySelectorAll('button')].find(node => node.textContent.trim() === label);
async function click(label) { assert.ok(button(label), `Missing button: ${label}`); await act(async () => button(label).click()); }
async function type(label, value) {
  const node = [...document.querySelectorAll('input')].find(element => element.getAttribute('aria-label') === label || element.placeholder === label);
  assert.ok(node, `Missing input: ${label}`);
  await act(async () => { node.value = value; node.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
(async () => {
  let sent;
  fetchImpl = async (url, options) => { sent = { url, options }; return { ok: true, json: async () => ({}) }; };
  await service.recoveryRequest('set-notiva-id', { notivaId: 'person_01' }, 'existing-token');
  assert.equal(sent.url, 'https://notiva.test/api/auth/set-notiva-id');
  assert.equal(sent.options.headers.Authorization, 'Bearer existing-token');
  for (const status of [400, 401, 409, 429, 503]) {
    fetchImpl = async () => ({ ok: false, status, json: async () => ({ message: 'raw SMTP password stack trace' }) });
    await assert.rejects(service.recoveryRequest('forgot-password'), error => !/SMTP|password|stack/.test(error.message));
  }
  console.log('PASS recovery service uses configured endpoint/auth and filters unsafe errors');

  handler = async name => name === 'verify-reset-otp' ? { resetToken: 'private-reset-authorization' } : {};
  await mount(React.createElement(Forgot));
  assert.ok(document.body.textContent.includes('Separate email verification is optional.'));
  await type('Notiva ID', 'recovery@example.com'); await click('Continue'); assert.equal(calls.length, 0);
  await click('Continue'); assert.equal(calls.length, 0);
  await type('Notiva ID', 'PERSON_01'); await click('Continue');
  assert.equal(calls[0][0], 'forgot-password'); assert.equal(calls[0][1].notivaId, 'person_01');
  assert.ok(document.body.textContent.includes('If the account is eligible for recovery'));
  assert.ok(document.body.textContent.includes('your recovery/contact email'));
  assert.equal(document.body.textContent.includes('your verified recovery email'), false);
  assert.equal(document.body.textContent.includes('@'), false, 'public flow does not leak a destination');
  assert.ok(button('Resend Code (60s)').disabled);
  await type('Verification Code', '123'); await click('Verify'); assert.equal(calls.length, 1);
  await type('Verification Code', '123456'); await click('Verify');
  assert.ok(document.body.textContent.includes('Create New Password'));
  assert.equal(document.body.textContent.includes('private-reset-authorization'), false);
  await type('New Password', 'new-password'); await type('Confirm Password', 'wrong'); await click('Reset Password');
  assert.equal(calls.length, 2);
  await type('Confirm Password', 'new-password'); await click('Reset Password');
  assert.equal(calls[2][0], 'reset-password'); assert.equal(calls[2][1].resetToken, 'private-reset-authorization');
  assert.ok(document.body.textContent.includes('Password Reset Successful'));
  await click('Back to Login'); assert.deepEqual(routes, ['/']);
  console.log('PASS Notiva ID recovery, generic destination, countdown, OTP validation, memory-only reset token, reset and login navigation');

  handler = async () => { throw Error('The verification code is invalid or has expired.'); };
  await mount(React.createElement(Forgot)); await type('Notiva ID', 'person_01'); await click('Continue');
  assert.ok(document.body.textContent.includes('invalid or has expired')); assert.equal(button('Continue').disabled, false);
  console.log('PASS recovery errors remain retryable');

  const user = { id: 'user-1', fullName: 'Personal Name', email: 'legacy@example.com', recoveryEmail: 'legacy@example.com', recoveryEmailVerified: false,
    mobileNumber: '1234567890', department: 'Design', organizationCode: 'ORG-ABC123', role: 'user' };
  stored = { token: 'existing-token', user }; updates = [];
  handler = async (name, body, token) => {
    assert.equal(token, 'existing-token');
    if (name === 'set-notiva-id') return { user: { ...stored.user, notivaId: body.notivaId } };
    if (name === 'send-recovery-email-otp') return { maskedEmail: 'le***@example.com' };
    return { user: { ...stored.user, recoveryEmailVerified: true } };
  };
  await mount(React.createElement(context.AuthProvider, null, React.createElement(Identity)));
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]'), null);
  await act(async () => document.querySelector('button[aria-label="Edit Notiva ID"]').click());
  assert.ok(button('Create Notiva ID')); assert.ok(document.body.textContent.includes('Not Verified'));
  await type('Notiva ID', 'admin'); await click('Create Notiva ID'); assert.equal(calls.length, 0);
  await type('Notiva ID', 'PERSON_01'); await click('Create Notiva ID');
  assert.equal(stored.token, 'existing-token'); assert.deepEqual({ ...stored.user }, { ...user, notivaId: 'PERSON_01' });
  assert.equal(updates[0].user.fullName, user.fullName); assert.equal(updates[0].user.organizationCode, user.organizationCode);
  assert.ok(document.body.textContent.includes('Notiva ID: PERSON_01'));
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]'), null);
  await act(async () => document.querySelector('button[aria-label="Edit Notiva ID"]').click());
  await type('Notiva ID', 'JOTHI-07'); await click('Save Notiva ID');
  assert.equal(stored.user.notivaId, 'JOTHI-07'); assert.equal(stored.token, 'existing-token');
  const openEditor = async () => { await act(async () => document.querySelector('button[aria-label="Edit Notiva ID"]').click()); };
  const flushAvailability = async () => { await act(async () => { for (const [id, timer] of [...timers]) if (timer.ms === 400) { timers.delete(id); timer.fn(); } }); };
  assert.ok(document.querySelector('button[aria-label="Edit Notiva ID"]'));
  const savedText = [...document.querySelectorAll('div')].find(node => node.textContent === 'Notiva ID: JOTHI-07');
  await act(async () => savedText.click());
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]'), null);
  await openEditor();
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]').value, 'JOTHI-07');
  await flushAvailability(); assert.ok(button('Save Notiva ID').disabled);
  assert.ok(!document.body.textContent.includes(identityHook.ID_TAKEN));
  await type('Notiva ID', 'Discard-Me'); const beforeCancel = calls.length;
  await click('Cancel'); assert.equal(calls.length, beforeCancel);
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]'), null);
  await openEditor(); assert.equal(document.querySelector('input[aria-label="Notiva ID"]').value, 'JOTHI-07');
  await type('Notiva ID', 'bad space'); await click('Save Notiva ID');
  assert.ok(document.body.textContent.includes(identityHook.ID_FORMAT)); assert.equal(calls.length, beforeCancel);
  identityAPI.checkNotivaId = async () => false;
  await type('Notiva ID', 'Taken-ID'); await flushAvailability();
  assert.ok(document.body.textContent.includes(identityHook.ID_TAKEN));
  assert.ok(button('Save Notiva ID').disabled); assert.equal(calls.length, beforeCancel);
  identityAPI.checkNotivaId = async () => true;
  await type('Notiva ID', 'jothi-07'); await flushAvailability();
  assert.ok(document.body.textContent.includes('Notiva ID is available'));
  await click('Save Notiva ID'); assert.equal(stored.user.notivaId, 'jothi-07');
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]'), null);
  assert.ok(document.body.textContent.includes('Notiva ID updated.'));
  await openEditor(); await type('Notiva ID', 'Retry-ID'); await flushAvailability();
  const normalHandler = handler;
  handler = async () => { throw Error('Network unavailable'); };
  await click('Save Notiva ID');
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]').value, 'Retry-ID');
  assert.equal(stored.user.notivaId, 'jothi-07'); assert.equal(stored.token, 'existing-token');
  assert.ok(document.body.textContent.includes('Network unavailable'));
  handler = async () => { throw Error(identityHook.ID_TAKEN); };
  await click('Save Notiva ID'); assert.ok(document.body.textContent.includes(identityHook.ID_TAKEN));
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]').value, 'Retry-ID');
  let resolveSave;
  handler = () => new Promise(resolve => { resolveSave = resolve; });
  const beforeSave = calls.length;
  await act(async () => { button('Save Notiva ID').click(); button('Save Notiva ID').click(); });
  assert.equal(calls.length, beforeSave + 1); assert.ok(button('Cancel').disabled);
  await act(async () => resolveSave({ user: { ...stored.user, notivaId: 'Retry-ID' } }));
  assert.equal(stored.user.notivaId, 'Retry-ID'); assert.equal(stored.token, 'existing-token');
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]'), null);
  handler = normalHandler;
  console.log('PASS read-only identity, accessible pencil, text click inert, prefill/cancel, validation/conflicts, case-only save, retry and submission lock');
  await click('Verify Email'); assert.ok(document.body.textContent.includes('le***@example.com'));
  assert.ok(button('Resend Code (60s)').disabled);
  await type('Email Verification Code', '123456'); await click('Verify Code');
  assert.equal(stored.user.recoveryEmailVerified, true); assert.ok(document.body.textContent.includes('Verification Status: Verified'));
  assert.equal(stored.token, 'existing-token'); assert.equal(auth.session.user.organizationCode, 'ORG-ABC123');
  console.log('PASS legacy ID setup without logout, complete user update, preserved token/profile/membership, masked email verification and verified state');

  fetchImpl = async () => ({ ok: true, json: async () => ({ message: 'Account created.', token: 'registration-token', user: { ...user, notivaId: 'JOTHI-07' } }) });
  stored = null;
  await mount(React.createElement(context.AuthProvider, null, React.createElement(Register)));
  await type('Enter your full name', 'Personal Name');
  assert.ok(document.querySelector('input[aria-label="Notiva ID"]'));
  assert.equal(suggestionCalls.length, 0);
  await act(async () => { for (const [id, timer] of [...timers]) if (timer.ms === 400) { timers.delete(id); timer.fn(); } });
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]').value, 'personal-name-a1b2c3');
  await type('Notiva ID', 'JOTHI-07'); await type('Enter your full name', 'Personal Name Changed');
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]').value, 'JOTHI-07');
  await type('john.e07@gmail.com', 'recovery@example.com'); await type('Enter your mobile number', '1234567890');
  await type('Enter password', 'secret123'); await type('Re-enter password', 'secret123');
  const registerButton = [...document.querySelectorAll('button')].find(node => node.textContent.includes('Create account'));
  assert.ok(registerButton); await act(async () => registerButton.click());
  const payload = JSON.parse(calls[0][1].body);
  assert.equal(payload.notivaId, 'JOTHI-07');
  assert.equal(stored, null); assert.equal(document.querySelector('input[placeholder="Enter password"]').value, '');
  assert.deepEqual(routes, ['/']); assert.equal(payload.recoveryEmail, 'recovery@example.com');
  assert.equal(payload.email, undefined); assert.equal(payload.confirmPassword, 'secret123');
  console.log('PASS debounced suggestion, manual edit preservation, final ID payload, no auth persistence and return to Login');
  const runDebounce = async () => { await act(async () => { for (const [id, timer] of [...timers]) if (timer.ms === 400) { timers.delete(id); timer.fn(); } }); };
  let resolveSuggestion;
  const originalSuggestion = identityAPI.suggestNotivaId;
  identityAPI.suggestNotivaId = () => new Promise(resolve => { resolveSuggestion = resolve; });
  stored = null; await mount(React.createElement(context.AuthProvider, null, React.createElement(Register)));
  await type('Enter your full name', 'Earlier name'); await runDebounce();
  await type('Notiva ID', 'MANUAL-ID');
  await act(async () => resolveSuggestion('stale-name-000001'));
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]').value, 'MANUAL-ID');
  await type('Enter your full name', 'Later name'); await runDebounce();
  assert.equal(document.querySelector('input[aria-label="Notiva ID"]').value, 'MANUAL-ID');
  identityAPI.suggestNotivaId = originalSuggestion;
  await type('Notiva ID', '');
  await type('john.e07@gmail.com', 'recovery@example.com'); await type('Enter your mobile number', '1234567890');
  await type('Enter password', 'secret123'); await type('Re-enter password', 'secret123');
  const createButton = () => [...document.querySelectorAll('button')].find(node => node.textContent.includes('Create account'));
  calls = []; await act(async () => createButton().click()); assert.equal(calls.length, 0);
  await type('Notiva ID', 'ADMIN'); await act(async () => createButton().click()); assert.equal(calls.length, 0);
  await type('Notiva ID', 'Taken-ID');
  identityAPI.checkNotivaId = async () => false; await runDebounce();
  assert.ok(document.body.textContent.includes('This Notiva ID is already taken. Please choose another one.'));
  fetchImpl = async () => ({ ok: false, status: 409, json: async () => ({}) });
  await act(async () => createButton().click()); assert.equal(stored, null); assert.deepEqual(routes, []);
  let resolveRegistration;
  fetchImpl = () => new Promise(resolve => { resolveRegistration = resolve; });
  await type('Notiva ID', 'Race-ID'); await act(async () => { createButton().click(); createButton().click(); });
  assert.equal(calls.length, 2, 'one conflict request plus one locked registration request');
  await act(async () => resolveRegistration({ ok: false, status: 503, json: async () => ({}) }));
  assert.equal(createButton().disabled, false);
  console.log('PASS stale suggestions cannot overwrite manual edits; cleared/reserved IDs rejected; taken feedback, conflict and submission lock');

  identityAPI.checkNotivaId = async () => true;
  await runDebounce();
  await type('Notiva ID', 'Available-ID'); await runDebounce();
  assert.ok(document.body.textContent.includes('Notiva ID is available'));
  failSessionWrite = true;
  fetchImpl = async () => ({ ok: true, json: async () => ({ token: 'new-account-token', user: { ...user, notivaId: 'Available-ID' } }) });
  await act(async () => createButton().click());
  assert.equal(stored, null); assert.deepEqual(routes, ['/']);
  assert.ok(document.body.textContent.includes('Account created successfully'));
  assert.equal(createButton().disabled, true);
  failSessionWrite = false;
  console.log('PASS available feedback and registration ignores auth storage and prevents duplicate account creation');

  fetchImpl = async (url, options) => { sent = { url, options }; return { ok: true, json: async () => url.includes('suggestion') ? { suggestedNotivaId: 'name-000001' } : { available: false } }; };
  const signal = new AbortController().signal;
  assert.equal(await identityService.suggestNotivaId('Full Name', signal), 'name-000001');
  assert.equal(JSON.parse(sent.options.body).fullName, 'Full Name');
  assert.equal(await identityService.checkNotivaId('JOTHI-07', signal), false);
  assert.ok(sent.url.includes('/registration/notiva-id/availability?value=JOTHI-07'));
  await identityService.checkNotivaId('JOTHI-07', signal, 'profile-token'); assert.equal(sent.options.headers.Authorization, 'Bearer profile-token');
  fetchImpl = async () => ({ ok: false, status: 503 });
  await assert.rejects(identityService.checkNotivaId('JOTHI-07', signal));
  console.log('PASS identity API uses public/authenticated routes, minimal results and safe network/server errors');

  stored = { token: 'old-access-token', user };
  changeHandler = async (token, currentPassword, newPassword) => {
    assert.equal(token, 'old-access-token'); assert.equal(currentPassword, 'old-password'); assert.equal(newPassword, 'new-password');
    return { token: 'fresh-access-token', user, message: 'Password updated.' };
  };
  await mount(React.createElement(context.AuthProvider, null, React.createElement(ChangePassword)));
  await type('Current Password', 'old-password'); await type('New Password', 'new-password'); await type('Confirm New Password', 'new-password');
  await click('Update Password');
  assert.equal(stored.token, 'fresh-access-token'); assert.deepEqual(stored.user, user);
  assert.ok(document.body.textContent.includes('Password updated. You remain signed in.'));
  console.log('PASS password-change screen persists replacement token and complete user before reporting success');
  allowLogout = true;
  stored = { token: 'current', sessionId: 'own-session', refreshToken: 'own-refresh', user };
  changeHandler = async () => ({ requiresLogin: true, message: 'Password updated. Please sign in again.' });
  await mount(React.createElement(context.AuthProvider, null, React.createElement(ChangePassword)));
  await type('Current Password', 'old-password'); await type('New Password', 'new-password'); await type('Confirm New Password', 'new-password');
  await click('Update Password'); assert.equal(stored, null); assert.deepEqual(routes, ['/']);
  console.log('PASS password change clears current auth and returns to normal login');
  const Sessions = load('app/screens/profile/SessionsScreen.tsx', {
    'react-native': native, '../../../contexts/AuthContext': context,
    '../../../components/profile/ProfileUI': { ...profileUI, ProfilePage: view },
  }, { AbortController, setTimeout, clearTimeout }).default;
  stored = { token: 'current', sessionId: 'own-session', user };
  fetchImpl = async () => ({ ok: true, json: async () => ({ sessions: [{ sessionId: 'own-session', deviceName: 'Long device name '.repeat(5), platform: 'android', lastSeenAt: '2026-01-01', current: true, active: true }] }) });
  await mount(React.createElement(context.AuthProvider, null, React.createElement(Sessions)));
  assert.ok(document.body.textContent.includes('Current device')); assert.ok(document.body.textContent.includes('Active now'));
  assert.ok(document.body.textContent.includes('Last active:')); await click('Sign out'); assert.equal(stored, null);
  assert.ok(fs.readFileSync(path.join(__dirname, '../app/_layout.tsx'), 'utf8').includes('<Stack.Screen name="screens/profile/SessionsScreen" />'));
  console.log('PASS Devices / Sessions current device metadata, status, sign out and protected route');
  await act(async () => root.unmount());
  console.log('PASS auth changes never invoke reminder or alarm deletion');
})().catch(error => { console.error(error); process.exitCode = 1; });
