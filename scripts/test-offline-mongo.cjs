/* global __dirname */
// Isolated real MongoDB + HTTP validation. Never reads backend/.env or existing databases.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const { fixture } = require('./test-item-sync.cjs');
const { makeItem } = require('./test-native-alarms.cjs');
const root = path.resolve(__dirname, '..');
const load = relative => import(pathToFileURL(path.join(root, relative)).href);
let now = new Date(2026, 9, 21, 9).getTime();
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
async function run() {
  const binary = process.env.NOTIVA_TEST_MONGOD || 'C:\\Program Files\\MongoDB\\Server\\8.0\\bin\\mongod.exe';
  assert.ok(fs.existsSync(binary), 'A local mongod executable is required');
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'notiva-offline-mongo-'));
  const reserve = net.createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
  const child = spawn(binary, ['--dbpath', temporary, '--bind_ip', '127.0.0.1', '--port', String(port), '--quiet'], { windowsHide: true, stdio: 'ignore' });
  let launchError; child.on('error', error => { launchError = error; });
  const { default: mongoose } = await load('backend/node_modules/mongoose/index.js');
  let server;
  try {
    let connected = false;
    for (let n = 0; n < 15; n++) {
      if (launchError) throw launchError;
      try { await mongoose.connect(`mongodb://127.0.0.1:${port}/notiva_offline_validation`, { serverSelectionTimeoutMS: 1000 }); connected = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(connected, 'Isolated MongoDB failed to start');
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
    const { default: express } = await load('backend/node_modules/express/index.js');
    const { default: jwt } = await load('backend/node_modules/jsonwebtoken/index.js');
    const { default: User } = await load('backend/models/user.js');
    const { default: Item } = await load('backend/models/Item.js');
    const { default: routes, itemRequestError } = await load('backend/routes/itemRoutes.js');
    const { prepareItemIndexes, prepareDeletedItemIndexes } = await load('backend/services/itemIndexes.js');
    await prepareItemIndexes(); await prepareDeletedItemIndexes();
    const user = await User.create({ fullName: 'Disposable offline validation', mobileNumber: '0000000000', password: 'disposable-test-only' });
    const owner = String(user._id);
    const token = jwt.sign({ userId: owner, tokenVersion: 0 }, process.env.JWT_SECRET);
    const app = express(); app.use(express.json()); app.use('/api/items', routes); app.use(itemRequestError);
    server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const origin = `http://127.0.0.1:${server.address().port}`;
    const h = fixture('android', Clock, (url, init) => fetch(origin + new URL(url).pathname + new URL(url).search, init));
    h.select(owner, token);
    const snapshot = () => h.queue().readItemSyncState(owner);
    const seeds = [];
    for (const [type, count] of [['reminder', 5], ['task', 5], ['event', 3], ['birthday', 2]])
      for (let n = 0; n < count; n++) seeds.push({ id: `${type}-${n}`, type });
    seeds.push({ id: 'daily', repeat: 'daily' }, { id: 'weekly', repeat: 'weekly', weeklyDays: [3] });
    for (const row of seeds) await h.storage().saveItem(makeItem({ startAt: new Clock(now + 3600000).toISOString(), createdAt: new Clock().toISOString(), updatedAt: new Clock().toISOString(), ...row }));
    await h.storage().getItems(); assert.equal((await snapshot()).queue.length, 17);
    h.restart(); h.select(owner, token); h.online(true); await h.sync().syncItems();
    assert.equal((await snapshot()).queue.length, 0);
    let docs = await Item.find({ ownerUserId: owner }).lean(); assert.equal(docs.length, 17);
    assert.equal(new Set(docs.map(row => row.clientItemId)).size, 17);
    assert.ok(docs.every(row => row.revision === 1)); assert.equal(h.alarms.size, 17);
    h.online(false);
    for (let n = 0; n < 10; n++) await h.storage().updateItem({ ...(await h.storage().getItemById('task-0')), title: `Latest ${n}` });
    for (const id of ['reminder-0', 'event-0', 'birthday-0']) await h.storage().deleteItem(id);
    h.restart(); h.select(owner, token); h.online(true); await h.sync().syncItems();
    let local = await snapshot(); assert.equal(local.queue.length, 0); assert.equal(local.items.length, 14);
    docs = await Item.find({ ownerUserId: owner }).lean();
    const active = docs.filter(row => !row.deletedAt);
    assert.equal(active.length, 14); assert.equal(docs.length, 17);
    for (const row of local.items) {
      const remote = active.find(document => document.clientItemId === row.id);
      assert.ok(remote); assert.equal(remote.revision, row.serverRevision); assert.equal(remote.title, row.title);
    }
    assert.equal(active.find(row => row.clientItemId === 'task-0').revision, 2);
    assert.equal(active.find(row => row.clientItemId === 'task-0').title, 'Latest 9');
    assert.equal(active.filter(row => row.dailySeries).length, 2); assert.equal(h.alarms.size, 14);
    const ids = [...h.alarms.keys()].sort();
    await Promise.all([h.sync().syncItems(), h.sync().syncItems(), h.sync().syncItems()]);
    assert.deepEqual([...h.alarms.keys()].sort(), ids); assert.equal(await Item.countDocuments({ ownerUserId: owner }), 17);

    // Real POST commit followed by a lost response and local deletion.
    h.online(false); await h.storage().saveItem(makeItem({ id: 'uncertain', startAt: new Clock(now + 3600000).toISOString(), createdAt: new Clock().toISOString(), updatedAt: new Clock().toISOString() }));
    let deleted = false;
    h.injectFault(call => {
      if (call.phase === 'after' && call.method === 'POST' && call.status === 201 && !deleted) {
        deleted = true; throw Error('lost acknowledgement');
      }
    });
    h.online(true); await h.sync().syncItems(); h.online(false);
    await h.storage().deleteItem('uncertain');
    h.injectFault(undefined); h.restart(); h.select(owner, token); now += 600000; h.online(true); await h.sync().syncItems();
    local = await snapshot(); assert.equal(local.queue.length, 0);
    assert.ok((await Item.findOne({ ownerUserId: owner, clientItemId: 'uncertain' }).lean()).deletedAt);
    assert.equal(await Item.countDocuments({ ownerUserId: owner, deletedAt: null }), 14);
    assert.equal(h.alarms.size, 14);
    console.log('PASS real MongoDB/HTTP: 17 unique offline creates; 10 edits -> revision 2; three deletes; 14 active local/DB items and alarms; two masters; concurrent reconnect idempotency; uncertain-create/delete recovery');
  } finally {
    if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
    await mongoose.disconnect();
    if (child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; }
    // Only remove the exact disposable directory created by this invocation.
    const resolved = path.resolve(temporary);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.match(path.basename(resolved), /^notiva-offline-mongo-/);
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
