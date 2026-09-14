/* global __dirname */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../services/notificationHistory.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
async function check(os) {
  let raw = null, fail = false;
  const save = value => { if (fail) throw Error('Disk full'); raw = value; };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, Date, console,
    localStorage: { getItem: () => raw, setItem: (_, value) => save(value) },
    require: id => {
      if (id === 'react-native') return { Platform: { OS: os } };
      if (id === 'expo-file-system') return { Paths: { document: '/mock' }, File: class {
        get exists() { return raw !== null; } async text() { return raw; } write(value) { save(value); }
      } };
      throw Error('Unexpected dependency: ' + id);
    },
  });
  const h = module.exports;
  const now = Date.now() - 1000000;
  const alert = (index, id = 'recurring-request') => ({ date: (now + index * 1000) / (os === 'ios' ? 1000 : 1), request: { identifier: id, content: { title: 'Original title', body: 'Original body', data: { itemId: 'item-1', itemType: 'reminder' } } } });
  let changes = 0;
  const unsubscribe = h.subscribeNotificationHistory(() => changes++);
  await Promise.all([h.recordNotification(alert(0)), h.recordNotification(alert(0), true), h.recordNotification(alert(1))]);
  let entries = await h.getNotificationHistory();
  assert.equal(entries.length, 2);
  assert.equal(entries[0].firedAt, new Date(now + 1000).toISOString());
  assert.equal(entries[1].read, true);
  await h.markNotificationRead(entries[0].id);
  assert.ok((await h.getNotificationHistory()).every(e => e.read));
  await Promise.all(Array.from({ length: 220 }, (_, index) => h.recordNotification(alert(index + 2))));
  entries = await h.getNotificationHistory();
  assert.equal(entries.length, 200);
  assert.ok(entries.every((entry, index) => !index || Date.parse(entries[index - 1].firedAt) >= Date.parse(entry.firedAt)));
  fail = true;
  await assert.rejects(h.markNotificationRead(entries[0].id));
  fail = false;
  await h.markNotificationRead(entries[0].id);
  assert.equal((await h.getNotificationHistory())[0].read, true);
  await h.clearNotificationHistory();
  await h.recordNotification(alert(221));
  assert.equal((await h.getNotificationHistory()).length, 0);
  const future = alert(2000);
  await h.recordNotification(future);
  assert.equal((await h.getNotificationHistory()).length, 1);
  const invalid = alert(2001); invalid.request.content.data.itemType = 'unknown';
  await h.recordNotification(invalid);
  assert.equal((await h.getNotificationHistory()).length, 1);
  assert.ok(changes > 0);
  unsubscribe();
  const previous = changes;
  await h.clearNotificationHistory();
  assert.equal(changes, previous);
  console.log(os + ': passed persistence, concurrent dedupe, recurrence, timestamps, read state, cap, failure recovery, clear replay suppression and subscriptions');
}
(async () => { for (const os of ['web', 'android', 'ios']) await check(os); })().catch(error => { console.error(error); process.exitCode = 1; });
