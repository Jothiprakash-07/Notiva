import test from "node:test";
import assert from "node:assert/strict";
import Item from "../models/Item.js";
import DeletedItem from "../models/DeletedItem.js";
import { cleanupDeletedItems, DAY_MS, retentionMilliseconds } from "../services/deletedItemCleanup.js";
import { startCleanupScheduler } from "../services/cleanupScheduler.js";
import { prepareDeletedItemIndexes } from "../services/itemIndexes.js";

const now = new Date("2026-10-08T00:00:00Z");
const cutoff = now.getTime() - 15 * DAY_MS;
const row = (id, deletedAt = new Date(cutoff - 1), owner = "507f1f77bcf86cd799439011") => ({
  _id: id, ownerUserId: owner, clientItemId: "same-client", type: "task", deletedAt,
  revision: 2, serverUpdatedAt: new Date(cutoff), title: "Private", description: "Sensitive",
  repeat: "daily", dailySeries: { history: "secret" }, notificationIds: ["alarm"], completionNote: "secret",
});
function fixture(rows) {
  const archives = new Map();
  const state = { rows, archives, auditFail: false, deleteFail: false, mutate: null, queries: [] };
  const itemModel = {
    find(query) {
      state.queries.push(query);
      let limit, fields;
      const chain = { select(value) { fields = value.split(" "); return chain; },
        sort(value) { assert.deepEqual(value, { _id: 1 }); return chain; },
        limit(value) { limit = value; return chain; },
        async lean() {
          assert.equal(query.deletedAt.$type, "date");
          return rows.filter(r => r.deletedAt instanceof Date && r.deletedAt <= query.deletedAt.$lte &&
            (!query._id || r._id > query._id.$gt)).sort((a, b) => a._id - b._id).slice(0, limit)
            .map(r => Object.fromEntries(fields.map(key => [key, r[key]])));
        } };
      return chain;
    },
    async deleteOne(query) {
      if (state.deleteFail) throw Error("delete failure");
      state.mutate?.(rows.find(r => r._id === query._id));
      const index = rows.findIndex(r => Object.entries(query).every(([key, value]) => String(r[key]) === String(value)));
      if (index >= 0) rows.splice(index, 1);
      return { acknowledged: true, deletedCount: index >= 0 ? 1 : 0 };
    },
  };
  const archiveModel = { async updateOne(identity, update, options) {
    if (state.auditFail) throw Error("audit failure");
    assert.equal(options.upsert, true); assert.equal(options.runValidators, true);
    assert.deepEqual(options.writeConcern, { w: "majority" });
    const key = JSON.stringify(identity);
    const exists = archives.has(key);
    if (!exists) archives.set(key, structuredClone(update.$setOnInsert));
    return { acknowledged: true, upsertedCount: exists ? 0 : 1 };
  } };
  state.run = options => cleanupDeletedItems({ now, itemModel, archiveModel, ...options });
  return state;
}

test("active, missing deletion and younger rows survive; exact boundary and older rows purge in batches", async () => {
  const h = fixture([row(1, null), row(2, undefined), row(3, new Date(cutoff + 1)), row(4, new Date(cutoff)), row(5)]);
  h.rows[1].deletedAt = undefined;
  assert.deepEqual(await h.run({ batchSize: 1 }), { found: 2, archived: 2, hardDeleted: 2, failed: 0 });
  assert.deepEqual(h.rows.map(r => r._id), [1, 2, 3]);
  assert.equal(h.queries.length, 3);
  assert.deepEqual(await h.run(), { found: 0, archived: 0, hardDeleted: 0, failed: 0 });
});

test("minimal metadata only, recurring payload omitted, different owners and deletion lifecycles isolated", async () => {
  const h = fixture([row(1), row(2, new Date(cutoff - 1), "507f1f77bcf86cd799439012"), row(3, new Date(cutoff - 2))]);
  assert.equal((await h.run()).hardDeleted, 3);
  assert.equal(h.archives.size, 3);
  for (const audit of h.archives.values()) {
    assert.deepEqual(Object.keys(audit).sort(), ["ownerUserId", "clientItemId", "type", "deletedAt", "hardDeletedAt", "reason"].sort());
    assert.equal(audit.reason, "user_deleted"); assert.deepEqual(audit.hardDeletedAt, now);
    await new DeletedItem(audit).validate();
  }
  assert.equal(DeletedItem.schema.options.autoIndex, false);
  assert.equal(DeletedItem.collection.collectionName, "deleted_items");
  assert.equal(Item.schema.options.autoIndex, false);
});

test("audit failure preserves original and future run retries", async () => {
  const h = fixture([row(1)]); h.auditFail = true;
  assert.deepEqual(await h.run(), { found: 1, archived: 0, hardDeleted: 0, failed: 1 });
  assert.equal(h.rows.length, 1); assert.equal(h.archives.size, 0);
  h.auditFail = false; assert.equal((await h.run()).hardDeleted, 1);
});

test("delete failure retries without duplicate audit or changing original archive time", async () => {
  const h = fixture([row(1)]); h.deleteFail = true;
  assert.deepEqual(await h.run(), { found: 1, archived: 1, hardDeleted: 0, failed: 1 });
  assert.equal(h.rows.length, 1); h.deleteFail = false;
  assert.deepEqual(await h.run(), { found: 1, archived: 0, hardDeleted: 1, failed: 0 });
  assert.equal(h.archives.size, 1);
  assert.deepEqual([...h.archives.values()][0].hardDeletedAt, now);
  assert.equal((await h.run()).found, 0);
});

for (const mutation of [r => { r.deletedAt = null; }, r => { r.deletedAt = new Date(); },
  r => { r.revision++; }, r => { r.serverUpdatedAt = now; }]) {
  test("conditional deletion preserves concurrently restored/changed item", async () => {
    const h = fixture([row(1)]); h.mutate = mutation;
    assert.equal((await h.run()).hardDeleted, 0); assert.equal(h.rows.length, 1);
  });
}

test("default/configured retention and invalid configuration", async () => {
  assert.equal(retentionMilliseconds({}), 15 * DAY_MS);
  assert.equal(retentionMilliseconds({ ITEM_DELETE_RETENTION_DAYS: "20" }), 20 * DAY_MS);
  for (const value of ["0", "-1", "", "abc", "Infinity"]) {
    assert.throws(() => retentionMilliseconds({ ITEM_DELETE_RETENTION_DAYS: value }));
  }
  await assert.rejects(cleanupDeletedItems({ batchSize: 0 }));
});

test("explicit archive index initialization preserves unique lifecycle index", async () => {
  const original = DeletedItem.collection.createIndex;
  const indexes = [];
  try {
    DeletedItem.collection.createIndex = async (keys, options) => indexes.push([keys, options]);
    await prepareDeletedItemIndexes();
  } finally { DeletedItem.collection.createIndex = original; }
  assert.deepEqual(indexes[0][0], { ownerUserId: 1, clientItemId: 1, deletedAt: 1 });
  assert.equal(indexes[0][1].unique, true);
  assert.ok(Item.schema.indexes().some(([keys]) => keys.deletedAt === 1));
});

test("scheduler runs at startup, waits for completion, runs daily and can stop", async () => {
  let resolve, callback, timerCount = 0, calls = 0, cleared = false;
  const logs = [];
  const scheduler = startCleanupScheduler({ cleanup: async () => { calls++; if (calls === 1) await new Promise(r => { resolve = r; }); return { found: 0 }; },
    logger: { info: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    setTimer(fn, ms) { assert.equal(ms, DAY_MS); callback = fn; timerCount++; return { unref() {} }; },
    clearTimer() { cleared = true; }, retentionMs: 15 * DAY_MS });
  assert.equal(calls, 1); assert.equal(timerCount, 0);
  resolve(); await scheduler.startup; assert.equal(timerCount, 1);
  await callback(); assert.equal(calls, 2);
  scheduler.stop(); assert.equal(cleared, true); assert.equal(logs.length, 2);
});

test("scheduler safely logs failures and schedules retry", async () => {
  const logs = []; let scheduled = false;
  const scheduler = startCleanupScheduler({ cleanup: async () => { throw Error("private payload"); },
    logger: { info() {}, error: value => logs.push(value) }, retentionMs: DAY_MS,
    setTimer() { scheduled = true; return { unref() {} }; } });
  await scheduler.startup; scheduler.stop();
  assert.equal(scheduled, true); assert.ok(!logs.join().includes("private"));
});
