import Item from "../models/Item.js";
import DeletedItem from "../models/DeletedItem.js";

export async function readItemDeletions(ownerUserId, since, { itemModel = Item, archiveModel = DeletedItem } = {}) {
  const query = { ownerUserId, deletedAt: { $type: "date", ...(since ? { $gt: since } : {}) } };
  // Read source first, archive second: cleanup archives before removing source,
  // so movement between collections cannot leave a hole in this read.
  const soft = await itemModel.find(query).select("clientItemId deletedAt revision -_id").lean();
  const archived = await archiveModel.find(query).select("clientItemId deletedAt -_id").lean();
  const byId = new Map();
  for (const row of [...soft, ...archived]) {
    const previous = byId.get(row.clientItemId);
    if (!previous || row.deletedAt > previous.deletedAt) {
      byId.set(row.clientItemId, { clientItemId: row.clientItemId, deletedAt: row.deletedAt,
        ...(Number.isSafeInteger(row.revision) ? { revision: row.revision } : {}) });
    }
  }
  const deletions = [...byId.values()].sort((a, b) => a.deletedAt - b.deletedAt || a.clientItemId.localeCompare(b.clientItemId));
  // Advance only through actual delivered evidence. Replay the boundary
  // millisecond on the next request so simultaneous deletions are not lost.
  const latest = deletions.at(-1)?.deletedAt;
  const cursor = latest ? new Date(Math.max(since?.getTime() ?? 0, latest.getTime() - 1)).toISOString()
    : since?.toISOString() ?? null;
  return { deletions, cursor };
}
