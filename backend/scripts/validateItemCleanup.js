import assert from "node:assert/strict";
import mongoose from "mongoose";
import Item from "../models/Item.js";
import DeletedItem from "../models/DeletedItem.js";
import { prepareItemIndexes, prepareDeletedItemIndexes } from "../services/itemIndexes.js";
import { cleanupDeletedItems, DAY_MS } from "../services/deletedItemCleanup.js";

// Never read application credentials or target the application database.
const dbName = `notiva_cleanup_test_${Date.now()}_${process.pid}`;
const ownerUserId = new mongoose.Types.ObjectId();
try {
  await mongoose.connect(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 3000, autoIndex: false });
  await prepareItemIndexes(); await prepareDeletedItemIndexes();
  const now = new Date();
  const payload = clientItemId => ({ ownerUserId, clientItemId, type: "task", title: "TEST ONLY",
    description: "TEST private content", repeat: "none", startAt: now.toISOString(),
    notificationIds: [], createdAt: now.toISOString(), updatedAt: now.toISOString() });
  const active = await Item.create(payload("test-active"));
  const expired = await Item.create(payload("test-expired"));
  await Item.updateOne({ _id: expired._id }, { $set: { deletedAt: now }, $inc: { revision: 1 } });
  await Item.updateOne({ _id: expired._id }, { $set: { deletedAt: new Date(now.getTime() - 16 * DAY_MS) } });
  assert.deepEqual(await cleanupDeletedItems({ now }), { found: 1, archived: 1, hardDeleted: 1, failed: 0 });
  assert.equal(await Item.exists({ _id: expired._id }), null);
  assert.ok(await Item.exists({ _id: active._id, deletedAt: null }));
  const audits = await DeletedItem.find({ ownerUserId }).lean();
  assert.equal(audits.length, 1);
  assert.deepEqual(Object.keys(audits[0]).sort(), ["_id", "ownerUserId", "clientItemId", "type", "deletedAt", "hardDeletedAt", "reason"].sort());
  assert.equal((await cleanupDeletedItems({ now })).found, 0);
  console.log("PASS isolated local MongoDB: minimal archive, original removed, active preserved, idempotent retry");
} finally {
  if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) {
    await Item.deleteMany({ ownerUserId });
    await DeletedItem.deleteMany({ ownerUserId });
  }
  await mongoose.disconnect();
}
