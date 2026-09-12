/* global __dirname */
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
    AndroidNotificationVisibility: { PUBLIC: 1 },
    AndroidImportance: { HIGH: 4 }, AndroidNotificationPriority: { HIGH: 'high' },
    SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly', TIME_INTERVAL: 'timeInterval' },
    setNotificationChannelAsync: async (id, value) => { notifications.channel = { id, ...value }; },
    getNotificationChannelAsync: async () => notifications.channel,
    getNextTriggerDateAsync: async () => Date.now() + 86400000,
    getAllScheduledNotificationsAsync: async () => scheduled.map((value, i) => ({ ...value, identifier: `id-${i + 1}` })),
    getLastNotificationResponseAsync: async () => notifications.lastResponse || null,
    clearLastNotificationResponseAsync: async () => { notifications.lastResponse = null; },
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
    vm.runInNewContext(code, { module, exports: module.exports, __DEV__: true, console: { log() {}, warn() {} }, Date, Error, setTimeout,
      require: (id) => id === 'expo-notifications' ? notifications : id === 'react-native' ? native : id === 'expo-file-system' ? filesystem : load(path.relative(root,path.resolve(path.dirname(file), id + '.ts'))),
    }, { filename: file });
    return module.exports;
  }
  return { filesystem, load, scheduled, cancelled, alerts, notifications, setPermission: (p) => { permission = p; }, requests: () => requests, handler: () => handler, reloadStorage: () => { cache.delete(path.join(root, 'services/itemStorage.ts')); return load('services/itemStorage.ts'); } };
}
(async () => {
  const h = harness(); const service = h.load('services/notificationService.ts'); const status = h.load('utils/itemStatus.ts');
  let storage = h.load('services/itemStorage.ts');
  const now = Date.now();
  const item = { id: 'test', type: 'reminder', title: 'Notification Test', description: '', category: 'Personal', repeat: 'none', priority: 'Medium', startAt: new Date(now + 120000).toISOString(), alertBefore: { label: 'At Time', minutes: 0 }, completed: false, notificationIds: [], createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  assert.equal((await service.getNotificationSettings()).repeatCount, 1);
  await service.saveNotificationSettings({ repeatCount: 3, repeatIntervalSeconds: 5, vibration: true });
  const ids = await service.scheduleItemNotifications(item);
  assert.equal(ids.length, 3); assert.equal(h.scheduled[0].trigger.date.getTime(), now + 120000);
  assert.equal(h.scheduled[0].trigger.channelId, 'reminders'); assert.equal(h.scheduled[0].content.sound, 'default');
  assert.equal(h.scheduled[0].content.data.itemId, item.id);
  assert.equal(h.notifications.channel.importance, 4); assert.equal(h.notifications.channel.enableVibrate, true);
  const behavior = await h.handler().handleNotification(); assert.equal(behavior.shouldShowBanner, true); assert.equal(behavior.shouldPlaySound, true);
  const testNow = Date.now();
  const testId = await service.scheduleTestNotification();
  assert.equal(testId, 'id-4'); assert.equal(h.scheduled.length, 4);
  assert.equal(h.scheduled[3].trigger.type, 'date');
  assert.ok(h.scheduled[3].trigger.date.getTime() >= testNow + 10000);
  assert.ok(h.scheduled[3].trigger.date.getTime() <= Date.now() + 10000);
  assert.equal(h.scheduled[3].content.sound, 'default');
  const before = { ...item, startAt: new Date(now + 3600000).toISOString(), alertBefore: { label: '10 Minutes Before', minutes: 10 } };
  assert.equal(service.notificationDateFor(before).getTime(), now + 3000000);
  assert.equal((await service.scheduleItemNotifications({ ...item, startAt: new Date(now - 1000).toISOString() })).length, 0);
  assert.equal(service.createRecurringTriggers({ ...item, repeat: 'weekdays' }).length, 5);
  await storage.saveItem({ ...item, notificationIds: ids });
  storage = h.reloadStorage(); assert.equal((await storage.getItemById('test')).title, item.title);
  await storage.toggleComplete('test'); assert.equal((await storage.getItemById('test')).completed, true); assert.ok(h.cancelled.includes(ids[0]));
  await storage.toggleComplete('test'); assert.equal(status.getItemStatus(await storage.getItemById('test')), 'Done');
  await assert.rejects(storage.updateItem({ ...item, completed: false }));
  assert.equal(status.getItemStatus({ ...item, completed: false, status: 'Done' }), 'Done');
  assert.equal((await service.scheduleItemNotifications({ ...item, completed: true })).length, 0);
  for (const [index, note] of [undefined, '   ', '  Finished  '].entries()) {
    const id = 'note-' + index;
    await storage.saveItem({ ...item, id, notificationIds: ['note-alert-' + index] });
    const saved = await storage.toggleComplete(id, note);
    assert.equal(saved.completionNote, note?.trim() || undefined);
    assert.equal(saved.completed, true); assert.equal(saved.actionResolved, true); assert.equal(saved.status, 'Done');
    assert.equal(saved.notificationIds.length, 0); assert.ok(h.cancelled.includes('note-alert-' + index));
    assert.ok(Number.isFinite(Date.parse(saved.updatedAt)));
    await storage.toggleComplete(id, 'Do not replace');
    assert.equal((await storage.getItemById(id)).completionNote, note?.trim() || undefined);
    await storage.deleteItem(id);
  }
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
    assert.equal(updated.notificationIds.length, 3);
    assert.equal((await storage.getItems()).length, count);
    assert.equal((await storage.getItemById(updated.id)).notificationIds[0], updated.notificationIds[0]);
    assert.equal(h.scheduled.at(-3).trigger.date.getTime(), now + 3000000);
    await storage.toggleComplete(updated.id);
    await assert.rejects(storage.rescheduleItem(updated), /cannot be rescheduled/);
  }
  const sorting = h.load('utils/itemSorting.ts');
  const late = { ...item, id: 'late', startAt: new Date(now - 60000).toISOString() };
  assert.equal(sorting.isActionRequired(late), true, 'Old items without actionResolved remain eligible');
  for (const type of ['event', 'birthday']) assert.equal(sorting.isActionRequired({ ...late, type }), false);
  assert.equal(sorting.isActionRequired({ ...late, completed: true }), false);
  assert.equal(sorting.isActionRequired({ ...late, actionResolved: true }), false);
  for (const type of ['reminder', 'task']) {
    const skipped = { ...late, id: 'skip-' + type, type };
    await storage.saveItem(skipped);
    await storage.resolveItemAction(skipped.id);
    const saved = await h.reloadStorage().getItemById(skipped.id);
    assert.equal(saved.completed, false);
    assert.equal(status.getItemStatus(saved), type === 'task' ? 'Overdue' : 'Missed');
    assert.equal(saved.actionResolved, true);
    assert.equal(sorting.isActionRequired(saved), false);
    const done = { ...skipped, id: 'done-' + type };
    await storage.saveItem(done);
    await storage.toggleComplete(done.id);
    assert.equal(status.getItemStatus(await storage.getItemById(done.id)), 'Done');
  }
  const ordered = sorting.sortItemsByStatus([{ ...item, id: 'done', completed: true }, late, { ...item, id: 'pending' }]);
  assert.equal(ordered.map(value => value.id).join(','), 'pending,late,done');
  const write = h.filesystem.File.prototype.write;
  await storage.saveItem(late);
  for (const action of [() => storage.toggleComplete(late.id), () => storage.resolveItemAction(late.id), () => storage.deleteItem(late.id)]) {
    h.filesystem.File.prototype.write = () => { throw new Error('disk full'); };
    await assert.rejects(action(), /disk full/);
    h.filesystem.File.prototype.write = write;
    assert.equal(sorting.isActionRequired(await storage.getItemById(late.id)), true);
  }
  const schedule = h.notifications.scheduleNotificationAsync;
  h.notifications.scheduleNotificationAsync = async () => { throw new Error('native scheduling failure'); };
  await assert.rejects(storage.rescheduleItem({ ...late, startAt: item.startAt }), /native scheduling failure/);
  h.notifications.scheduleNotificationAsync = schedule;
  assert.equal(sorting.isActionRequired(await storage.getItemById(late.id)), true);
  assert.equal((await storage.getItemById(late.id)).notificationIds.length, 0);
  let writes = 0;
  h.filesystem.File.prototype.write = function(value) { if (++writes === 2) throw new Error('final save failed'); write.call(this, value); };
  await assert.rejects(storage.rescheduleItem({ ...late, startAt: item.startAt }), /final save failed/);
  h.filesystem.File.prototype.write = write;
  assert.equal(sorting.isActionRequired(await storage.getItemById(late.id)), true);
  assert.ok(h.cancelled.includes('id-' + h.scheduled.length), 'Cancel new notification after failed final save');
  await storage.deleteItem(late.id);
  assert.equal(await h.reloadStorage().getItemById(late.id), undefined);
  console.log('PASS: Action Required eligibility, old-data compatibility, Done, Skip, Delete, restart persistence, sorting and injected write/scheduling failures.');
  console.log('PASS: Reschedule preserves ID/count, cancels first, resets stale status, stores new IDs, validates future dates, and rejects Done items.');

  for (const type of ['reminder', 'task', 'event', 'birthday']) {
    const startIndex = h.scheduled.length;
    const burst = await service.scheduleItemNotifications({ ...before, type });
    assert.equal(burst.length, 3);
    assert.equal(h.scheduled[startIndex + 2].trigger.date - h.scheduled[startIndex].trigger.date, 10000);
  }
  for (const repeatCount of [1, 3, 5]) for (const repeatIntervalSeconds of [3, 5, 10]) {
    await service.saveNotificationSettings({ repeatCount, repeatIntervalSeconds, vibration: false });
    assert.equal((await service.getNotificationSettings()).repeatCount, repeatCount);
    const startIndex = h.scheduled.length;
    const burst = await service.scheduleItemNotifications(item);
    assert.equal(burst.length, repeatCount);
    assert.equal(h.scheduled.at(-1).trigger.date - h.scheduled[startIndex].trigger.date, (repeatCount - 1) * repeatIntervalSeconds * 1000);
  }
  h.notifications.channel.sound = 'user-selected';
  await service.resetNotificationSettings();
  assert.equal(h.notifications.channel.sound, 'user-selected');
  await service.saveNotificationSettings({ repeatCount: 999, repeatIntervalSeconds: -1, vibration: 'bad' });
  assert.equal((await service.getNotificationSettings()).repeatCount, 1);
  await service.saveNotificationSettings({ repeatCount: 3, repeatIntervalSeconds: 5, vibration: true });
  assert.equal((await service.getNotificationSettings()).vibration, true);
  for (const repeat of ['none', 'weekdays']) {
    let calls = 0;
    const count = h.scheduled.length;
    h.notifications.scheduleNotificationAsync = async value => {
      if (++calls === 2) throw new Error('partial schedule failure');
      return schedule(value);
    };
    await assert.rejects(service.scheduleItemNotifications({ ...item, repeat }, true), /partial schedule failure/);
    assert.ok(h.cancelled.includes('id-' + (count + 1)));
  }
  let testCalls = 0;
  const testStart = h.scheduled.length;
  h.notifications.scheduleNotificationAsync = async value => {
    if (++testCalls === 1) throw new Error('test failure');
    return schedule(value);
  };
  assert.equal(await service.scheduleTestNotification(), undefined);
  assert.equal(h.scheduled.length, testStart);
  h.notifications.scheduleNotificationAsync = schedule;
  const cancel = h.notifications.cancelScheduledNotificationAsync;
  h.notifications.cancelScheduledNotificationAsync = async id => {
    if (id === 'bad') throw new Error('cancel failure');
    return cancel(id);
  };
  await service.cancelNotifications(['bad', 'good']);
  assert.ok(h.cancelled.includes('good'));
  h.notifications.cancelScheduledNotificationAsync = cancel;
  const responseService = h.load('services/notificationResponse.ts');
  await storage.saveItem({ ...item, id: 'tap', notificationIds: ['tap-one', 'tap-two'] });
  const beforeTap = JSON.stringify(await storage.getItemById('tap'));
  const response = { actionIdentifier: 'default', notification: { date: now, request: { identifier: 'tap-one', content: { data: { itemId: 'tap' } } } } };
  h.notifications.lastResponse = response;
  const tap = await responseService.consumeNotificationResponse(response);
  assert.equal(tap.itemId, 'tap');
  assert.ok(h.cancelled.includes('tap-two'));
  assert.equal(JSON.stringify(await storage.getItemById('tap')), beforeTap);
  assert.equal(h.notifications.lastResponse, null);
  assert.equal(await responseService.consumeNotificationResponse(response), undefined);
  assert.equal(await responseService.consumeNotificationResponse({ ...response, notification: { ...response.notification, request: { ...response.notification.request, content: { data: { itemId: [] } } } } }), undefined);
  for (const repeat of ['daily', 'weekly', 'weekdays', 'monthly', 'yearly']) {
    assert.equal((await service.scheduleItemNotifications({ ...item, repeat }, true)).length, repeat === 'weekdays' ? 5 : 1);
  }
  const originalNext = h.notifications.getNextTriggerDateAsync;
  h.notifications.getNextTriggerDateAsync = async () => now;
  await assert.rejects(service.scheduleItemNotifications({ ...before, repeat: 'daily' }, true), /cannot start/);
  h.notifications.getNextTriggerDateAsync = originalNext;
  assert.throws(() => service.createRecurringTriggers({ ...item, repeat: 'monthly', startAt: new Date(2030, 2, 1, 0, 0).toISOString(), alertBefore: { minutes: 5 } }), /month boundary/);
  console.log('PASS: all item types, all burst settings, settings validation, channel preservation, partial rollback, isolated cancellation failures, response deduplication and status preservation.');
  h.setPermission({ granted: false, canAskAgain: false, status: 'denied' }); assert.equal(await service.prepareNotifications(), false); assert.equal(h.requests(), 0); assert.ok(h.alerts.length);
  h.setPermission({ granted: false, canAskAgain: true, status: 'denied' }); await service.prepareNotifications(); await service.prepareNotifications(); assert.equal(h.requests(), 1);
  console.log('PASS: schedule dates/offsets, single ten-second DATE trigger, channel/handler/content, native persistence reload, read-only guards, cancellation, denied permission and prompt throttling (mocked native APIs).');
})().catch((error) => { console.error(error); process.exitCode = 1; });
