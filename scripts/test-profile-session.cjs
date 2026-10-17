/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react');
const { act } = React;
const { createRoot } = require('react-dom/client');
const original = { token: 'existing-session', user: { id: 'user-1', fullName: 'Original', email: 'original@example.com' } };
let stored = original, auth, failWrite = false;
let writeGate, readGate;
const moduleContext = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../contexts/AuthContext.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
vm.runInNewContext(code, { module: moduleContext, exports: moduleContext.exports, require: id => {
  if (id === 'react' || id === 'react/jsx-runtime') return require(id);
  if (id === 'react-native') return { AppState: { addEventListener: () => ({ remove() {} }) } };
  if (id.endsWith('apiConfig')) return { API_BASE_URL: 'https://notiva.test' };
  if (id.endsWith('sessionTransport')) return { bindSessionTransport: () => () => {}, authenticatedFetch: async () => ({}), revokeRemoteSession: async () => {} };
  if (id.endsWith('itemAccount')) return { selectItemAccount() {} };
  if (id.endsWith('authStorage')) return {
    readAuthSession: async () => { const snapshot = stored; if (readGate) await readGate; return snapshot; },
    writeAuthSession: async value => { if (failWrite) throw Error('disk unavailable'); if (writeGate) await writeGate; stored = value; },
    clearAuthSession: async () => { stored = null; },
  };
  throw Error(`Unexpected import ${id}`);
} });
const { AuthProvider, useAuth } = moduleContext.exports;
function Consumer() { auth = useAuth(); return React.createElement('span', null, auth.session?.user.fullName || 'signed out'); }
const root = createRoot(document.getElementById('root'));
(async () => {
  await act(async () => root.render(React.createElement(AuthProvider, null, React.createElement(Consumer))));
  assert.equal(auth.session.user.fullName, 'Original');
  await act(async () => auth.updateUser(original.token, { ...original.user, fullName: 'Updated', organizationCode: 'ORG-ABC123' }));
  assert.equal(document.querySelector('span').textContent, 'Updated');
  assert.equal(stored.user.organizationCode, 'ORG-ABC123');
  assert.equal(stored.token, original.token);
  console.log('PASS profile/organization updates immediately render through existing AuthContext and persist without changing token');
  await act(async () => auth.updateUser('different-token', { ...original.user, fullName: 'Wrong session' }));
  assert.equal(auth.session.user.fullName, 'Updated');
  await act(async () => auth.updateUser(original.token, { ...original.user, id: 'other-user', fullName: 'Wrong user' }));
  assert.equal(auth.session.user.fullName, 'Updated');
  failWrite = true;
  await act(async () => assert.rejects(auth.updateUser(original.token, { ...original.user, fullName: 'Unsaved' })));
  assert.equal(auth.session.user.fullName, 'Updated');
  failWrite = false;
  await act(async () => {
    const logout = auth.signOut();
    const lateProfile = auth.updateUser(original.token, { ...original.user, fullName: 'Late response' });
    await Promise.all([logout, lateProfile]);
  });
  assert.equal(auth.session, null); assert.equal(stored, null);
  console.log('PASS session guards, storage failure handling and logout while a profile response is in flight');
  failWrite = true;
  await act(async () => assert.rejects(auth.signIn(original)));
  assert.equal(auth.session, null); assert.equal(stored, null);
  failWrite = false;
  let releaseLoginWrite, signingIn;
  writeGate = new Promise(resolve => { releaseLoginWrite = resolve; });
  await act(async () => { signingIn = auth.signIn(original); });
  assert.equal(auth.session, null); assert.equal(stored, null);
  await act(async () => { releaseLoginWrite(); await signingIn; });
  assert.equal(auth.session.token, original.token); assert.equal(stored.token, original.token);
  writeGate = undefined;
  console.log('PASS login publishes session only after storage succeeds; failed login write leaves no partial session');
  await act(async () => auth.signIn(original));
  await act(async () => {
    await Promise.all([auth.updateUser(original.token, { ...original.user, fullName: 'Saving' }), auth.signOut()]);
  });
  assert.equal(stored, null); assert.equal(auth.session, null);
  console.log('PASS serialized update/logout in either order; no second auth state and no late session restoration');
  await act(async () => auth.signIn(original));
  let releaseWrite;
  writeGate = new Promise(resolve => { releaseWrite = resolve; });
  let updating, loggingOut;
  await act(async () => { updating = auth.updateUser(original.token, { ...original.user, fullName: 'Delayed disk write' }); });
  await act(async () => { loggingOut = auth.signOut(); });
  assert.equal(auth.session, null, 'logout clears React memory before pending disk writes finish');
  await act(async () => { releaseWrite(); await Promise.all([updating, loggingOut]); });
  assert.equal(auth.session, null); assert.equal(stored, null);
  writeGate = undefined;
  console.log('PASS in-flight persistence cannot restore the session after immediate logout');
  await act(async () => auth.signIn(original));
  const replacement = { token: 'replacement-session', user: { ...original.user, fullName: 'Renewed' } };
  let replaced;
  await act(async () => { replaced = await auth.replaceSession(original.token, replacement); });
  assert.equal(replaced, true); assert.equal(stored.token, replacement.token); assert.equal(auth.session.token, replacement.token);
  await act(async () => auth.updateUser(original.token, { ...original.user, fullName: 'Stale profile' }));
  assert.equal(auth.session.user.fullName, 'Renewed');
  await act(async () => { replaced = await auth.replaceSession(original.token, original); });
  assert.equal(replaced, false);
  failWrite = true;
  await act(async () => assert.rejects(auth.replaceSession(replacement.token, original)));
  assert.equal(auth.session.token, replacement.token); failWrite = false;
  await act(async () => {
    const logout = auth.signOut();
    replaced = await auth.replaceSession(replacement.token, original);
    await logout;
  });
  assert.equal(replaced, false); assert.equal(auth.session, null); assert.equal(stored, null);
  await act(async () => auth.signIn(original));
  writeGate = new Promise(resolve => { releaseWrite = resolve; });
  let replacing;
  await act(async () => { replacing = auth.replaceSession(original.token, replacement); });
  await act(async () => { loggingOut = auth.signOut(); });
  await act(async () => { releaseWrite(); replaced = await replacing; await loggingOut; });
  assert.equal(replaced, false); assert.equal(auth.session, null); assert.equal(stored, null);
  writeGate = undefined;
  await act(async () => auth.signIn({ token: 'different-login', user: original.user }));
  await act(async () => { replaced = await auth.replaceSession(original.token, replacement); });
  assert.equal(replaced, false); assert.equal(auth.session.token, 'different-login');
  console.log('PASS replacement token persists; stale responses, storage failure, logout races and different login are guarded');
  stored = original;
  let releaseRead;
  readGate = new Promise(resolve => { releaseRead = resolve; });
  await act(async () => root.render(React.createElement(AuthProvider, { key: 'slow-startup' }, React.createElement(Consumer))));
  await act(async () => auth.signOut());
  await act(async () => releaseRead());
  assert.equal(auth.session, null); assert.equal(stored, null);
  readGate = undefined;
  await act(async () => root.render(React.createElement(AuthProvider, { key: 'restart' }, React.createElement(Consumer))));
  assert.equal(auth.session, null);
  console.log('PASS stale startup read ignored after logout; fresh startup stays logged out');
  await act(async () => auth.signIn({ ...original, sessionId: 'bound-session', refreshToken: 'old-refresh' }));
  await act(async () => auth.replaceSession(original.token, { ...original, token: 'renewed', sessionId: 'bound-session', refreshToken: 'rotated' }));
  await act(async () => auth.updateUser(original.token, { ...original.user, fullName: 'Saved during renewal' }));
  assert.equal(auth.session.user.fullName, 'Saved during renewal'); assert.equal(stored.refreshToken, 'rotated');
  await act(async () => auth.signOut('different-session')); assert.ok(auth.session);
  await act(async () => auth.signOut('bound-session')); assert.equal(auth.session, null);
  console.log('PASS in-flight profile saves survive same-session renewal; targeted sign-out cannot clear another session');
  await act(async () => root.unmount());
})().catch(error => { console.error(error); process.exitCode = 1; });
