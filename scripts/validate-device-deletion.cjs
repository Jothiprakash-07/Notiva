// Manual, opt-in validation against a connected debuggable Android app.
// Only the specially named test item created by this script may be deleted.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const adb = path.join(process.env.LOCALAPPDATA, 'Android/Sdk/platform-tools/adb.exe');
const pkg = 'com.anonymous.Reminder54';
const markerPath = path.join(root, 'scripts/.device-deletion-validation.json');
const command = (...args) => execFileSync(adb, args, { encoding: 'utf8', windowsHide: true }).trim();
const mode = process.argv[2];
async function run() {
  if (mode === 'actions-check') {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    const state = JSON.parse(command('shell', 'run-as', pkg, 'cat', `files/notiva.item.sync.queue.v1:${marker.owner}.json`));
    const alarms = command('shell', 'run-as', pkg, 'cat', 'shared_prefs/notiva.native.alarms.v1.xml');
    for (const record of marker.items) {
      const item = state.items.find(row => row.id === record.id);
      console.log(JSON.stringify({ title: record.title, present: !!item, status: item?.status,
        completed: item?.completed, completedAt: item?.completedAt, completionNote: item?.completionNote,
        syncStatus: item?.syncStatus, nativeSchedule: alarms.includes(`name="schedule:native-alarm:notiva-account[${marker.owner}]::${record.id}"`),
        deletionSynced: state.tombstones[record.id]?.synced }));
    }
    return;
  }
  if (mode === 'check') {
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    const raw = command('shell', 'run-as', pkg, 'cat', `files/notiva.item.sync.queue.v1:${marker.owner}.json`);
    const state = JSON.parse(raw);
    const alarms = command('shell', 'run-as', pkg, 'cat', 'shared_prefs/notiva.native.alarms.v1.xml');
    const item = state.items.find(row => row.id === marker.id);
    console.log(JSON.stringify({ testItemPresent: Boolean(item), syncStatus: item?.syncStatus,
      serverRevision: item?.serverRevision, testAlarmPresent: alarms.includes(marker.id),
      testTombstoneSynced: state.tombstones[marker.id]?.synced ?? false,
      deletionCursorPersisted: Boolean(state.deletionCursor), pendingAlarmCancellations: state.pendingDeletionCancellations?.length ?? 0 }));
    return;
  }
  const { default: dotenv } = await import('../backend/node_modules/dotenv/lib/main.js');
  dotenv.config({ path: path.join(root, 'backend/.env'), quiet: true });
  const { default: mongoose } = await import('../backend/node_modules/mongoose/index.js');
  const { default: jwt } = await import('../backend/node_modules/jsonwebtoken/index.js');
  const { default: User } = await import('../backend/models/user.js');
  const { default: Item } = await import('../backend/models/Item.js');
  let marker;
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 3000 });
    if (mode === 'prepare' || mode === 'actions-prepare') {
      assert.ok(!fs.existsSync(markerPath), 'Existing validation marker: finish that test first.');
      const names = command('shell', 'run-as', pkg, 'ls', 'files');
      const owners = [...names.matchAll(/^notiva\.item\.sync\.queue\.v1:([a-f0-9]{24})\.json$/gm)].map(match => match[1]);
      assert.equal(owners.length, 1, 'Choose the active owner explicitly if multiple namespaces exist.');
      marker = { owner: owners[0], id: `cross-device-validation-${Date.now()}`, title: 'Deletion Feed Validation TEST' };
    } else {
      assert.ok(['delete', 'actions-delete'].includes(mode));
      marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    }
    const user = await User.findById(marker.owner).select('_id tokenVersion');
    assert.ok(user);
    const token = jwt.sign({ userId: String(user._id), tokenVersion: user.tokenVersion ?? 0 }, process.env.JWT_SECRET, { expiresIn: '5m' });
    const base = 'http://192.168.43.159:5000/api/items';
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    if (mode === 'actions-prepare') {
      marker.items = [];
      fs.writeFileSync(markerPath, JSON.stringify(marker));
      const at = new Date(Date.now() + 3600000).toISOString();
      for (const [index, type] of ['reminder', 'task', 'event', 'reminder', 'task'].entries()) {
        const record = { id: `cross-device-validation-action-${Date.now()}-${index}`,
          title: `${index < 3 ? 'GroupAction' : 'SoloAction'}_${type}_TEST`, type };
        const now = new Date().toISOString();
        const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify({
          clientItemId: record.id, type, title: record.title, description: 'Temporary shared alarm action validation',
          repeat: 'none', startAt: at, ...(type === 'event' ? { endAt: new Date(Date.parse(at) + 3600000).toISOString() } : {}),
          notificationIds: [], createdAt: now, updatedAt: now,
        }) });
        assert.equal(response.status, 201);
        marker.items.push(record); fs.writeFileSync(markerPath, JSON.stringify(marker));
      }
      console.log('PASS five separate authenticated validation records created'); return;
    }
    if (mode === 'actions-delete') {
      assert.ok(Array.isArray(marker.items));
      for (const record of marker.items) {
        assert.ok(record.id.startsWith('cross-device-validation-action-'));
        const item = await Item.findOne({ ownerUserId: marker.owner, clientItemId: record.id });
        assert.equal(item.title, record.title);
        assert.ok(/^(GroupAction|SoloAction)_/.test(item.title));
        const response = await fetch(`${base}/${encodeURIComponent(record.id)}`, { method: 'DELETE', headers });
        assert.equal(response.status, 200);
      }
      console.log('PASS only five validation records soft-deleted'); return;
    }
    if (mode === 'prepare') {
      const feed = await fetch(`${base}/deletions`, { headers }); assert.equal(feed.status, 200, 'Backend must expose new feed');
      const now = new Date().toISOString();
      const response = await fetch(base, { method: 'POST', headers, body: JSON.stringify({
        clientItemId: marker.id, type: 'reminder', title: marker.title, description: 'Temporary validation record',
        repeat: 'none', startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), notificationIds: [], createdAt: now, updatedAt: now,
      }) });
      assert.equal(response.status, 201);
      fs.writeFileSync(markerPath, JSON.stringify(marker));
      assert.ok(await Item.exists({ ownerUserId: marker.owner, clientItemId: marker.id, deletedAt: null }));
      console.log('PASS authenticated second-session test item created and confirmed in MongoDB');
    } else {
      const item = await Item.findOne({ ownerUserId: marker.owner, clientItemId: marker.id });
      assert.ok(item); assert.equal(item.title, marker.title); assert.ok(marker.id.startsWith('cross-device-validation-'));
      const response = await fetch(`${base}/${encodeURIComponent(marker.id)}`, { method: 'DELETE', headers });
      assert.equal(response.status, 200);
      const updated = await Item.findById(item._id); assert.ok(updated.deletedAt);
      const feed = await fetch(`${base}/deletions`, { headers });
      assert.ok((await feed.json()).deletions.some(row => row.clientItemId === marker.id));
      console.log('PASS second-session DELETE soft-deleted only validation item; authenticated feed contains its identity');
    }
  } finally { await mongoose.disconnect(); }
}
run().catch(error => { console.error(error.name, error.message); process.exitCode = 1; });
