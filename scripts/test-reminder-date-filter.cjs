/* global __dirname */
// Native controls are mocked; run with node scripts/test-reminder-date-filter.cjs.
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
const root = createRoot(document.getElementById('root'));
let picker, params = {}, rows = [], alerts = [], session = 0;
const view = tag => ({ children, onPress, accessibilityLabel, disabled }) => React.createElement(tag, { onClick: onPress, 'aria-label': accessibilityLabel, disabled }, children);
const native = {
  Alert: { alert: (...args) => alerts.push(args) }, Keyboard: { dismiss() {} }, Platform: { OS: 'android' },
  View: view('div'), Text: view('span'), Pressable: view('button'), ScrollView: view('section'),
  Modal: ({ visible, children }) => visible ? React.createElement('article', null, children) : null,
  TextInput: ({ value, onChangeText, accessibilityLabel }) => React.createElement('input', { value, 'aria-label': accessibilityLabel, onInput: e => onChangeText(e.target.value), onChange() {} }),
  StyleSheet: { create: value => value, absoluteFillObject: {} },
};
const cache = new Map();
function load(file) {
  const full = path.resolve(__dirname, '..', file);
  if (cache.has(full)) return cache.get(full).exports;
  const module = { exports: {} }; cache.set(full, module);
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, console, setInterval: () => 0, clearInterval() {}, require: id => {
    if (id === 'react' || id === 'react/jsx-runtime') return require(id);
    if (id === 'react-native') return native;
    if (id === 'react-native-safe-area-context') return { SafeAreaView: native.View };
    if (id === '@expo/vector-icons/Ionicons') return { default: () => null };
    if (id === '@react-native-community/datetimepicker') return { default: props => { picker = props; return null; } };
    if (id === 'expo-router') return { router: { push() {}, setParams: next => { params = next; render(); } }, useLocalSearchParams: () => params, useFocusEffect: callback => React.useEffect(callback, [callback]) };
    if (id.endsWith('services/itemStorage')) return { getItems: async () => rows, toggleComplete: async () => { throw Error('Unexpected storage mutation'); } };
    if (id.endsWith('CompletionNoteModal')) return { default: () => null };
    if (id.endsWith('ReminderCard')) return { default: props => React.createElement('div', { 'data-item': props.id }, props.title) };
    return load(path.resolve(path.dirname(full), id + '.ts'));
  } });
  return module.exports;
}
const Screen = load('app/(tabs)/reminders.tsx').default;
const render = () => root.render(React.createElement(Screen, { key: session }));
const ids = () => [...document.querySelectorAll('[data-item]')].map(el => el.dataset.item);
async function click(label) {
  const button = [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === label || el.textContent === label);
  assert.ok(button, label); await act(async () => button.click());
}
async function date(field, value, type = 'set') {
  await click('Select ' + field + ' Date');
  await act(async () => picker.onChange({ type }, value));
}
async function search(value) {
  await act(async () => { const input = document.querySelector('input'); input.value = value; input.dispatchEvent(new window.Event('input', { bubbles: true })); });
}
function item(id, date, type = 'reminder', completed = false) {
  return { id, title: 'Invoice ' + id, type, completed, startAt: date.toISOString(), description: '', category: 'Personal', repeat: 'none', alertBefore: { label: 'At time', minutes: 0 }, notificationIds: [] };
}
(async () => {
  for (const zone of ['Asia/Kolkata', 'America/New_York', 'UTC']) {
    process.env.TZ = zone; session++; params = {}; alerts = [];
    rows = [item('before', new Date(2026, 6, 31, 23, 59, 59, 999)), item('first', new Date(2026, 7, 1)), item('done', new Date(2026, 7, 15), 'task', true), item('last', new Date(2026, 7, 31, 23, 59, 59, 999), 'event'), item('after', new Date(2026, 8, 1), 'birthday')];
    await act(async () => render()); const initial = ids();
    await click('Date Filter'); await date('From', new Date(2026, 7, 1, 14)); await date('To', new Date(2026, 7, 31, 8));
    assert.deepEqual(ids(), initial, 'Draft does not filter');
    await click('Cancel'); assert.deepEqual(ids(), initial);
    await click('Date Filter'); assert.ok(document.body.textContent.includes('Select From Date'), 'Canceled draft discarded');
    await date('From', new Date(2026, 7, 1)); await date('To', new Date(2026, 7, 31)); await click('Apply');
    assert.deepEqual(new Set(ids()), new Set(['first', 'done', 'last']), zone + ' inclusive calendar month');
    assert.ok(document.body.textContent.includes('01 Aug 2026 - 31 Aug 2026'));
    const sort = load('utils/itemSorting.ts').sortItemsByStatus;
    assert.deepEqual(ids(), Array.from(sort(rows.filter(row => ['first', 'done', 'last'].includes(row.id))), row => row.id), 'Existing sorting preserved');
    await click('Done'); assert.deepEqual(new Set(ids()), new Set(['done', 'last']));
    await search('invoice DONE'); assert.deepEqual(ids(), ['done']);
    await search('no-matching-item'); assert.equal(ids().length, 0);
    assert.ok(document.body.textContent.includes('No reminders found for this date range.'));
    await click('Clear Date Filter'); assert.equal(ids().length, 0, 'Clear preserves status/search');
    await search(''); assert.deepEqual(new Set(ids()), new Set(rows.filter(load('utils/itemStatus.ts').isCountedAsDone).map(row => row.id))); await click('All');
    await click('Date Filter'); await date('From', new Date(2026, 8, 1)); await date('To', new Date(2026, 7, 1)); await click('Apply');
    assert.equal(alerts.at(-1)[0], 'From date must be before To date.'); assert.ok(document.querySelector('article'));
    assert.deepEqual(ids(), initial);
    await click('Clear To Date'); await click('Apply'); assert.deepEqual(ids(), ['after']);
    await click('Date Filter'); await click('Clear From Date'); await date('To', new Date(2026, 7, 1)); await click('Apply');
    assert.deepEqual(new Set(ids()), new Set(['before', 'first']));
    await click('Date Filter'); await date('From', new Date(2026, 7, 1)); await click('Apply'); assert.deepEqual(ids(), ['first']);
    await click('Date Filter'); await date('From', new Date(2026, 8, 10), 'dismissed'); await click('Apply'); assert.deepEqual(ids(), ['first'], 'Picker dismiss does not alter date');
    await click('Date Filter'); await click('Reset'); assert.deepEqual(ids(), initial);
    // DST spring transition: next local midnight, not a fixed 24-hour duration.
    session++; rows = [item('dst-start', new Date(2026, 2, 8)), item('dst-end', new Date(2026, 2, 8, 23, 59, 59, 999)), item('dst-next', new Date(2026, 2, 9))];
    await act(async () => render()); await click('Date Filter'); await date('From', new Date(2026, 2, 8)); await date('To', new Date(2026, 2, 8)); await click('Apply');
    assert.deepEqual(ids(), ['dst-start', 'dst-end'], zone + ' same-day boundary');
    console.log('PASS ' + zone + ': inclusive dates, same-day/DST boundaries, open-ended ranges, validation, draft cancel, picker dismiss, reset/clear, search + status + date, existing sorting.');
  }
  await act(async () => root.unmount());
})().catch(error => { console.error(error); process.exitCode = 1; });
