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
const moduleContext = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../contexts/AuthContext.tsx'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
vm.runInNewContext(code, { module: moduleContext, exports: moduleContext.exports, require: id => {
  if (id === 'react' || id === 'react/jsx-runtime') return require(id);
  if (id.endsWith('authStorage')) return {
    readAuthSession: async () => stored,
    writeAuthSession: async value => { if (failWrite) throw Error('disk unavailable'); stored = value; },
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
  await act(async () => auth.signIn(original));
  await act(async () => {
    await Promise.all([auth.updateUser(original.token, { ...original.user, fullName: 'Saving' }), auth.signOut()]);
  });
  assert.equal(stored, null); assert.equal(auth.session, null);
  console.log('PASS serialized update/logout in either order; no second auth state and no late session restoration');
  await act(async () => root.unmount());
})().catch(error => { console.error(error); process.exitCode = 1; });
