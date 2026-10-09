/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'components/common/AppStatusBar.tsx'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
for (const os of ['android', 'ios', 'web']) {
  for (const top of [0, 24, 48]) {
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require: name => {
      if (name === 'react/jsx-runtime') return require(name);
      if (name === 'expo-status-bar') return { StatusBar: 'StatusBar' };
      if (name === 'react-native') return { Platform: { OS: os }, View: 'View', StyleSheet: { create: value => value } };
      if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top, bottom: 34 }) };
      throw Error(name);
    } });
    const children = React.Children.toArray(module.exports.default().props.children);
    assert.equal(children[0].type, 'StatusBar');
    assert.equal(children[0].props.style, os === 'android' ? 'light' : 'auto');
    assert.equal(children[0].props.backgroundColor, undefined, 'no deprecated background-color prop');
    if (os === 'android') {
      const backdrop = children[1];
      const style = Object.assign({}, ...backdrop.props.style);
      assert.equal(style.backgroundColor, '#4D3FE6'); assert.equal(style.height, top);
      assert.equal(style.position, 'absolute'); assert.equal(style.top, 0);
      assert.equal(backdrop.props.pointerEvents, 'none'); assert.equal(backdrop.props.accessible, false);
      assert.equal(style.paddingTop, undefined, 'no duplicate content padding');
      assert.equal(style.bottom, undefined, 'navigation bar is untouched');
    } else assert.equal(children.length, 1);
  }
}
const layout = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
assert.equal((layout.match(/<AppStatusBar\s*\/>/g) || []).length, 1);
assert.match(layout, /statusBarStyle: Platform.OS === "android" \? "light" : "auto"/);
function checkScreens(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) checkScreens(file);
    else if (file.endsWith('.tsx')) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /<StatusBar\b/, `screen override: ${file}`);
  }
}
checkScreens(path.join(root, 'app'));
console.log('PASS global Android status bar: light icons, purple inset, inset changes, touch/accessibility, no content padding/navigation changes or screen overrides');
