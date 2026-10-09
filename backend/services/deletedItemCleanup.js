import Item from "../models/Item.js";
import DeletedItem from "../models/DeletedItem.js";

export const DAY_MS = 24 * 60 * 60 * 1000;
export function retentionMilliseconds(env = process.env) {
  const days = Number(env.ITEM_DELETE_RETENTION_DAYS ?? 15);
  if (!Number.isFinite(days) || days <= 0 || !Number.isSafeInteger(days * DAY_MS)) {
    throw new Error("Invalid ITEM_DELETE_RETENTION_DAYS configuration.");
  }
  return days * DAY_MS;
}

export async function cleanupDeletedItems({ now = new Date(), retentionMs = retentionMilliseconds(),
  batchSize = 100, itemModel = Item, archiveModel = DeletedItem } = {}) {
  if (!Number.isFinite(now.getTime()) || !Number.isSafeInteger(retentionMs) || retentionMs <= 0 ||
      !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error("Invalid item cleanup configuration.");
  }
  const cutoff = new Date(now.getTime() - retentionMs);
  const stats = { found: 0, archived: 0, hardDeleted: 0, failed: 0 };
  let lastId;
  // Keyset batches: failed rows are retried next run, not in a tight loop.
  for (;;) {
    const rows = await itemModel.find({ deletedAt: { $type: "date", $lte: cutoff },
      ...(lastId ? { _id: { $gt: lastId } } : {}) })
      .select("_id ownerUserId clientItemId type deletedAt revision serverUpdatedAt")
      .sort({ _id: 1 }).limit(batchSize).lean();
    if (!rows.length) break;
    for (const row of rows) {
      stats.found++;
      try {
        const identity = { ownerUserId: row.ownerUserId, clientItemId: row.clientItemId, deletedAt: row.deletedAt };
        const result = await archiveModel.updateOne(identity, { $setOnInsert: {
          ...identity, type: row.type, hardDeletedAt: now, reason: "user_deleted",
        } }, { upsert: true, runValidators: true, writeConcern: { w: "majority" } });
        if (!result.acknowledged) throw new Error("Archive write not acknowledged.");
        stats.archived += result.upsertedCount ?? 0;
        const removed = await itemModel.deleteOne({ _id: row._id, deletedAt: row.deletedAt,
          revision: row.revision, serverUpdatedAt: row.serverUpdatedAt }, { writeConcern: { w: "majority" } });
        if (!removed.acknowledged) throw new Error("Item deletion not acknowledged.");
        stats.hardDeleted += removed.deletedCount;
      } catch {
        // Never expose payloads or database errors in operational logs.
        stats.failed++;
      }
    }
    lastId = rows.at(-1)._id;
  }
  return stats;
}
