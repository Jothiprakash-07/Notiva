const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const local = { id: 'one', title: 'My title', description: 'My description', type: 'reminder', repeat: 'none', startAt: '2026-10-21T12:00:00Z' };
let owner = 'A', deleting = false;
const choices = [], navigation = [], listeners = new Set();
const row = () => ({ id: 'one', operationId: 'reviewed', deleting, local, conflict: { serverItem: { ...local, title: 'Server title', description: 'Server description', serverRevision: 4 } } });
const storage = {
  getItemConflicts: async account => account === 'A' ? [row()] : [],
  subscribeItemRestore: fn => { listeners.add(fn); return () => listeners.delete(fn); },
  resolveItemConflict: async (...args) => { choices.push(args); },
};
const native = {
  Text: ({ children }) => React.createElement('span', null, children),
  View: ({ children }) => React.createElement('div', null, children),
  ScrollView: ({ children }) => React.createElement('main', null, children),
  ActivityIndicator: () => React.createElement('span', null, 'Loading'),
  Pressable: ({ children, onPress, disabled, accessibilityLabel }) => React.createElement('div', { role: 'button', onClick: disabled ? undefined : onPress, 'aria-label': accessibilityLabel }, typeof children === 'function' ? children({ pressed: false }) : children),
  StyleSheet: { create: value => value }, AppState: { addEventListener: () => ({ remove() {} }) },
};
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '..', relative);
  if (cache.has(file)) return cache.get(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return native;
    if (name === 'expo-router') return { Stack: { Screen: () => null }, useLocalSearchParams: () => ({ id: 'one' }), router: { push: value => navigation.push(value) } };
    if (name.includes('contexts/AuthContext')) return { useAuth: () => ({ session: { user: { id: owner } } }) };
    if (name.includes('services/itemStorage')) return storage;
    if (name === '@expo/vector-icons/Ionicons') return { default: () => null };
    return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name + '.ts')));
  } });
  cache.set(file, module.exports); return module.exports;
}
async function run() {
  const root = createRoot(document.getElementById('root'));
  const render = async (Component, props) => React.act(async () => root.render(React.createElement(Component, props)));
  const Card = load('components/home/ReminderCard.tsx').default;
  let opens = 0;
  await render(Card, { ...local, status: 'Pending', date: 'Today', time: '12 PM', onPress() {}, onResolveConflict: () => opens++ });
  assert.ok(document.body.textContent.includes('Sync conflict'));
  await React.act(async () => document.querySelector('[aria-label="Resolve sync conflict"]').click()); assert.equal(opens, 1);
  const Notice = load('components/common/ItemConflictNotice.tsx').default;
  deleting = true; await render(Notice);
  await React.act(async () => document.querySelector('[role="button"]').click());
  assert.equal(navigation[0].params.id, 'one');
  const Screen = load('app/screens/sync-conflict.tsx').default;
  await render(Screen);
  assert.ok(document.body.textContent.includes('before your deletion completed'));
  assert.ok(document.body.textContent.includes('Pending deletion'));
  deleting = false; await React.act(async () => listeners.forEach(fn => fn()));
  for (const text of ['Resolve sync conflict', 'LOCAL VERSION', 'SERVER VERSION', 'My title', 'Server title', 'My description', 'Server description', 'Changed']) assert.ok(document.body.textContent.includes(text), text);
  assert.ok(!document.body.textContent.includes('serverRevision'));
  const click = async label => React.act(async () => [...document.querySelectorAll('[role="button"]')].find(button => button.textContent === label).click());
  await click('Keep Mine'); await click('Use Server Version');
  assert.deepEqual(choices, [['A', 'one', 'reviewed', 'mine'], ['A', 'one', 'reviewed', 'server']]);
  owner = 'B'; await render(Screen);
  assert.ok(!document.body.textContent.includes('My title')); assert.ok(!document.body.textContent.includes('Server title'));
  await React.act(async () => root.unmount());
  console.log('PASS rendered conflict badge/open, delete notice/navigation, local/server comparison, changed fields, both actions and account isolation');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
