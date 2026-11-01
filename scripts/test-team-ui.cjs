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
let hardwareBack;
const native = {
  BackHandler: { addEventListener: (_event, handler) => { hardwareBack = handler; return { remove: () => { if (hardwareBack === handler) hardwareBack = undefined; } }; } },
  Modal: ({visible,children}) => visible ? children : null, Image: () => null,
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
  vm.runInNewContext(code, { module, exports: module.exports, Error, Date, console, setTimeout, clearTimeout, require: name => {
    if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
    if (name === 'react-native') return native;
    if (name === 'react-native-safe-area-context') return { SafeAreaView: native.View };
    if (name === '@expo/vector-icons') return { Ionicons: () => null };
    if (name === 'expo-clipboard') return { setStringAsync: async () => {} };
    if (name.endsWith('.png')) return {};
    if (name === '@expo/vector-icons/Ionicons' || name === '@react-native-community/datetimepicker') return { default: () => null };
    if (name === 'expo-router') return { router: { push: target => navigation.push(target), replace: target => navigation.push(target), back() {}, canGoBack: () => false }, useLocalSearchParams: () => params,
      useFocusEffect: callback => React.useEffect(callback, [callback]) };
    if (name.includes('contexts/AuthContext')) return { useAuth: () => ({ session }) };
    if (name.includes('contexts/OrganizationContext')) return { useOrganization: workspaceValue };
    if (name.includes('services/sharedWorkspace')) return services;
    if (name.includes('services/sharedApi')) return { SharedApiError, organizationApi: orgApi };
    if (name.includes('unused-sharedApi')) return { SharedApiError, organizationApi: { create: async (account,details) => { creations.push({account,...details}); return {organization:{name:details.name,joinCode:"ORG-TEST12345678"}}; }, members: async () => people, teams: async () => teams }, sharedApi: { recipients: async () => [{ ...current.recipient, profile: people[0].profile }] } };
    if (name.includes('services/sharedCache')) return { readSharedCache: async () => ({ lists: {}, details: {} }) };
    let target = path.resolve(path.dirname(file), name); if (!fs.existsSync(target)) target += fs.existsSync(target + '.tsx') ? '.tsx' : '.ts'; return load(path.relative(rootDir, target));
  } }, { filename: file }); return module.exports;
}





params={organizationId:'one'};
let rows=[],links={},serial=0;
const writes=[];
const orgApi={detail:async()=>makeOrg('one',role,permissions),teams:async()=>clone(rows),members:async()=>people,
 memberTeams:async(_a,_o,user)=>clone(rows.filter(t=>(links[t.id]||[]).includes(user))),
 teamMembers:async(_a,_o,id)=>(links[id]||[]).map(userId=>({userId})),
 createTeam:async(_a,_o,name)=>{if(rows.some(t=>t.name.toLowerCase()===name.toLowerCase()))throw new SharedApiError(409,'An active team already uses this name.');const team={id:String(++serial),name,status:'active',memberCount:0};rows.push(team);writes.push('create');return {team};},
 editTeam:async(_a,_o,id,name)=>{rows.find(t=>t.id===id).name=name;writes.push('edit');},
 assignTeam:async(_a,_o,id,user)=>{links[id]=[...new Set([...(links[id]||[]),user])];writes.push('assign');},
 removeTeamMember:async(_a,_o,id,user)=>{links[id]=links[id].filter(x=>x!==user);writes.push('remove');},
 archiveTeam:async(_a,_o,id)=>{rows=rows.filter(t=>t.id!==id);links[id]=[];writes.push('archive');}};
async function run(){
 const root=createRoot(document.getElementById('root')), Form=load('app/screens/shared/teams.tsx').default;
 const flush=()=>new Promise(resolve=>setImmediate(resolve));
 const click=async label=>React.act(async()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent===label||x.getAttribute('aria-label')===label);assert.ok(b,label);assert.equal(b.disabled,false,label);b.click();await flush();});
 const input=async value=>React.act(async()=>{inputs.get('Team name')(value);await flush();});
 await React.act(async()=>{root.render(React.createElement(Form));await flush();});
 for(const name of ['Sales','Development']){await click('Create Team');await input(name);await click('Save team');}
 await click('Create Team');await input('sales');await click('Save team');assert.ok(document.body.textContent.includes('already uses'));assert.equal(rows.length,2);await click('Cancel');
 await click('Development');await click('Edit team');await input('Development Team');await click('Save changes');assert.equal(rows[1].id,'2');
 await click('Sales'); await React.act(async()=>{ assert.equal(hardwareBack(), true); await flush(); }); assert.ok(document.body.textContent.includes('Create Team')); assert.equal(hardwareBack(), false); await click('Sales');await click('Assign: bob');assert.deepEqual(links['1'],['B']);await click('Back to teams');
 await click('Development Team');await click('Assign: bob');assert.deepEqual(links['1'],['B']);assert.deepEqual(links['2'],['B']);await click('Back to teams');
 await click('Sales');await click('Remove: bob');assert.deepEqual(links['1'],[]);assert.deepEqual(links['2'],['B']);await click('Archive team');assert.equal(rows.length,2);await click('Confirm archive');assert.equal(rows.length,1);
 await React.act(async()=>root.unmount());
 params={organizationId:'one',userId:'B'};const memberRoot=createRoot(document.getElementById('root'));await React.act(async()=>{memberRoot.render(React.createElement(Form));await flush();});assert.ok(document.body.textContent.includes('Development Team'));assert.ok(!document.body.textContent.includes('Sales'));await React.act(async()=>memberRoot.unmount());
 params={organizationId:'one'};role='member';const denied=createRoot(document.getElementById('root'));await React.act(async()=>{denied.render(React.createElement(Form));await flush();});assert.ok(!document.body.textContent.includes('Create Team'));await React.act(async()=>denied.unmount());
 console.log('PASS team UI create/edit, duplicate error, multiple memberships, isolated removal, archive confirmation, member team list and role controls (mocked API)');
}
run().catch(error=>{console.error(error);process.exitCode=1;});

