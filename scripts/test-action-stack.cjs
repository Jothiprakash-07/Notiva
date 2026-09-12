/* global __dirname */
// Component interactions run in a DOM harness; native APIs and animation completion are controlled.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { act } = React;
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window;
global.document = dom.window.document;
global.IS_REACT_ACT_ENVIRONMENT = true;
let alerts = [], animations = [], calls = [], items = [], focused = true, closed = false, fail = false, release;
let gestures, exits = [], snaps = [], failRefresh = false;
const wrapper = (tag) => function NativeTestView({ children, onPress, disabled, accessibilityLabel, importantForAccessibility, pointerEvents }) { return React.createElement(tag, {
  onClick: onPress, disabled, 'aria-label': accessibilityLabel,
  'data-accessibility': importantForAccessibility, 'data-pointer-events': pointerEvents,
}, children); };
const native = {
  Platform: { OS: 'android' }, KeyboardAvoidingView: wrapper('div'),
  TextInput: ({ value, onChangeText, maxLength, editable, accessibilityLabel }) => React.createElement('textarea', { value, maxLength, disabled: !editable, 'aria-label': accessibilityLabel, onInput: event => onChangeText(event.target.value), onChange: () => {} }),
  View: wrapper('div'), Text: wrapper('span'), Pressable: wrapper('button'), ScrollView: wrapper('section'),
  Modal: ({ visible, children }) => visible ? React.createElement('article', null, children) : null,
  StyleSheet: { create: (value) => value, absoluteFillObject: {} },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  Alert: { alert: (...args) => alerts.push(args) },
  PanResponder: { create: (handlers) => { gestures = handlers; return { panHandlers: {} }; } },
  Animated: {
    View: wrapper('div'),
    Value: class { setValue(value) { this.value = value; } stopAnimation() {} interpolate() { return 0; } },
    timing: (value, config) => ({ value, config }),
    parallel: (steps) => ({ start: (callback) => { exits.push(steps[1].config.toValue); animations.push(callback); } }),
    spring: (value, config) => ({ start: (callback) => { snaps.push(config.toValue); value.setValue(config.toValue); callback({ finished: true }); } }),
  },
};
async function update(id, action) {
  calls.push(action);
  if (release) await new Promise((resolve) => { release = resolve; });
  if (fail) throw new Error('Save failed');
  items = action === 'delete' ? items.filter((item) => item.id !== id) : items.map((item) => item.id === id ? { ...item, actionResolved: true, completed: action === 'done' } : item);
  return items.find((item) => item.id === id);
}
const storage = { toggleComplete: (id, note) => { storage.lastNote = note; return update(id, 'done'); }, resolveItemAction: (id) => update(id, 'skip'), deleteItem: (id) => update(id, 'delete') };
const cache = new Map();
function load(file) {
  const full = path.resolve(__dirname, '..', file);
  if (cache.has(full)) return cache.get(full).exports;
  const module = { exports: {} }; cache.set(full, module);
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console, require: (id) => {
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    if (id === 'react-native') return native;
    if (id === 'react-native-gesture-handler') {
      const build = (kind) => {
        const config = { kind };
        const builder = new Proxy(config, { get(target, name) {
          if (name in target) return target[name];
          return (...args) => { target[name] = args[0]; return builder; };
        } });
        if (kind === 'pan') gestures = config;
        return builder;
      };
      return { GestureHandlerRootView: native.View, Gesture: { Pan: () => build('pan'), Native: () => build('native') },
        GestureDetector: ({ gesture, children }) => React.createElement('div', { 'data-gesture': gesture.kind }, children) };
    }
    if (id === 'react-native-safe-area-context') return { SafeAreaView: native.View };
    if (id === '@expo/vector-icons/Ionicons') return { default: () => null };
    if (id === '@react-navigation/native') return { useIsFocused: () => focused };
    if (id === 'expo-router') return { router: { push: (route) => calls.push(route) } };
    if (id.endsWith('services/itemStorage')) return storage;
    const base = path.resolve(path.dirname(full), id);
    return load(path.relative(path.resolve(__dirname, '..'), base + (fs.existsSync(base + '.tsx') ? '.tsx' : '.ts')));
  } }, { filename: full });
  return module.exports;
}
const Stack = load('components/home/ActionRequiredStack.tsx').default;
const root = createRoot(document.getElementById('root'));
let session = 0;
const render = () => root.render(closed ? null : React.createElement(Stack, { key: session, items, onClose: () => { closed = true; render(); }, onChanged: async () => { if (failRefresh) throw new Error('Reload failed'); render(); } }));
const click = async (label) => {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent === label || node.getAttribute('aria-label') === label);
  assert.ok(button, label);
  await act(async () => button.click());
};
const finish = async () => { assert.equal(animations.length, 1); await act(async () => animations.shift()({ finished: true })); };
async function setup(count) {
  session++; closed = false; fail = false; release = undefined; focused = true; alerts = []; animations = []; calls = []; exits = []; snaps = [];
  items = Array.from({ length: count }, (_, index) => ({ id: String(index), type: 'reminder', title: 'Item ' + index, startAt: '2020-09-07T20:30:00', description: 'Description', category: 'Personal', priority: 'Medium' }));
  await act(async () => render());
}
(async () => {
  for (const count of [1, 2, 3, 5]) {
    await setup(count);
    assert.equal(document.querySelectorAll('[data-accessibility="no-hide-descendants"]').length, Math.min(count, 3) - 1);
    assert.equal(document.querySelectorAll('[data-pointer-events="none"]').length, Math.min(count, 3) - 1);
    assert.ok(document.body.textContent.includes(count + ' pending'));
    if (count === 5) assert.ok(document.body.textContent.includes('+2 more'));
  }
  assert.equal([...document.querySelectorAll('button')].filter((node) => node.textContent === 'Done').length, 0);
  await click('Action'); await click('Cancel');
  assert.ok(document.querySelector('article')); assert.equal(calls.length, 0);
  await click('Action'); await click('Mark as Done');
  assert.ok(document.querySelector('textarea'), 'Done opens the common note modal');
  assert.equal(calls.length, 0); assert.equal(animations.length, 0);
  await click('Cancel');
  assert.equal(document.querySelector('textarea'), null); assert.equal(calls.length, 0);
  await click('Action'); await click('Mark as Done');
  release = true;
  await click('Done');
  assert.equal(animations.length, 0, 'No animation before persistence finishes');
  const unblock = release; release = undefined;
  await act(async () => unblock());
  assert.ok(document.body.textContent.includes('Item 0'));
  await finish();
  assert.ok(!document.body.textContent.includes('Item 0'));
  assert.ok(document.body.textContent.includes('Item 1'));
  await click('Action'); await click('Skip'); await finish();
  assert.ok(!document.body.textContent.includes('Item 1'));
  await click('Action'); await click('Delete');
  assert.equal(alerts.at(-1)[0], 'Delete this item?');
  await act(async () => alerts.at(-1)[2][1].onPress()); await finish();
  await click('Close Action Required'); assert.equal(closed, true);
  assert.equal(items.filter((item) => !item.actionResolved).length, 2);
  session++; closed = false; await act(async () => render());
  assert.ok(document.body.textContent.includes('Item 3'));
  fail = true;
  await click('Action'); await click('Skip');
  assert.equal(animations.length, 0); assert.ok(document.body.textContent.includes('Item 3'));
  assert.equal(alerts.at(-1)[0], 'Could not update item');
  fail = false;
  await click('Action'); await click('Reschedule');
  assert.equal(calls.at(-1).params.id, '3'); assert.equal(calls.at(-1).params.returnToStack, '1');
  focused = false; await act(async () => render()); assert.equal(document.querySelector('article'), null);
  focused = true; await act(async () => render()); assert.equal(animations.length, 0, 'Cancelled reschedule keeps front');
  items = items.map((item) => item.id === '3' ? { ...item, startAt: '2099-09-07T20:30:00' } : item);
  await act(async () => render()); await finish();
  assert.ok(document.body.textContent.includes('Item 4'));
  await click('Action'); await click('Skip'); await finish(); assert.equal(closed, true);
  for (const direction of [-1, 1]) {
    await setup(5);
    const original = JSON.stringify(items);
    const drag = { dx: direction * 130, dy: 1, numberActiveTouches: 1 };
    const fullCard = document.querySelector('[data-gesture=pan]');
    for (const text of ['Item 0', 'Description', 'September', 'PM', 'Personal', 'Medium']) {
      assert.ok(fullCard.textContent.includes(text), text + ' is inside the full-card pan detector');
    }
    assert.equal(document.querySelectorAll('[data-gesture=pan]').length, 1, 'Only the front card owns a pan detector');
    const actionButton = [...document.querySelectorAll('button')].find((node) => node.textContent === 'Action');
    assert.equal(actionButton.closest('[data-gesture]'), null, 'Action button is outside all gesture capture areas');
    await click('Action');
    assert.ok(document.body.textContent.includes('Choose an action'));
    assert.equal(animations.length, 0, 'Action tap does not swipe');
    await click('Cancel');
    assert.equal(document.querySelector('[aria-label="Close Action Required"]').closest('[data-gesture=pan]'), null, 'X is outside the swipe detector');
    assert.equal(gestures.activeOffsetX.join(','), '-10,10');
    assert.equal(gestures.failOffsetY.join(','), '-15,15');
    await act(async () => { gestures.onStart(); gestures.onUpdate({ translationX: drag.dx }); });
    await act(async () => gestures.onEnd({ translationX: drag.dx }, true));
    assert.equal(calls.length, 0, 'Swipes never call storage actions');
    await act(async () => gestures.onEnd({ translationX: drag.dx }, true));
    assert.equal(animations.length, 1, 'Ignore repeated release during dismissal');
    assert.equal(exits.at(-1), direction * 390);
    await finish();
    assert.ok(document.body.textContent.includes('+1 more'));
    assert.ok(!document.body.textContent.includes('Item 0'));
    assert.equal(JSON.stringify(items), original);
    await act(async () => gestures.onEnd({ translationX: direction * 120 }, true));
    assert.equal(animations.length, 0, 'Small drags do not dismiss');
    assert.equal(snaps.at(-1), 0);
    assert.ok(document.body.textContent.includes('Item 1'));
    await click('Action');
    assert.ok(document.body.textContent.includes('Choose an action'), 'Action works after swiping and snapping back');
    await click('Cancel');
    for (let index = 1; index < 5; index++) {
      await act(async () => gestures.onEnd({ translationX: drag.dx }, true));
      await finish();
    }
    assert.equal(closed, true, 'Dismissing all cards closes the visible stack');
    assert.equal(calls.length, 0);
    assert.equal(JSON.stringify(items), original, 'All stored item fields remain unchanged');
    session++; closed = false; await act(async () => render());
    assert.ok(document.body.textContent.includes('5 pending'));
    assert.ok(document.body.textContent.includes('Item 0'), 'Dismissed unresolved cards return on reopening');
    await click('Action');
    assert.equal(gestures.enabled, false, 'Action menu is isolated from swiping');
    await click('Cancel');
  }
  const sessionFile = 'utils/actionRequiredSession.ts';
  const gate = load(sessionFile);
  assert.equal(gate.shouldAutoOpenActionRequired(items), true);
  assert.equal(gate.shouldAutoOpenActionRequired(items), false, 'Home refocus cannot reopen');
  assert.equal(load(sessionFile).shouldAutoOpenActionRequired(items), false, 'Home remount shares session flag');
  cache.delete(path.resolve(__dirname, '..', sessionFile));
  assert.equal(load(sessionFile).shouldAutoOpenActionRequired(items), true, 'Fresh JS runtime permits a new launch popup');
  cache.delete(path.resolve(__dirname, '..', sessionFile));
  const emptyLaunch = load(sessionFile);
  assert.equal(emptyLaunch.shouldAutoOpenActionRequired([]), false);
  assert.equal(emptyLaunch.shouldAutoOpenActionRequired(items), false, 'First successful Home check consumes the launch decision');
  await setup(3);
  failRefresh = true;
  await click('Action'); await click('Skip'); await finish();
  await click('Action'); await click('Skip'); await finish();
  assert.ok(!document.body.textContent.includes('Item 0'), 'Saved cards never reappear if list refresh fails');
  assert.ok(!document.body.textContent.includes('Item 1'));
  assert.ok(document.body.textContent.includes('1 pending'));
  failRefresh = false;
  await setup(2);
  await click('Action'); await click('Mark as Done');
  fail = true; await click('Done');
  assert.ok(document.querySelector('textarea'), 'Failed Done keeps modal open');
  assert.equal(animations.length, 0);
  fail = false; await click('Skip Note');
  assert.equal(storage.lastNote, undefined); await finish();

  const CompletionModal = load('components/common/CompletionNoteModal.tsx').default;
  let visible = true, noteCalls = [], closeCalls = 0, modalFail = false, pending;
  const modalRender = () => root.render(React.createElement(CompletionModal, { visible, itemTitle: 'Example',
    onClose: () => { closeCalls++; visible = false; modalRender(); },
    onConfirm: async note => { noteCalls.push(note); if (modalFail) throw new Error('Save failed'); if (pending) await new Promise(resolve => { pending = resolve; }); },
  }));
  const typeNote = async text => { await act(async () => {
    const input = document.querySelector('textarea'); input.value = text;
    input.dispatchEvent(new window.Event('input', { bubbles: true }));
  }); };
  await act(async () => modalRender());
  assert.equal(document.querySelector('textarea').maxLength, 300);
  await typeNote('  Finished the work  '); await click('Done');
  assert.equal(noteCalls.at(-1), 'Finished the work');
  await typeNote('   '); await click('Done'); assert.equal(noteCalls.at(-1), undefined);
  await typeNote('Discard this'); await click('Skip Note'); assert.equal(noteCalls.at(-1), undefined);
  const beforeCancel = noteCalls.length; await click('Cancel');
  assert.equal(closeCalls, 1); assert.equal(noteCalls.length, beforeCancel);
  visible = true; await act(async () => modalRender());
  assert.equal(document.querySelector('textarea').value, '', 'Reopening resets note');
  await typeNote('Retry note'); modalFail = true; await click('Done');
  assert.equal(document.querySelector('textarea').value, 'Retry note', 'Failure preserves note');
  modalFail = false; pending = true;
  const beforeDouble = noteCalls.length;
  const doneButton = [...document.querySelectorAll('button')].find(node => node.textContent === 'Done');
  await act(async () => { doneButton.click(); doneButton.click(); });
  assert.equal(noteCalls.length, beforeDouble + 1, 'Immediate double tap saves once');
  assert.equal(document.querySelector('textarea').disabled, true);
  await click('Cancel'); assert.equal(closeCalls, 1, 'Cancel blocked during save');
  const resolve = pending; pending = undefined; await act(async () => resolve());
  await act(async () => root.unmount());
  console.log('PASS: shared completion modal trim/empty/Skip Note/Cancel/reset, 300-character limit, failed-save retry, double-tap lock, and Action Required completion failure/success.');
  console.log('PASS: session-only auto-open, 1/2/3/5-card stacks, back-card isolation, Action menu/cancel, confirmation cancellation, Done/Skip/Delete, close/reopen, reschedule, temporary swipes in both directions, zero swipe storage calls, reopen after dismiss-all, 35% threshold, snap-back, and real-action persistence-before-exit.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
