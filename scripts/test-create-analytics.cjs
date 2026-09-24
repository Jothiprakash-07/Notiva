/* global __dirname */
// Actual React screens in a DOM harness; Android dialogs/delivery require a device.
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
const testNow = new Date(2026, 8, 23, 12).getTime();
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [testNow])); }
  static now() { return testNow; }
}
const root = createRoot(document.getElementById('root'));
let params = {}, existing, saved, rows = [], route, renderKey = 0;
const view = tag => ({ children, onPress, accessibilityLabel, accessibilityState, disabled }) => React.createElement(tag, {
  onClick: onPress, 'aria-label': accessibilityLabel, 'aria-checked': accessibilityState?.checked, disabled,
}, children);
const native = {
  View: view('div'), Text: view('span'), Pressable: view('button'), ScrollView: view('section'),
  StatusBar: () => null, Switch: () => null, ActivityIndicator: () => null,
  AppState: { addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'android' }, Alert: { alert() { throw Error('Unexpected popup'); } },
  Modal: ({ visible, children }) => visible ? React.createElement('article', null, children) : null,
  TextInput: ({ value, onChangeText }) => React.createElement('input', { value, onInput: e => onChangeText(e.target.value), onChange() {} }),
  StyleSheet: { create: value => value, absoluteFillObject: {} },
};
const cache = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '..', relative);
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date: TestDate, console, setInterval: () => 0, clearInterval() {}, require: id => {
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    if (id === 'react-native') return native;
    if (id === 'react-native-safe-area-context') return { SafeAreaView: native.View };
    if (id === '@expo/vector-icons/Ionicons') return { default: () => null };
    if (id === '@react-native-community/datetimepicker') return { default: () => null };
    if (id === 'react-native-svg') return { default: native.View, Circle: () => null };
    if (id === 'expo-router') return { router: { replace: value => { route = value; }, push: value => { route = value; }, back() {} }, useLocalSearchParams: () => params, useFocusEffect: callback => React.useEffect(callback, [callback]) };
    if (id.endsWith('services/itemStorage')) return { getItems: async () => rows, getItemById: async () => existing, saveItem: async item => { saved = item; }, updateItem: async item => { saved = item; }, rescheduleItem: async item => { saved = item; } };
    if (id.endsWith('services/notificationService')) return { scheduleItemNotifications: async () => ['native-alarm:test'], cancelNotifications: async () => {} };
    if (id.endsWith('services/appSettings')) return { getAppSettings: async () => ({ weekStartsOn: 1 }), useAppSettings: () => ({ weekStartsOn: 1 }) };
    return load(path.resolve(path.dirname(file), id + '.ts'));
  } });
  return module.exports;
}
const Create = load('app/screens/create/[type].tsx').default;
const Analytics = load('app/(tabs)/analytics.tsx').default;
const { calculateAnalytics } = load('utils/itemAnalytics.ts');
async function render(Screen) { await act(async () => root.render(React.createElement(Screen, { key: ++renderKey }))); }
async function click(label) {
  const button = [...document.querySelectorAll('button')].find(el => el.textContent === label || el.getAttribute('aria-label') === label);
  assert.ok(button, `Missing button ${label}`);
  await act(async () => button.click());
}
async function title(value) {
  await act(async () => { const input = document.querySelector('input'); input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
const checked = label => [...document.querySelectorAll('button')].some(el => el.textContent === label && el.getAttribute('aria-checked') === 'true');
const make = (id, overrides = {}) => ({ id, title: id, type: 'task', startAt: new Date(testNow + 3600000).toISOString(), updatedAt: new Date(testNow).toISOString(), createdAt: new Date(testNow).toISOString(), description: '', notificationIds: [], repeat: 'none', ...overrides });
(async () => {
  for (const type of ['reminder', 'task', 'event', 'birthday']) {
    params = { type }; existing = undefined; saved = undefined;
    await render(Create);
    assert.ok(document.body.textContent.includes('Add Category'));
    assert.ok(document.body.textContent.includes('Add Alert'));
    assert.equal(document.body.textContent.includes('Add Priority'), ['reminder', 'task'].includes(type));
    assert.ok(checked('None'));
    await title('New item');
    await click(`Save ${type[0].toUpperCase() + type.slice(1)}`);
    assert.ok(saved, type + ': ' + document.body.textContent);
    assert.equal(saved.category, undefined); assert.equal(saved.priority, undefined); assert.equal(saved.alertBefore, undefined); assert.equal(saved.repeat, 'none');
  }
  params = { type: 'task' }; await render(Create);
  await click('Add Priority'); await click('High');
  await click('Add Category'); await click('Work');
  await click('Add Alert'); await click('5 Minutes Before'); await click('Weekly');
  await title('Selected'); await click('Save Task');
  assert.equal(saved.priority, 'High'); assert.equal(saved.category, 'Work'); assert.equal(saved.alertBefore.minutes, 5); assert.equal(saved.repeat, 'weekly');
  for (const type of ['reminder', 'task', 'event', 'birthday']) {
    existing = make('edit', { type, category: 'Custom category', priority: ['reminder', 'task'].includes(type) ? 'Low' : undefined, alertBefore: { label: '1 Day Before', minutes: 1440 }, repeat: 'yearly' });
    params = { type, id: existing.id }; await render(Create);
    assert.ok(checked('Custom category')); assert.ok(checked('1 Day Before')); assert.ok(checked('Yearly'));
    await click(`Save ${type[0].toUpperCase() + type.slice(1)}`);
    assert.equal(saved.category, existing.category); assert.equal(saved.priority, existing.priority); assert.equal(saved.alertBefore.minutes, 1440); assert.equal(saved.repeat, 'yearly');
  }
  console.log('PASS all four create defaults, explicit optional selections and saved edit values');

  const now = new Date(2026, 8, 23, 12);
  const month = new Date(2026, 8, 20, 12).toISOString();
  const completed = new Date(2026, 8, 22, 12).toISOString();
  const data = [
    make('done', { category: 'Work', startAt: month, completed: true, updatedAt: completed }),
    make('overdue', { category: 'Work', startAt: month }),
    make('pending', { category: 'Work', startAt: new Date(2026, 8, 25).toISOString() }),
    make('older', { category: 'Work', startAt: new Date(2026, 7, 20).toISOString(), completed: true, updatedAt: completed }),
    make('personal', { category: 'Personal', startAt: month, completed: true, updatedAt: completed }),
    make('event', { type: 'event', category: 'Work', startAt: month, endAt: month }),
    make('birthday', { type: 'birthday', category: 'Work', startAt: month }),
    ...[undefined, null, '', '   '].map((category, i) => make(`none-${i}`, { category, startAt: month })),
  ];
  assert.deepEqual(calculateAnalytics(data, 'all', now), calculateAnalytics(data, 'all', now, 1, {}));
  const filters = { category: { kind: 'value', value: 'Work' }, type: 'task' };
  const result = calculateAnalytics(data, 'month', now, 1, filters);
  assert.equal(result.total, 3); assert.equal(result.completed, 1); assert.equal(result.pending, 1); assert.equal(result.missed, 1); assert.equal(result.percentage, 33);
  assert.equal(result.types.task, 3); assert.equal(result.types.event, 0);
  assert.equal(result.days.reduce((sum, day) => sum + day.count, 0), 2, 'weekly activity includes matching older items completed this week');
  assert.equal(calculateAnalytics(data, 'all', now, 1, { category: { kind: 'uncategorized' } }).total, 4);
  for (const period of ['week', 'month', 'all']) assert.deepEqual(calculateAnalytics(data, period, now, 1, filters).days, result.days);
  assert.equal(calculateAnalytics(data, 'all', now, 1, { type: 'birthday' }).actionable, 0);
  console.log('PASS combined category/type/period summaries, Uncategorized, status rules and current-week completion history');

  rows = [make('work', { category: 'Work' }), make('personal', { category: 'Personal', type: 'reminder' }), make('empty')];
  await render(Analytics);
  await click('All Time');
  await click('Total: 3. View all items'); assert.equal(route.params.filter, 'all');
  await click('Category: All'); await click('Work');
  await click('Type: All'); await click('Task');
  await click('Total: 1. View all items'); assert.equal(route.pathname, '/(tabs)/reminders');
  await click('Category: Work'); await click('Uncategorized');
  await click('Total: 1. View all items');
  for (const [label, filter] of [['Completed', 'done'], ['Pending', 'pending'], ['Missed', 'overdue']]) {
    const button = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label')?.startsWith(label + ':'));
    await act(async () => button.click()); assert.equal(route.params.filter, filter);
  }
  await act(async () => root.unmount());
  console.log('PASS live analytics menu interaction and all summary-card destinations');
})().catch(error => { console.error(error); process.exitCode = 1; });
