/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness, makeItem } = require('./test-native-alarms.cjs');
const now = new Date(2026, 8, 28, 10).getTime();
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [now])); }
  static now() { return now; }
}
const itemAt = (minutes, ahead, extra = {}) => makeItem({
  startAt: new Clock(now + ahead * 60000).toISOString(),
  alertBefore: { label: `${minutes} Minutes Before`, minutes }, ...extra,
});
async function run() {
  const defaults = harness('android', Clock);
  assert.equal((await defaults.load('services/notificationService.ts').getNotificationSettings()).preAlerts, true);
  for (const type of ['reminder', 'task', 'event']) {
    for (const minutes of [5, 10, 15, 30, 60, 1440, 2880, 10080]) {
      for (const expired of [false, true]) {
        const h = harness('android', Clock), service = h.load('services/notificationService.ts');
        const item = itemAt(minutes, expired ? minutes - 1 : minutes + 3, { type });
        const ids = await service.scheduleItemNotifications(item, true);
        assert.equal(h.expo.size, 0);
        assert.equal(h.alarms.size, 1); assert.equal(h.popups.length, 0);
        assert.equal(ids.length, 1);
        assert.equal([...h.alarms.values()][0].startAt, new Date(item.startAt).getTime());
        assert.equal([...h.alarms.values()][0].preAlertMinutes, minutes);

      }
    }
  }
  const screen = fs.readFileSync(path.join(__dirname, '../app/screens/create/[type].tsx'), 'utf8');
  const expected = { None: 0, '5 Minutes Before': 5, '10 Minutes Before': 10, '15 Minutes Before': 15,
    '30 Minutes Before': 30, '1 Hour Before': 60, '1 Day Before': 1440, '2 Days Before': 2880, '1 Week Before': 10080 };
  const options = [...screen.matchAll(/\{ label: "([^"]+)", minutes: (\d+) \}/g)];
  for (const [, label, minutes] of options) assert.equal(Number(minutes), expected[label]);
  for (const label of Object.keys(expected)) assert.ok(options.some(match => match[1] === label));

  const h = harness('android', Clock), service = h.load('services/notificationService.ts');
  const item = itemAt(5, 15, { title: 'PRIVATE TITLE', description: 'PRIVATE DESCRIPTION' });
  const oldIds = await service.scheduleItemNotifications(item, true);
  await Promise.all(Array.from({ length: 4 }, () => service.scheduleItemNotifications(itemAt(10, 15), true)));
  assert.equal([...h.alarms.values()][0].preAlertMinutes, 10); assert.equal(oldIds.length, 1);
  assert.equal(h.expo.size, 0); assert.equal(h.alarms.size, 1);
  assert.equal([...h.alarms.values()][0].startAt, now + 15 * 60000);
  h.restart();
  await h.load('services/notificationService.ts').scheduleItemNotifications(itemAt(10, 15), true);
  assert.equal(h.expo.size, 0); assert.equal(h.alarms.size, 1);
  assert.doesNotMatch(JSON.stringify(h.diagnostics), /PRIVATE TITLE|PRIVATE DESCRIPTION/);

  for (const repeat of ['daily', 'weekly', 'weekdays']) {
    const r = harness('android', Clock); let storage = r.load('services/itemStorage.ts');
    const first = itemAt(5, 15, { repeat, weeklyDays: repeat === 'weekly' ? [1, 3, 5] : undefined });
    await storage.saveItem(first);
    const saved = await storage.getItemById(first.id);
    await storage.updateItem({ ...saved, alertBefore: { label: '10 Minutes Before', minutes: 10 } });
    for (let i = 0; i < 3; i++) { r.restart(); storage = r.load('services/itemStorage.ts'); await storage.getItems(); }
    assert.equal(r.alarms.size, 1); assert.equal(r.expo.size, 0, 'native series owns the normal pre-alert; no Expo duplicate');
    assert.equal([...r.alarms.values()][0].preAlertMinutes, 10);
    r.alarms.clear(); r.restart();
    await r.load('services/itemStorage.ts').getItems();
    assert.equal(r.alarms.size, 1); assert.equal([...r.alarms.values()][0].preAlertMinutes, 10);
  }

  const denied = harness('android', Clock); let prompts = 0;
  denied.notifications.getPermissionsAsync = async () => ({ granted: false, canAskAgain: true });
  denied.notifications.requestPermissionsAsync = async () => { prompts++; return { granted: false }; };
  for (let i = 0; i < 3; i++) await denied.load('services/notificationService.ts').scheduleItemNotifications(itemAt(5, 8));
  assert.equal(prompts, 1); assert.equal(denied.popups.length, 1);
  assert.equal(denied.expo.size, 0); assert.equal(denied.alarms.size, 0);
  denied.notifications.getPermissionsAsync = async () => ({ granted: true });
  await denied.load('services/notificationService.ts').scheduleItemNotifications(itemAt(5, 8), true);
  assert.equal(denied.expo.size, 0); assert.equal(denied.alarms.size, 1);

  const blocked = harness('android', Clock);
  blocked.notifications.getPermissionsAsync = async () => ({ granted: false, canAskAgain: false });
  blocked.notifications.requestPermissionsAsync = async () => { throw Error('Must not request denied permission again'); };
  await blocked.load('services/notificationService.ts').scheduleItemNotifications(itemAt(10, 15));
  assert.equal(blocked.popups.length, 1); assert.equal(blocked.expo.size, 0);

  const atBoundary = harness('android', Clock);
  await atBoundary.load('services/notificationService.ts').scheduleItemNotifications(itemAt(5, 5), true);
  assert.equal(atBoundary.expo.size, 0); assert.equal(atBoundary.alarms.size, 1);

  const migration = harness('android', Clock);
  migration.expo.set('legacy', { identifier: 'legacy', content: { data: { itemId: 'reminder', alertType: 'pre-alert' } } });
  await migration.load('services/notificationService.ts').scheduleItemNotifications(itemAt(5,8), true);
  assert.equal(migration.expo.size, 0); assert.ok(migration.cancelled.includes('legacy'));
  const oldBuild = harness('android', Clock); delete oldBuild.bridge.nativePreAlertsVersion;
  await assert.rejects(oldBuild.load('services/notificationService.ts').scheduleItemNotifications(itemAt(5,8), true), /new Android build/);
  const channel = harness('android', Clock), created = new Map();
  channel.notifications.getNotificationChannelAsync = async id => created.get(id) || null;
  channel.notifications.setNotificationChannelAsync = async (id, data) => created.set(id, data);
  await channel.load('services/notificationService.ts').saveNotificationSettings({ preAlerts: true, vibration: false, alarmSound: 'system' });
  await channel.load('services/notificationService.ts').scheduleItemNotifications(itemAt(5, 8), true);
  assert.equal(created.get('reminders').importance, 4); assert.equal(created.get('reminders').sound, 'default');
  assert.equal(created.get('reminders').enableVibrate, false);
  await channel.load('services/notificationService.ts').saveNotificationSettings({ preAlerts: false, vibration: false, alarmSound: 'system' });
  await channel.load('services/notificationService.ts').scheduleItemNotifications(itemAt(5, 8), true);
  assert.equal(channel.expo.size, 0); assert.equal(channel.alarms.size, 1); assert.equal(channel.bridge.preEnabled, false);
  await channel.load('services/notificationService.ts').saveNotificationSettings({ preAlerts: true, vibration: true, alarmSound: 'robotic_loop' });
  assert.equal(channel.bridge.preEnabled, true); assert.equal(channel.bridge.preVibration, true);
  const repair = harness('android', Clock);
  const stored = itemAt(10,15);
  stored.notificationIds = await repair.load('services/notificationService.ts').scheduleItemNotifications(stored,true);
  await repair.load('services/itemStorage.ts').saveItem(stored);
  repair.alarms.clear(); repair.restart();
  await repair.load('services/itemStorage.ts').getItems();
  assert.equal(repair.alarms.size,1); assert.equal(repair.expo.size,0);
  assert.equal([...repair.alarms.values()][0].preAlertMinutes,10);
  console.log('PASS native pre-alert bridge: all six offsets/types, no Expo scheduling, migration, edits, concurrency/restart/repair, recurrence delegation, permissions, settings and old-build guard');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
