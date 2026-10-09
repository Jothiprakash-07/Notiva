import assert from "node:assert/strict";
import mongoose from "mongoose";
import Item from "../models/Item.js";
import DeletedItem from "../models/DeletedItem.js";
import { prepareItemIndexes, prepareDeletedItemIndexes } from "../services/itemIndexes.js";
import { cleanupDeletedItems, DAY_MS } from "../services/deletedItemCleanup.js";
import { readItemDeletions } from "../services/itemDeletions.js";

const dbName = `notiva_deletion_feed_test_${Date.now()}_${process.pid}`;
const owner = new mongoose.Types.ObjectId(), other = new mongoose.Types.ObjectId();
try {
  await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 3000, autoIndex: false });
  await prepareItemIndexes(); await prepareDeletedItemIndexes();
  const now = new Date();
  const payload = (clientItemId, ownerUserId = owner) => ({ ownerUserId, clientItemId, type: "reminder",
    title: "TEST ONLY", description: "PRIVATE TEST", repeat: "none", startAt: now.toISOString(),
    notificationIds: [], createdAt: now.toISOString(), updatedAt: now.toISOString() });
  const active = await Item.create(payload("active"));
  const deleted = await Item.create(payload("deleted"));
  await Item.create({ ...payload("other", other), deletedAt: now });
  const expiredAt = new Date(now.getTime() - 16 * DAY_MS);
  await Item.updateOne({ _id: deleted._id }, { $set: { deletedAt: expiredAt }, $inc: { revision: 1 } });
  const before = await readItemDeletions(owner);
  assert.deepEqual(before.deletions.map(row => row.clientItemId), ["deleted"]);
  assert.equal(before.deletions[0].revision, 2);
  assert.equal((await cleanupDeletedItems({ now })).hardDeleted, 1);
  const after = await readItemDeletions(owner);
  assert.equal(after.deletions.length, 1); assert.equal(after.deletions[0].clientItemId, "deleted");
  assert.deepEqual(after.deletions[0].deletedAt, expiredAt);
  assert.equal((await readItemDeletions(owner, expiredAt)).deletions.length, 0);
  assert.equal((await readItemDeletions(owner, new Date(expiredAt.getTime() - 1))).deletions.length, 1);
  assert.ok(await Item.exists({ _id: active._id, deletedAt: null }));
  assert.equal(await DeletedItem.countDocuments({ ownerUserId: owner }), 1);
  console.log("PASS local MongoDB: owner isolation, active exclusion, soft feed, cleanup, archive feed and incremental boundary");
} finally {
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) {
    await Item.deleteMany({ ownerUserId: { $in: [owner, other] } });
    await DeletedItem.deleteMany({ ownerUserId: { $in: [owner, other] } });
  }
  await mongoose.disconnect();
}
