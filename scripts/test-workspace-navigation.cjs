/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
let route = 'index', session = { user: { id: 'first' }, sessionId: 'session-one' };
const Tabs = () => null; Tabs.Screen = () => null;
const moduleValue = { exports: {} };
const source = fs.readFileSync(path.join(__dirname, '../app/(tabs)/_layout.tsx'), 'utf8');
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
 module: moduleValue, exports: moduleValue.exports, require: name => {
  if (name === 'react/jsx-runtime') return require(name);
  if (name === 'expo-router') return { Tabs, useSegments: () => ['(tabs)', route] };
  if (name.includes('AuthContext')) return { useAuth: () => ({ session }) };
  if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ bottom: 24 }) };
  if (name === 'react-native') return { View: 'view', Image: 'image', StyleSheet: { create: value => value } };
  return {};
 }
});
const render = () => moduleValue.exports.default();
const screens = tree => React.Children.toArray(tree.props.children).map(node => node.props);
const visible = tree => screens(tree).filter(node => node.options.href !== null).map(node => node.options.title);
const normal = ['Home', 'Reminders', 'Analytics', 'Team', 'Profile'];
const workspace = ['Home', 'Inbox', 'Created', 'Teams', 'Organization'];
const baseline = render(); assert.deepEqual(visible(baseline), normal);
for (route of ['team', 'created', 'teams', 'organization']) {
 const tree = render(); assert.deepEqual(visible(tree), workspace);
 assert.equal(tree.props.screenOptions.tabBarStyle.height, 78);
 assert.deepEqual(tree.props.screenOptions, baseline.props.screenOptions);
 assert.equal(screens(tree).find(row => row.name === 'index').options.title, 'Home');
}
for (route of ['index', 'reminders', 'analytics', 'profile', 'notifications']) assert.deepEqual(visible(render()), normal);
route = 'team'; const oldKey = render().key;
session = { user: { id: 'second' }, sessionId: 'session-two' }; assert.notEqual(render().key, oldKey);
session = undefined; assert.equal(render().key, 'signed-out');
for (const name of ['created', 'teams', 'organization']) assert.match(fs.readFileSync(path.join(__dirname, `../app/(tabs)/${name}.tsx`), 'utf8'), new RegExp(`section="${name}"`));
assert.equal(screens(baseline).find(row => row.name === 'team').name, 'team');
console.log('PASS normal/workspace route tabs, Home exit, unchanged tab styling, all workspace route bindings and session navigator reset');
