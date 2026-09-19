/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function harness(os, files = new Map()) {
  const cache = new Map(), alarms = new Map(), notifications = new Map();
  let sequence = 0;
  const bridge = {
    canSchedule: async () => true,
    canFullScreen: async () => true,
    schedule: async raw => { const item = JSON.parse(raw); alarms.set(item.id, item); return item.id; },
    cancel: async id => alarms.delete(id),
  };
  const mocks = {
    react: { useSyncExternalStore: (_, snapshot) => snapshot() },
    'react-native': { Platform: { OS: os, Version: 36 }, NativeModules: { NotivaAlarm: bridge }, Alert: { alert() {} }, Linking: {} },
    'expo-file-system': { Paths: { document: 'docs' }, File: class {
      constructor(dir, name) { this.key = `${dir}/${name}`; }
      get exists() { return files.has(this.key); }
      async text() { return files.get(this.key); }
      write(value) { files.set(this.key, value); }
    } },
    'expo-notifications': {
      setNotificationHandler() {}, AndroidImportance: { HIGH: 4, MAX: 5 },
      AndroidNotificationPriority: { HIGH: 'high', MAX: 'max' }, AndroidNotificationVisibility: { PUBLIC: 1 },
      SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' },
      getPermissionsAsync: async () => ({ granted: true }),
      getNotificationChannelAsync: async () => ({ importance: 4, sound: 'default' }),
      setNotificationChannelAsync: async () => {},
      scheduleNotificationAsync: async request => { const id = `notification-${++sequence}`; notifications.set(id, { ...request, identifier: id }); return id; },
      getAllScheduledNotificationsAsync: async () => [...notifications.values()],
      getNextTriggerDateAsync: async () => Date.now() + 100000,
      cancelScheduledNotificationAsync: async id => notifications.delete(id),
    },
  };
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, __DEV__: false, Date, Error,
      console: { log() {}, warn() {} },
      localStorage: { getItem: key => files.get(key) || null, setItem: (key, value) => files.set(key, value) },
      require: name => mocks[name] || load(path.resolve(path.dirname(file), `${name}.ts`)),
    });
    return module.exports;
  }
  return { load, files, alarms, notifications };
}

(async () => {
  for (const os of ['web', 'android', 'ios']) {
    const h = harness(os);
    const settings = h.load('services/appSettings.ts');
    assert.equal((await settings.getAppSettings()).defaultAlertBefore, 5);
    for (const minutes of [0, 5, 10, 15, 30, 60]) {
      await settings.saveAppSettings({ defaultAlertBefore: minutes, weekStartsOn: 0 });
      const restarted = harness(os, h.files).load('services/appSettings.ts');
      assert.equal((await restarted.getAppSettings()).defaultAlertBefore, minutes);
      assert.equal((await restarted.getAppSettings()).weekStartsOn, 0);
    }
    await assert.rejects(settings.saveAppSettings({ defaultAlertBefore: 99, weekStartsOn: 0 }));
    console.log(`PASS ${os}: app preferences persist across restart; all alert options and invalid-value rejection`);
  }
  const a = harness('web').load('utils/itemAnalytics.ts');
  for (const zone of ['UTC', 'Asia/Kolkata', 'America/New_York']) {
    process.env.TZ = zone;
    for (const now of [new Date(2026, 8, 20, 12), new Date(2026, 2, 8, 12), new Date(2027, 0, 1, 12)]) {
      const make = (id, day) => ({ id, type: 'task', startAt: day.toISOString(), updatedAt: day.toISOString(), completed: true });
      const sunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay(), 10);
      const monday = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 1, 10);
      const items = [make('sunday', sunday), make('monday', monday)];
      for (const firstDay of [0, 1]) {
        const result = a.calculateAnalytics(items, 'week', now, firstDay);
        assert.equal(new Date(result.days[0].start).getDay(), firstDay);
        assert.equal(result.days[0].label, firstDay === 0 ? 'Sun' : 'Mon');
        assert.equal(result.days.length, 7);
        for (let i = 1; i < 7; i++) assert.equal(result.days[i - 1].end, result.days[i].start);
        assert.equal(a.calculateAnalytics(items, 'all', now, firstDay).completed, 2);
      }
      assert.equal(a.weekStart(now).getTime(), a.weekStart(now, 1).getTime());
    }
    console.log(`PASS ${zone}: Monday/Sunday analytics, DST/year boundaries, unchanged All Time completion counts`);
  }
  for (const repeat of ['none', 'daily', 'weekly', 'monthly', 'yearly']) {
    const h = harness('android');
    const service = h.load('services/notificationService.ts');
    const item = { id: 'item', title: 'Test', type: 'reminder', repeat, startAt: new Date(Date.now() + 3600000).toISOString(), alertBefore: { label: '5 Minutes Before', minutes: 5 } };
    await service.saveNotificationSettings({ repeatCount: 1, repeatIntervalSeconds: 5, vibration: false, preAlerts: false });
    await service.scheduleItemNotifications(item, true);
    assert.equal(h.notifications.size, 0);
    assert.equal(h.alarms.size, 1);
    assert.equal([...h.alarms.values()][0].vibration, false);
    await service.saveNotificationSettings({ repeatCount: 1, repeatIntervalSeconds: 5, vibration: true, preAlerts: true });
    assert.equal(h.notifications.size, 0, 'preference changes do not rewrite existing schedules');
    await service.scheduleItemNotifications(item, true);
    assert.ok(h.notifications.size > 0);
    assert.equal(h.alarms.size, 1);
    assert.equal([...h.alarms.values()][0].vibration, true);
  }
  console.log('PASS pre-alert preference: one-time and recurring schedules; exact-time native alarms preserved; changes apply on scheduling only');
  const create = fs.readFileSync(path.join(root, 'app/screens/create/[type].tsx'), 'utf8');
  assert.match(create, /if \(params.id \|\| type !== "reminder"\) return/);
  assert.match(create, /!alertTouched.current/);
  assert.match(create, /alertTouched.current = true/);
  const profile = fs.readFileSync(path.join(root, 'app/(tabs)/profile.tsx'), 'utf8');
  assert.doesNotMatch(profile, /repeatCount|repeatIntervalSeconds|NOTIFICATION_REPEAT_OPTIONS/);
  for (const route of ['EditProfileScreen','ChangePasswordScreen','OrganizationScreen','JoinOrganizationScreen','NotificationSettingsScreen','AppSettingsScreen']) {
    assert.ok(fs.existsSync(path.join(root, `app/screens/profile/${route}.tsx`)));
  }
  console.log('PASS route files, removed legacy notification controls, new-reminder-only default guard and user-choice race guard');
})().catch(error => { console.error(error); process.exitCode = 1; });
