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
function load(file, imports, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2020 },
  }).outputText, { module, exports: module.exports, Error, ...globals, require: name => {
    if (name === 'react' || name === 'react/jsx-runtime') return require(name);
    if (name.endsWith('.png')) return 1;
    if (Object.hasOwn(imports, name)) return imports[name];
    throw Error(`Unexpected dependency: ${name}`);
  } });
  return module.exports;
}
const KEY = 'notiva.onboarding.completed.v1';
const platform = { OS: 'android' };
const disk = new Map(); let failRead = false, failWrite = false;
const storage = load('services/onboardingStorage.ts', {
  'react-native': { Platform: platform },
  'expo-secure-store': {
    getItemAsync: async key => { assert.equal(key, KEY); if (failRead) throw Error('read failed'); return disk.get(key) ?? null; },
    setItemAsync: async (key, value) => { assert.equal(key, KEY); if (failWrite) throw Error('write failed'); disk.set(key, value); },
  },
}, { localStorage: { getItem: key => disk.get(key) ?? null, setItem: (key, value) => { if (failWrite) throw Error('write failed'); disk.set(key, value); } } });
let auth = { session: null, isLoading: false }, routes = [], root, readGate, finish, slides;
const router = { replace: route => routes.push(route) };
const view = ({ children }) => React.createElement('div', null, children);
const Redirect = ({ href }) => { React.useEffect(() => { router.replace(href); }, [href]); return null; };
const native = {
  View: view, Text: view, Image: () => null, StyleSheet: { create: x => x },
  useWindowDimensions: () => ({ width: 400, height: 800 }),
  Pressable: ({ children, onPress, disabled, accessibilityLabel }) => React.createElement('button', { onClick: onPress, disabled, 'aria-label': accessibilityLabel }, children),
  FlatList: React.forwardRef((props, ref) => {
    slides = props;
    React.useImperativeHandle(ref, () => ({ scrollToIndex: ({ index }) => props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: index * 400 } } }) }));
    return React.createElement('div', null, 'Slides');
  }),
};
const Onboarding = load('app/screens/Onboarding/OnboardingScreen.tsx', {
  'expo-router': { router, Redirect }, 'react-native': native,
  '@expo/vector-icons/Ionicons': () => null, 'react-native-safe-area-context': { SafeAreaView: view },
  '../../../contexts/AuthContext': { useAuth: () => auth }, '../../../services/onboardingStorage': storage,
}).default;
const Splash = ({ onFinish }) => { finish = onFinish; return React.createElement('div', null, 'Splash'); };
const Login = ({ onUserRegister, onOrganizationRegister }) => React.createElement('div', null, 'Login',
  React.createElement('button', { onClick: onUserRegister }, 'User register'), React.createElement('button', { onClick: onOrganizationRegister }, 'Organization register'));
const Index = load('app/index.tsx', {
  'expo-router': { router }, '../contexts/AuthContext': { useAuth: () => auth },
  '../services/onboardingStorage': { getOnboardingCompleted: async () => { if (readGate) await readGate; return storage.getOnboardingCompleted(); } },
  './screens/Splash/SplashScreen': Splash, './screens/Onboarding/OnboardingScreen': Onboarding,
  './screens/login/LoginScreen': Login,
  './screens/login/UserRegisterScreen': ({ onBack }) => React.createElement('button', { onClick: onBack }, 'User form back'),
  './screens/login/OrganizationRegisterScreen': ({ onBack }) => React.createElement('button', { onClick: onBack }, 'Organization form back'),
}).default;
async function mount(Component = Index) {
  if (root) await act(async () => root.unmount());
  routes = []; root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Component)));
}
async function click(label) {
  const node = [...document.querySelectorAll('button')].find(x => x.getAttribute('aria-label') === label || x.textContent === label);
  assert.ok(node, `Missing ${label}`); await act(async () => node.click());
}
async function splash() { await act(async () => finish()); }
(async () => {
  for (const os of ['android', 'web']) {
    platform.OS = os; disk.clear();
    assert.equal(await storage.getOnboardingCompleted(), false);
    await mount(); assert.ok(document.body.textContent.includes('Splash')); await splash();
    assert.ok(document.body.textContent.includes('Slides')); assert.equal(document.body.textContent.includes('Login'), false);
    await click('Continue'); assert.equal(disk.has(KEY), false);
    await mount(); await splash(); assert.ok(document.body.textContent.includes('Slides'));
    await click('Skip onboarding'); assert.equal(disk.has(KEY), false);
    failWrite = true; await click('Get started');
    assert.ok(document.body.textContent.includes('Could not save')); assert.equal(document.body.textContent.includes('Login'), false);
    failWrite = false; await click('Get started'); assert.equal(disk.get(KEY), 'true');
    assert.ok(document.body.textContent.includes('Login'));
    await click('User register'); assert.ok(document.body.textContent.includes('User form')); await click('User form back');
    await click('Organization register'); assert.ok(document.body.textContent.includes('Organization form')); await click('Organization form back');
    await mount(); await splash(); assert.ok(document.body.textContent.includes('Login'));
    auth = { session: { token: 'session', user: { id: 'user-1' } }, isLoading: false };
    await mount(); await splash(); assert.deepEqual(routes, ['/(tabs)']);
    auth = { session: null, isLoading: false }; await mount(); await splash(); assert.ok(document.body.textContent.includes('Login')); assert.equal(disk.get(KEY), 'true');
    disk.clear(); await mount(); await splash(); assert.ok(document.body.textContent.includes('Slides'));
    console.log(`PASS ${os}: fresh/offline startup, unfinished restart, skip, failed save/retry, completion, register callbacks, restart, session/logout, cleared storage`);
  }
  let release; readGate = new Promise(resolve => { release = resolve; });
  await mount(); await splash(); assert.ok(document.body.textContent.includes('Splash'));
  await act(async () => { release(); }); readGate = undefined; assert.ok(document.body.textContent.includes('Slides'));
  auth.isLoading = true; await mount(); await splash(); assert.ok(document.body.textContent.includes('Splash'));
  auth.isLoading = false; await act(async () => root.render(React.createElement(Index))); assert.ok(document.body.textContent.includes('Slides'));
  failRead = true; platform.OS = 'android'; await mount(); await splash(); assert.ok(document.body.textContent.includes('Slides')); failRead = false;
  console.log('PASS delayed onboarding/auth reads never show premature Login; read failure falls back safely');
  disk.clear(); await mount(Onboarding); await click('Skip onboarding'); await click('Get started'); assert.deepEqual(routes, ['/']); assert.equal(disk.get(KEY), 'true');
  auth.session = { token: 'session', user: { id: 'user-1' } }; await mount(Onboarding); assert.deepEqual(routes, ['/(tabs)']);
  console.log('PASS direct onboarding completion returns to canonical entry; authenticated direct access redirects');
  await act(async () => root.unmount());
})().catch(error => { console.error(error); process.exitCode = 1; });
