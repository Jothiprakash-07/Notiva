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
  const cancelled = [], popups = [];
  let nextTrigger = () => Date.now() + 100000;
  let counter = 0, exact = true, fail = false;
  const bridge = {
    setAlarmSound: async () => {},
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
    getNextTriggerDateAsync: async () => nextTrigger(),
    cancelScheduledNotificationAsync: async id => { cancelled.push(id); expo.delete(id); },
    getLastNotificationResponseAsync: async () => null,
  };
  const mocks = {
    'react-native': { Platform: { OS: os, Version: 36 }, NativeModules: { NotivaAlarm: bridge }, Alert: { alert: (...args) => popups.push(args) }, Linking: {} },
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
    vm.runInNewContext(code, { module, exports: module.exports, __DEV__: true, Date, Error, console: { log() {}, warn() {} },
      require: name => mocks[name] || load(path.relative(root, path.resolve(path.dirname(file), name + '.ts'))),
    }, { filename: file });
    return module.exports;
  }
  return { load, expo, alarms, cancelled, popups, setNextTrigger: value => { nextTrigger = value; }, setExact: value => { exact = value; }, setFail: value => { fail = value; } };
}
const makeItem = (overrides = {}) => ({
  id: 'reminder', type: 'reminder', title: 'Read', description: '', category: 'Personal', repeat: 'none',
  startAt: new Date(Date.now() + 3600000).toISOString(), alertBefore: { minutes: 5, label: '5 minutes' },
  notificationIds: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...overrides,
});
(async () => {
  for (const os of ['android', 'ios']) {
    for (const alertBefore of [undefined, null, { minutes: 0 }, { minutes: 5 }]) {
      const h = harness(os);
      const item = makeItem({ startAt: new Date(Date.now() + 4 * 60000).toISOString(), category: null, priority: null, alertBefore });
      const ids = await h.load('services/notificationService.ts').scheduleItemNotifications(item);
      assert.equal(ids.length, 1, 'future main alarm survives absent or expired pre-alert');
      assert.equal(h.popups.length, 0);
      assert.equal(os === 'android' ? h.alarms.size : h.expo.size, 1);
      await h.load('services/itemStorage.ts').saveItem({ ...item, notificationIds: ids });
      await h.load('services/itemStorage.ts').rescheduleItem({ ...item, startAt: new Date(Date.now() + 3 * 60000).toISOString() });
      assert.equal(h.popups.length, 0, 'rescheduling ignores expired pre-alerts too');
      assert.equal((await h.load('services/itemStorage.ts').getItemById(item.id)).category, null);
    }
  }
  const future = harness();
  const futureItem = makeItem({ startAt: new Date(Date.now() + 10 * 60000).toISOString() });
  await future.load('services/notificationService.ts').scheduleItemNotifications(futureItem, true);
  assert.equal(future.expo.size, 1); assert.equal(future.alarms.size, 1);
  assert.equal([...future.expo.values()][0].trigger.date.getTime(), new Date(futureItem.startAt).getTime() - 5 * 60000);
  for (const repeat of ['daily', 'weekly', 'weekdays', 'monthly', 'yearly']) {
    for (const expired of [false, true]) {
      const h = harness();
      if (expired) h.setNextTrigger(() => Date.now() - 60000);
      await h.load('services/notificationService.ts').scheduleItemNotifications(makeItem({ repeat, startAt: new Date(Date.now() + 4 * 60000).toISOString() }));
      assert.equal(h.alarms.size, 1); assert.equal(h.popups.length, 0);
      assert.equal(h.expo.size, expired ? 0 : repeat === 'weekdays' ? 5 : 1);
    }
  }
  const pastMain = harness();
  await assert.rejects(pastMain.load('services/notificationService.ts').scheduleItemNotifications(makeItem({ startAt: new Date(Date.now() - 1000).toISOString() }), true), /future reminder/);
  console.log('PASS absent/expired pre-alerts, reschedule, future pre-alert, recurring skip and past-main validation');
  const h = harness(), service = h.load('services/notificationService.ts'), storage = h.load('services/itemStorage.ts');
  await service.saveNotificationSettings({ repeatCount: 5, repeatIntervalSeconds: 3, vibration: false });
  const tenPM = new Date(); tenPM.setDate(tenPM.getDate() + 1); tenPM.setHours(22, 0, 0, 0);
  const item = makeItem({ startAt: tenPM.toISOString() });
  item.notificationIds = await service.scheduleItemNotifications(item, true);
  assert.equal(h.expo.size, 1); assert.equal(h.alarms.size, 1);
  const pre = [...h.expo.values()][0], main = [...h.alarms.values()][0];
  assert.equal(pre.trigger.date.getTime(), new Date(item.startAt).getTime() - 300000);
  assert.equal(pre.trigger.date.getHours(), 21); assert.equal(pre.trigger.date.getMinutes(), 55);
  assert.equal(pre.content.sound, 'default');
  assert.equal(main.startAt, new Date(item.startAt).getTime()); assert.equal(main.vibration, false);
  assert.equal(item.notificationIds.length, 2); assert.equal(main.preAlertIds[0], pre.identifier);
  await storage.saveItem(item);
  await h.load('services/notificationResponse.ts').consumeNotificationResponse({ notification: { request: pre, date: Date.now() }, actionIdentifier: 'tap' });
  assert.equal(h.cancelled.length, 0, 'pre-alert taps must not cancel any recurrence/main alarm');
  assert.equal((await storage.getItemById(item.id)).completed, undefined, 'tap cannot complete');
  await storage.toggleComplete(item.id, 'Finished reading');
  assert.equal(h.alarms.size, 0); assert.equal(h.expo.size, 0);
  assert.equal((await storage.getItemById(item.id)).completionNote, 'Finished reading');

  const repeated = harness(), repeatedService = repeated.load('services/notificationService.ts');
  const repeatedStorage = repeated.load('services/itemStorage.ts');
  const edited = makeItem();
  await Promise.all(Array.from({ length: 5 }, () => repeatedService.scheduleItemNotifications(edited, true)));
  assert.equal(repeated.expo.size, 1, 'concurrent scheduling must leave one pre-alert');
  assert.equal(repeated.alarms.size, 1, 'concurrent scheduling must leave one native alarm');
  edited.notificationIds = await repeatedService.scheduleItemNotifications(edited, true);
  await repeatedStorage.saveItem(edited);
  for (let i = 1; i <= 3; i++) {
    await repeatedStorage.rescheduleItem({ ...edited, startAt: new Date(Date.now() + (i + 1) * 3600000).toISOString() });
    assert.equal(repeated.expo.size, 1);
    assert.equal(repeated.alarms.size, 1);
    const latest = await repeatedStorage.getItemById(edited.id);
    assert.equal([...repeated.alarms.values()][0].startAt, new Date(latest.startAt).getTime());
  }
  await repeatedStorage.deleteItem(edited.id);
  assert.equal(repeated.expo.size, 0);
  assert.equal(repeated.alarms.size, 0);

  // Evaluate the edit screen's actual cancellation argument against reused IDs.
  const screen = ts.createSourceFile('screen.tsx', fs.readFileSync(path.join(root, 'app/screens/create/[type].tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let editCleanup;
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(screen) === 'cancelNotifications' && node.arguments[0]?.getText(screen).startsWith('existing.notificationIds')) editCleanup = node.arguments[0].getText(screen);
    ts.forEachChild(node, visit);
  }
  visit(screen);
  assert.ok(editCleanup);
  assert.deepEqual(Array.from(vm.runInNewContext(editCleanup, {
    existing: { notificationIds: ['expo-old', 'native-alarm:reminder'] },
    scheduledIds: ['expo-new', 'native-alarm:reminder'],
  })), ['expo-old'], 'editing must not cancel the replacement native alarm');

  for (const repeat of ['none', 'daily', 'weekly', 'weekdays', 'monthly', 'yearly']) {
    const r = harness(); const s = r.load('services/notificationService.ts');
    const ids = await s.scheduleItemNotifications(makeItem({ repeat, alertBefore: { minutes: 0 } }), true);
    assert.equal(ids.length, 1); assert.equal(r.expo.size, 0); assert.equal(r.alarms.size, 1);
    assert.equal([...r.alarms.values()][0].repeat, repeat);
    assert.equal([...r.alarms.values()][0].vibration, true);
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
