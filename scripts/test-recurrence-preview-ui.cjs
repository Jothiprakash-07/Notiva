// Render the real card to verify presentation-only previews cannot invoke actions.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window; global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
const native = {
  Text: ({ children }) => React.createElement('span', null, children),
  View: ({ children }) => React.createElement('div', null, children),
  Pressable: ({ children, onPress, onLongPress, disabled }) => React.createElement('div', {
    role: 'button', onClick: disabled ? undefined : onPress, onContextMenu: disabled ? undefined : onLongPress,
  }, typeof children === 'function' ? children({ pressed: false }) : children),
  StyleSheet: { create: value => value },
};
function load(relative) {
  const file = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name === 'react-native') return native;
    if (name === '@expo/vector-icons/Ionicons') return { default: () => null };
    return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name + '.ts')));
  } });
  return module.exports;
}
async function run() {
  const Card = load('components/home/ReminderCard.tsx').default;
  const root = createRoot(document.getElementById('root'));
  let actions = 0;
  const props = { id: 'master', title: 'Daily reminder', type: 'reminder', status: 'Upcoming', date: 'Tomorrow', time: '12 PM',
    onPress: () => actions++, onToggle: () => actions++, onSelect: () => actions++, onLongPress: () => actions++ };
  for (const selectionMode of [false, true]) {
    await React.act(async () => root.render(React.createElement(Card, { ...props, preview: true, selectionMode })));
    assert.ok(document.body.textContent.includes('Preview'));
    await React.act(async () => {
      document.querySelectorAll('[role="button"]').forEach(el => {
        el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
        el.dispatchEvent(new dom.window.MouseEvent('contextmenu', { bubbles: true }));
      });
    });
    assert.equal(actions, 0, 'preview cannot open, toggle, long-press, or select');
  }
  await React.act(async () => root.render(React.createElement(Card, { ...props, status: 'Pending' })));
  await React.act(async () => document.querySelector('[role="button"]').click());
  assert.equal(actions, 1, 'real current card remains actionable');
  await React.act(async () => root.unmount());
  console.log('PASS real card: preview badge, click/toggle/selection/long-press blocked, current card actionable');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
