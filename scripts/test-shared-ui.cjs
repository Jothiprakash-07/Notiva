/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), ts = require('typescript');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>');
global.window = dom.window; global.document = dom.window.document; global.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { createRoot } = require('react-dom/client');
const rootDir = path.resolve(__dirname, '..');
const makeOrg = (id, role = 'owner', permissions = [], enabled = true) => ({ organization: { id, name: `Workspace ${id}`, employeeSharingEnabled: enabled }, membership: { role, permissions, userId: 'A', status: 'active' } });
let session = { user: { id: 'A' }, token: 'A' }, params = { organizationId: 'one', id: 'first' }, role = 'owner', permissions = [], enabled = true;
let selected = 'one', version = 0, cached = false, conflict = false, denied = false;
const people = [{ userId: 'A', profile: { fullName: 'Alice', notivaId: 'alice' } }, { userId: 'B', profile: { fullName: 'Bob', notivaId: 'bob' } }];
const teams = [{ id: 'sales', name: 'Sales', memberCount: 2 }, { id: 'design', name: 'Design', memberCount: 2 }];
const future = new Date(Date.now() + 3600000).toISOString();
let current = { item: { id: 'first', organizationId: 'one', type: 'task', title: 'Shared planning', description: 'Prepare launch notes', createdByUserId: 'B', status: 'active', completionMode: 'individual', schedule: { startAt: future }, serverRevision: 5 },
  recipient: { userId: 'A', status: 'pending', accessStatus: 'active' }, targets: [{ targetType: 'user', targetId: 'A' }], recipientSummary: [{ status: 'completed', accessStatus: 'active', count: 3 }, { status: 'pending', accessStatus: 'active', count: 5 }] };
const mutations = [], creations = [], navigation = [], inputs = new Map();
class SharedApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const refresh = async () => {};
const workspaceValue = () => { const organizations = [makeOrg('one', role, permissions, enabled), makeOrg('two', role, permissions, enabled)]; return { organizations, current: organizations.find(org => org.organization.id === selected), selectedId: selected,
  version, loading: false, fresh: true, refresh, select: async id => { selected = id; } }; };
const clone = value => JSON.parse(JSON.stringify(value));
const services = {
  currentSharedAccount: () => session.user.id, sharedErrorMessage: error => error.status === 409 ? 'This shared item changed. The latest version has been loaded.' : error.message,
  loadSharedDetail: async () => { if (denied) throw new SharedApiError(403, 'Shared item access is not permitted.'); return { entry: clone(current), cached }; },
  loadSharedList: async (_account, org, view) => ({ entries: [clone(current), { ...clone(current), item: { ...current.item, id: 'cancelled', organizationId: org, title: 'Cancelled history', status: 'cancelled' } }], cached: false }),
  createSharedClient: async (_account, org, draft) => { creations.push({ org, draft }); return { item: { ...draft, id: 'new-shared', organizationId: org } }; },
  mutateSharedClient: async (account, org, id, action, revision, draft) => {
    mutations.push({ account, org, id, action, revision, draft });
    if (conflict) { conflict = false; current.item.title = 'Authoritative title'; current.item.serverRevision = 6; throw new SharedApiError(409, 'Changed.'); }
    if (action === 'edit') { Object.assign(current.item, draft); if (draft.targets) current.targets = clone(draft.targets); }
    if (action === 'cancel') current.item.status = 'cancelled';
    if (action === 'complete') { current.recipient.status = 'completed'; if (current.item.completionMode === 'collective') { current.item.status = 'completed'; current.item.completedByUserId = 'B'; } }
    return { entry: clone(current), cached: false };
  },
};
const box = name => ({ children }) => React.createElement(name, null, children);
const native = {
  View: box('div'), Text: ({ children, accessibilityRole }) => React.createElement('span', { role: accessibilityRole }, children), ScrollView: box('main'), KeyboardAvoidingView: box('div'),
  Pressable: ({ children, onPress, disabled, accessibilityLabel, accessibilityState, accessibilityRole }) => React.createElement('button', { type: 'button', role: accessibilityRole || 'button', disabled,
    onClick: onPress, 'aria-label': accessibilityLabel, 'aria-checked': accessibilityState?.checked, 'aria-pressed': accessibilityState?.selected, 'aria-expanded': accessibilityState?.expanded }, typeof children === 'function' ? children({ pressed: false }) : children),
  TextInput: React.forwardRef((props, ref) => { inputs.set(props.accessibilityLabel, props.onChangeText); return React.createElement('input', { ref, value: props.value, disabled: props.editable === false, 'aria-label': props.accessibilityLabel, onChange: event => props.onChangeText?.(event.target.value) }); }),
  ActivityIndicator: () => React.createElement('span', null, 'Loading'), RefreshControl: () => null, StyleSheet: { create: value => value }, Platform: { OS: 'web' },
};
const modules = new Map();
function load(relative) {
  const file = path.resolve(rootDir, relative); if (modules.has(file)) return modules.get(file).exports;
  const module = { exports: {} }; modules.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, Date, console, setTimeout, clearTimeout, require: name => {
    if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
    if (name === 'react-native') return native;
    if (name === 'react-native-safe-area-context') return { SafeAreaView: native.View };
    if (name === '@expo/vector-icons/Ionicons' || name === '@react-native-community/datetimepicker') return { default: () => null };
    if (name === 'expo-router') return { router: { navigate: target => navigation.push(target), push: target => navigation.push(target), replace: target => navigation.push(target), back() {}, canGoBack: () => false }, useLocalSearchParams: () => params,
      useFocusEffect: callback => React.useEffect(callback, [callback]) };
    if (name.includes('contexts/AuthContext')) return { useAuth: () => ({ session }) };
    if (name.includes('contexts/OrganizationContext')) return { useOrganization: workspaceValue };
    if (name.includes('services/sharedWorkspace')) return services;
    if (name.includes('services/sharedApi')) return { SharedApiError, organizationApi: { members: async () => people, teams: async () => teams }, sharedApi: { recipients: async () => [{ ...current.recipient, profile: people[0].profile }] } };
    if (name.includes('services/sharedCache')) return { readSharedCache: async () => ({ lists: {}, details: {} }) };
    let target = path.resolve(path.dirname(file), name); if (!fs.existsSync(target)) target += fs.existsSync(target + '.tsx') ? '.tsx' : '.ts'; return load(path.relative(rootDir, target));
  } }, { filename: file }); return module.exports;
}
async function run() {
  let checks = 0;
  const check = label => { checks++; console.log(`PASS ${label}`); };
  const root = createRoot(document.getElementById('root'));
  const render = async Component => { await React.act(async () => { root.render(React.createElement(Component)); await new Promise(resolve => setImmediate(resolve)); }); };
  const buttons = () => [...document.querySelectorAll('button')];
  const click = async label => { const button = buttons().find(button => button.textContent === label || button.getAttribute('aria-label') === label); assert.ok(button, label); await React.act(async () => { button.click(); await new Promise(resolve => setImmediate(resolve)); }); };
  const input = async (label, value) => React.act(async () => inputs.get(label)(value));
  const Workspace = load('components/shared/SharedWorkspace.tsx').default;
  await render(Workspace); assert.ok(document.body.textContent.includes('Shared planning')); assert.ok(document.body.textContent.includes('SHARED TASK'));
  await click('Created by Me'); assert.equal(navigation.at(-1), '/(tabs)/created'); await React.act(async () => { root.render(React.createElement(Workspace, { section: 'created', key: 'created' })); await new Promise(resolve => setImmediate(resolve)); }); assert.ok(document.body.textContent.includes('3 of 8 completed')); check('rendered shared inbox and Created by Me summary');
  await click('Cancelled'); assert.ok(document.body.textContent.includes('Cancelled history')); assert.ok(!document.body.textContent.includes('Shared planning')); check('cancelled filter preserves history');
  await click('Switch organization'); await click('Workspace two · owner'); await render(Workspace); assert.equal(selected, 'two'); check('minimal switcher changes organization context');
  selected = 'one'; role = 'member'; enabled = false; await render(Workspace); assert.ok(!buttons().some(button => button.textContent === 'Create shared item')); check('Member policy-disabled creation control absent');
  enabled = true; await render(Workspace); assert.ok(buttons().some(button => button.textContent === 'Create shared item'));
  role = 'admin'; permissions = []; await render(Workspace); assert.ok(!buttons().some(button => button.textContent === 'Create shared item'));
  permissions = ['create_shared_items']; await render(Workspace); assert.ok(buttons().some(button => button.textContent === 'Create shared item')); assert.ok(!buttons().some(button => button.textContent === 'Manage')); check('Admin and Member permission-aware navigation');
  const Picker = load('components/shared/SharedTargetPicker.tsx').SharedTargetPicker;
  function PickerDriver() { const [mode, setMode] = React.useState('organization'), [teamIds, onTeams] = React.useState([]), [userIds, onUsers] = React.useState([]); return React.createElement(Picker, { modes: ['organization', 'team', 'user'], mode, onMode: setMode, teams, people, teamIds, userIds, onTeams, onUsers }); }
  await render(PickerDriver); assert.ok(document.body.textContent.includes('Current members will receive this item.'));
  await click('Teams'); await click('Sales'); await click('Design'); assert.equal(document.querySelectorAll('[aria-checked="true"]').length, 2); check('organization snapshot helper and team multi-select render');
  await click('Selected Employees'); await click('Alice'); await click('Bob'); assert.equal(document.querySelectorAll('[aria-checked="true"]').length, 2);
  await input('Find employees by name or Notiva ID', 'bob'); assert.ok(!buttons().some(button => button.getAttribute('aria-label') === 'Alice')); assert.ok(buttons().some(button => button.getAttribute('aria-label') === 'Bob')); check('employee multi-select and safe name/Notiva ID search');
  role = 'member'; params = { organizationId: 'one' };
  const Form = load('app/screens/shared/create.tsx').default;
  await render(Form); await click('Task'); await input('Title', 'Employee task'); await click('Complete for everyone'); await click('Alice'); await click('Bob');
  assert.ok(!document.body.textContent.includes('Entire Organization')); assert.ok(!buttons().some(button => button.textContent === 'Teams'));
  assert.ok(document.body.textContent.includes('When any one recipient completes it'));
  await click('Create shared item'); assert.equal(creations[0].draft.collectiveRule, 'any'); assert.equal(creations[0].draft.targets.length, 2); assert.equal(creations[0].draft.recurrence.repeat, 'none'); check('Member selected-only collective ANY creation submits canonical payload');
  await click('Weekly'); assert.ok(buttons().some(button => button.textContent === 'Sun')); assert.ok(document.body.textContent.includes('Series timezone:'));
  await click('Daily'); await click('Create shared item'); assert.equal(creations[1].draft.recurrence.repeat, 'daily'); assert.ok(creations[1].draft.recurrence.timeZone); check('rendered recurrence selector exposes weekly days and submits daily timezone rule');
  role = 'owner'; params = { organizationId: 'one', id: 'first' }; await render(Form);
  assert.ok(document.body.textContent.includes('Changing recipients affects future alerts.')); assert.ok(!document.body.textContent.includes('Task completion'));
  await input('Title', 'Manager edit'); await click('Save changes'); assert.equal(mutations.at(-1).revision, 5); assert.equal('targets' in mutations.at(-1).draft, false); check('edit form excludes target/recurrence/completion-mode mutation');
  conflict = true; await input('Title', 'Stale edit'); await click('Save changes');
  assert.equal(document.querySelector('[aria-label="Title"]').value, 'Authoritative title'); assert.ok(document.body.textContent.includes('latest version')); check('409 edit refreshes authoritative fields and shows conflict message');
  assert.equal(buttons().find(button => button.getAttribute('aria-label') === 'Alice').getAttribute('aria-checked'), 'true');
  await click('Teams + Employees'); await click('Sales'); await click('Bob'); await click('Save changes');
  assert.equal(mutations.at(-1).draft.targets.length, 3); assert.equal(mutations.at(-1).draft.targets.filter(row => row.targetType === 'team').length, 1);
  assert.equal('schedule' in mutations.at(-1).draft, false); assert.equal('recurrence' in mutations.at(-1).draft, false); check('edit preselects current audience and submits mixed teams/employees without rewriting schedule');
  role = 'admin'; permissions = ['edit_shared_items']; current.targets = [{ targetType: 'team', targetId: 'sales' }, { targetType: 'team', targetId: 'archived' }]; await render(Form); assert.ok(buttons().some(button => button.textContent === 'Teams + Employees')); check('edit-only Admin can select audience without create permission');
  await click('Remove unavailable team'); await click('Save changes'); assert.equal(mutations.at(-1).draft.targets.length, 1); assert.equal(mutations.at(-1).draft.targets[0].targetId, 'sales'); check('unavailable historical team can be removed without exposing hidden details');
  role = 'member'; current.item.createdByUserId = 'A'; current.targets = [{ targetType: 'user', targetId: 'A' }]; await render(Form);
  assert.ok(!buttons().some(button => button.textContent === 'Teams')); assert.ok(!buttons().some(button => button.textContent === 'Teams + Employees'));
  await click('Bob'); await click('Save changes'); assert.ok(mutations.at(-1).draft.targets.every(row => row.targetType === 'user')); check('Member creator edit remains selected employees only');
  role = 'owner'; cached = true; await render(Form);
  assert.ok(document.body.textContent.includes("You're offline. Connect to update recipients.")); assert.equal(buttons().find(button => button.textContent === 'Save changes').disabled, true); check('offline audience edit is explicitly disabled');
  cached = false; current.item.createdByUserId = 'B';
  const Detail = load('app/screens/shared/item.tsx').default;
  role = 'member'; enabled = false; await render(Detail);
  assert.ok(buttons().some(button => button.textContent === 'Complete')); assert.ok(!buttons().some(button => button.textContent === 'Edit shared item')); assert.ok(!buttons().some(button => button.textContent === 'Cancel shared item'));
  await click('Complete'); assert.equal(current.recipient.status, 'completed'); assert.ok(!buttons().some(button => button.textContent === 'Complete')); check('recipient completion updates own status without management controls');
  current.recipient.status = 'pending'; current.item.completionMode = 'collective'; version++; await render(Detail); await click('Complete');
  assert.ok(document.body.textContent.includes('Completed by Bob')); assert.ok(!buttons().some(button => button.textContent === 'Complete')); check('collective completion displays global result and completion actor');
  role = 'owner'; current.item.status = 'active'; current.item.completionMode = 'individual'; version++; await render(Detail); await click('Cancel shared item');
  assert.ok(document.body.textContent.includes('Cancel this shared item?')); assert.ok(document.body.textContent.includes('Recipients will no longer receive future alerts.'));
  await click('Confirm cancellation'); assert.equal(current.item.status, 'cancelled'); assert.ok(!buttons().some(button => button.textContent === 'Complete')); check('explicit cancellation confirmation preserves cancelled detail');
  current.item.status = 'active'; current.recipient.status = 'pending'; cached = true; version++; await render(Detail);
  assert.ok(document.body.textContent.includes('read-only')); assert.ok(!buttons().some(button => button.textContent === 'Edit shared item')); assert.ok(!buttons().some(button => button.textContent === 'Complete')); check('offline saved detail disables writes');
  cached = false; denied = true; params = { organizationId: 'one', id: 'denied' }; await render(Detail);
  assert.ok(document.body.textContent.includes('access is not permitted')); assert.ok(!document.body.textContent.includes('Authoritative title')); check('authorization failure replaces content with safe error state');
  session = { user: { id: 'B' }, token: 'B' }; selected = 'two'; params = { organizationId: 'absent', id: 'first' }; await render(Detail);
  assert.ok(document.body.textContent.includes('Organization unavailable')); assert.ok(!document.body.textContent.includes('Prepare launch notes')); check('account/organization route change does not display old detail');
  await React.act(async () => root.unmount());
  console.log(`${checks} rendered shared UI checks passed`);
}
run().catch(error => { console.error(error); process.exitCode = 1; });

