// Run with node scripts/test-reminders.cjs. Native APIs are mocked; delivery requires a device.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function harness() {
  const cache = new Map(); const stored = new Map(); const scheduled = []; const cancelled = []; const alerts = [];
  let permission = { granted: true, canAskAgain: true, status: 'granted' }; let requests = 0; let handler;
  const notifications = {
    setNotificationHandler: (value) => { handler = value; },
    AndroidImportance: { HIGH: 4 }, AndroidNotificationPriority: { HIGH: 'high' },
    SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly', TIME_INTERVAL: 'timeInterval' },
    setNotificationChannelAsync: async (id, value) => { notifications.channel = { id, ...value }; },
    getNotificationChannelAsync: async () => notifications.channel,
    getPermissionsAsync: async () => permission,
    requestPermissionsAsync: async () => { requests++; return permission; },
    scheduleNotificationAsync: async (value) => { scheduled.push(value); return `id-${scheduled.length}`; },
    cancelScheduledNotificationAsync: async (id) => { cancelled.push(id); },
  };
  const native = { Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) }, Linking: { openSettings: async () => {} } };
  const filesystem = { Paths: { document: 'documents' }, File: class {
    constructor(dir, file) { this.key = dir + '/' + file; }
    get exists() { return stored.has(this.key); }
    async text() { return stored.get(this.key); }
    write(value) { stored.set(this.key, value); }
  } };
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file,module);
    const code = ts.transpileModule(fs.readFileSync(file,'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, __DEV__: true, console: { log() {}, warn() {} }, Date, setTimeout,
      require: (id) => id === 'expo-notifications' ? notifications : id === 'react-native' ? native : id === 'expo-file-system' ? filesystem : load(path.relative(root,path.resolve(path.dirname(file), id + '.ts'))),
    }, { filename: file });
    return module.exports;
  }
  return { load, scheduled, cancelled, alerts, notifications, setPermission: (p) => { permission = p; }, requests: () => requests, handler: () => handler, reloadStorage: () => { cache.delete(path.join(root, 'services/itemStorage.ts')); return load('services/itemStorage.ts'); } };
}
(async () => {
  const h = harness(); const service = h.load('services/notificationService.ts'); const status = h.load('utils/itemStatus.ts');
  let storage = h.load('services/itemStorage.ts');
  const now = Date.now();
  const item = { id: 'test', type: 'reminder', title: 'Notification Test', description: '', category: 'Personal', repeat: 'none', priority: 'Medium', startAt: new Date(now + 120000).toISOString(), alertBefore: { label: 'At Time', minutes: 0 }, completed: false, notificationIds: [], createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  const ids = await service.scheduleItemNotifications(item);
  assert.equal(ids.length, 1); assert.equal(h.scheduled[0].trigger.date.getTime(), now + 120000);
  assert.equal(h.scheduled[0].trigger.channelId, 'reminders'); assert.equal(h.scheduled[0].content.sound, 'default');
  assert.equal(h.scheduled[0].content.data.itemId, item.id);
  assert.equal(h.notifications.channel.importance, 4); assert.equal(h.notifications.channel.enableVibrate, true);
  const behavior = await h.handler().handleNotification(); assert.equal(behavior.shouldShowBanner, true); assert.equal(behavior.shouldPlaySound, true);
  await service.scheduleTestNotification(); assert.equal(h.scheduled[1].trigger.seconds, 5); assert.equal(h.scheduled[1].trigger.repeats, false);
  const before = { ...item, startAt: new Date(now + 3600000).toISOString(), alertBefore: { label: '10 Minutes Before', minutes: 10 } };
  assert.equal(service.createTriggers(before)[0].date.getTime(), now + 3000000);
  assert.equal(service.createTriggers({ ...item, startAt: new Date(now - 1000).toISOString() }).length, 0);
  assert.equal(service.createTriggers({ ...item, repeat: 'weekdays' }).length, 5);
  await storage.saveItem({ ...item, notificationIds: ids });
  storage = h.reloadStorage(); assert.equal((await storage.getItemById('test')).title, item.title);
  await storage.toggleComplete('test'); assert.equal((await storage.getItemById('test')).completed, true); assert.ok(h.cancelled.includes(ids[0]));
  await storage.toggleComplete('test'); assert.equal(status.getItemStatus(await storage.getItemById('test')), 'Done');
  await assert.rejects(storage.updateItem({ ...item, completed: false }));
  assert.equal(status.getItemStatus({ ...item, completed: false, status: 'Done' }), 'Done');
  assert.equal((await service.scheduleItemNotifications({ ...item, completed: true })).length, 0);
  await storage.deleteItem('test'); assert.equal(await storage.getItemById('test'), undefined);
  await storage.saveItem({ ...item, id: 'delete', notificationIds: ['cancel-on-delete'] }); await storage.deleteItem('delete'); assert.ok(h.cancelled.includes('cancel-on-delete'));
  await storage.saveItem({ ...item, id: 'task', type: 'task' }); await storage.toggleComplete('task'); await storage.toggleComplete('task'); assert.equal(status.getItemStatus(await storage.getItemById('task')), 'Done');
  assert.equal(status.isItemReadOnly({ ...item, type: 'event', startAt: new Date(now - 1000).toISOString() }), true);
  await storage.saveItem({ ...item, id: 'event', type: 'event', notificationIds: ['event-alert'] });
  await storage.updateItem({ ...item, id: 'event', type: 'event', status: 'Cancelled' }); assert.ok(h.cancelled.includes('event-alert'));
  await assert.rejects(storage.updateItem({ ...item, id: 'event', type: 'event' }));

  for (const type of ['reminder', 'task']) {
    const overdue = { ...item, id: 'reschedule-' + type, type, startAt: new Date(now - 60000).toISOString(), status: type === 'task' ? 'Overdue' : 'Missed', notificationIds: ['old-' + type] };
    await storage.saveItem(overdue);
    await storage.toggleComplete(overdue.id);
    assert.equal((await storage.getItemById(overdue.id)).completed, false);
    await assert.rejects(storage.rescheduleItem(overdue), /future/);
    const count = (await storage.getItems()).length;
    const originalSchedule = h.notifications.scheduleNotificationAsync;
    h.notifications.scheduleNotificationAsync = async (value) => {
      assert.ok(h.cancelled.includes('old-' + type), 'Cancel old notifications before scheduling');
      return originalSchedule(value);
    };
    const updated = await storage.rescheduleItem({ ...overdue, startAt: new Date(now + 3600000).toISOString(), completed: true, status: 'Done', alertBefore: { label: '10 Minutes Before', minutes: 10 } });
    h.notifications.scheduleNotificationAsync = originalSchedule;
    assert.equal(updated.id, overdue.id);
    assert.equal(updated.completed, false);
    assert.equal(updated.status, undefined);
    assert.equal(status.getItemStatus(updated), 'Pending');
    assert.equal(updated.notificationIds.length, 1);
    assert.equal((await storage.getItems()).length, count);
    assert.equal((await storage.getItemById(updated.id)).notificationIds[0], updated.notificationIds[0]);
    assert.equal(h.scheduled.at(-1).trigger.date.getTime(), now + 3000000);
    await storage.toggleComplete(updated.id);
    await assert.rejects(storage.rescheduleItem(updated), /cannot be rescheduled/);
  }
  console.log('PASS: Missed/Overdue completion blocked; reschedule preserves ID/count, cancels first, resets stale status, stores new IDs, validates future dates, and rejects Done items.');
  h.setPermission({ granted: false, canAskAgain: false, status: 'denied' }); assert.equal(await service.prepareNotifications(), false); assert.equal(h.requests(), 0); assert.ok(h.alerts.length);
  h.setPermission({ granted: false, canAskAgain: true, status: 'denied' }); await service.prepareNotifications(); await service.prepareNotifications(); assert.equal(h.requests(), 1);
  console.log('PASS: schedule dates/offsets, five-second trigger, channel/handler/content, native persistence reload, read-only guards, cancellation, denied permission and prompt throttling (mocked native APIs).');
})().catch((error) => { console.error(error); process.exitCode = 1; });
