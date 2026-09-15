/* global __dirname */
// Integration contract tests. Android delivery/audio/UI still require a device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function harness(os = 'android') {
  const cache = new Map(), files = new Map(), expo = new Map(), alarms = new Map();
  const cancelled = [];
  let counter = 0, exact = true, fail = false;
  const bridge = {
    canSchedule: async () => exact, canFullScreen: async () => true,
    schedule: async raw => { if (fail) throw Error('native failure'); const data = JSON.parse(raw); alarms.set(data.id, data); return data.id; },
    cancel: async id => { cancelled.push(id); alarms.delete(id); },
  };
  const notifications = {
    setNotificationHandler() {}, AndroidImportance: { HIGH: 4, MAX: 5 }, AndroidNotificationPriority: { HIGH: 'high', MAX: 'max' },
    AndroidNotificationVisibility: { PUBLIC: 1 },
    SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' },
    getPermissionsAsync: async () => ({ granted: true }),
    getNotificationChannelAsync: async () => ({ importance: 4, sound: 'default' }),
    setNotificationChannelAsync: async () => {},
    scheduleNotificationAsync: async request => { const id = `expo-${++counter}`; expo.set(id, { ...request, identifier: id }); return id; },
    getAllScheduledNotificationsAsync: async () => [...expo.values()],
    getNextTriggerDateAsync: async () => Date.now() + 100000,
    cancelScheduledNotificationAsync: async id => { cancelled.push(id); expo.delete(id); },
    getLastNotificationResponseAsync: async () => null,
  };
  const mocks = {
    'react-native': { Platform: { OS: os, Version: 36 }, NativeModules: { NotivaAlarm: bridge }, Alert: { alert() {} }, Linking: {} },
    'expo-notifications': notifications,
    'expo-file-system': { Paths: { document: 'docs' }, File: class {
      constructor(dir, name) { this.key = dir + '/' + name; }
      get exists() { return files.has(this.key); }
      async text() { return files.get(this.key); }
      write(raw) { files.set(this.key, raw); }
    } },
  };
  function load(relative) {
    const file = path.resolve(root, relative);
    if (file.endsWith('notificationHistory.ts')) return { recordNotification: async () => {} };
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, __DEV__: true, Date, console: { log() {}, warn() {} },
      require: name => mocks[name] || load(path.relative(root, path.resolve(path.dirname(file), name + '.ts'))),
    }, { filename: file });
    return module.exports;
  }
  return { load, expo, alarms, cancelled, setExact: value => { exact = value; }, setFail: value => { fail = value; } };
}
const makeItem = (overrides = {}) => ({
  id: 'reminder', type: 'reminder', title: 'Read', description: '', category: 'Personal', repeat: 'none',
  startAt: new Date(Date.now() + 3600000).toISOString(), alertBefore: { minutes: 5, label: '5 minutes' },
  notificationIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...overrides,
});
(async () => {
  const h = harness(), service = h.load('services/notificationService.ts'), storage = h.load('services/itemStorage.ts');
  await service.saveNotificationSettings({ repeatCount: 5, repeatIntervalSeconds: 3, vibration: false });
  const item = makeItem();
  item.notificationIds = await service.scheduleItemNotifications(item, true);
  assert.equal(h.expo.size, 1); assert.equal(h.alarms.size, 1);
  const pre = [...h.expo.values()][0], main = [...h.alarms.values()][0];
  assert.equal(pre.trigger.date.getTime(), new Date(item.startAt).getTime() - 300000);
  assert.equal(main.startAt, new Date(item.startAt).getTime()); assert.equal(main.vibration, false);
  assert.equal(item.notificationIds.length, 2); assert.equal(main.preAlertIds[0], pre.identifier);
  await storage.saveItem(item);
  await h.load('services/notificationResponse.ts').consumeNotificationResponse({ notification: { request: pre, date: Date.now() }, actionIdentifier: 'tap' });
  assert.equal(h.cancelled.length, 0, 'pre-alert taps must not cancel any recurrence/main alarm');
  assert.equal((await storage.getItemById(item.id)).completed, undefined, 'tap cannot complete');
  await storage.toggleComplete(item.id, 'Finished reading');
  assert.equal(h.alarms.size, 0); assert.equal(h.expo.size, 0);
  assert.equal((await storage.getItemById(item.id)).completionNote, 'Finished reading');

  for (const repeat of ['none', 'daily', 'weekly', 'weekdays', 'monthly', 'yearly']) {
    const r = harness(); const s = r.load('services/notificationService.ts');
    const ids = await s.scheduleItemNotifications(makeItem({ repeat, alertBefore: { minutes: 0 } }), true);
    assert.equal(ids.length, 1); assert.equal(r.expo.size, 0); assert.equal(r.alarms.size, 1);
    assert.equal([...r.alarms.values()][0].repeat, repeat);
  }
  const denied = harness(); denied.setExact(false);
  await assert.rejects(denied.load('services/notificationService.ts').scheduleItemNotifications(makeItem(), true), /Alarms & reminders/);
  assert.equal(denied.expo.size, 0); assert.equal(denied.alarms.size, 0);
  const failed = harness(); failed.setFail(true);
  await assert.rejects(failed.load('services/notificationService.ts').scheduleItemNotifications(makeItem(), true), /native failure/);
  assert.equal(failed.expo.size, 0, 'roll back pre-alert if native scheduling fails');
  const ios = harness('ios');
  await ios.load('services/notificationService.ts').scheduleItemNotifications(makeItem(), true);
  assert.equal(ios.expo.size, 2); assert.equal(ios.alarms.size, 0);
  const test = harness();
  await test.load('services/notificationService.ts').scheduleTestNotification();
  const saved = await test.load('services/itemStorage.ts').getItems();
  assert.equal(saved.length, 1); assert.equal(test.alarms.size, 1);
  assert.ok(new Date(saved[0].startAt).getTime() - Date.now() > 40000);
  console.log('Native alarm integration: passed (pre-alert, no bursts, recurrence delegation, permission failure, rollback, completion, iOS, 45-second test).');
})().catch(error => { console.error(error); process.exitCode = 1; });
