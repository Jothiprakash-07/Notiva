import type { ReminderItem } from "../types/item";
import { API_BASE_URL } from "./apiConfig";
import { getItemSyncSession, itemSessionGeneration } from "./itemAccount";
import { acknowledgeItem, readItemSyncState, transactItemState } from "./itemSyncQueue";
import { mergeServerItems, applyServerDeletions } from "./itemStorage";
import type { ServerItemDeletion } from "./itemSyncQueue";

class SyncHttpError extends Error { constructor(public status: number) { super("Item synchronization failed."); } }
let running: Promise<void> | undefined;
let rerun = false;
let blockedGeneration: number | undefined;
let deletionFeedGeneration: number | undefined;
export function itemSyncAuthBlocked() { return blockedGeneration === itemSessionGeneration(); }
async function request(token: string, method: string, path: string, body?: unknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/items${path}`, { method, signal: controller.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) throw new SyncHttpError(response.status);
    return await response.json();
  } finally { clearTimeout(timeout); }
}
function restoredItem(value: Record<string, unknown>): ReminderItem {
  // Whitelist public item fields; do not persist arbitrary account/server data.
  const fields = ["seriesId", "dailySeries", "completedAt", "dailyHidden", "type", "title", "description", "category", "repeat", "weeklyDays", "priority", "startAt", "endAt", "allDay", "location", "notes", "completionNote", "alertBefore", "status", "completed", "actionResolved", "createdAt", "updatedAt"];
  return { ...Object.fromEntries(fields.filter(key => value[key] !== undefined).map(key => [key, value[key]])),
    id: String(value.clientItemId), notificationIds: [], serverRevision: Number(value.revision),
    serverUpdatedAt: String(value.serverUpdatedAt) } as unknown as ReminderItem;
}
async function run() {
  const session = getItemSyncSession(), generation = itemSessionGeneration();
  if (!session || blockedGeneration === generation) return;
  const userId = session.user.id, token = session.token;
  const active = () => generation === itemSessionGeneration();
  const snapshot = await readItemSyncState(userId);
  const order = { delete: 0, create: 1, update: 2 };
  for (const op of [...snapshot.queue].sort((a, b) => order[a.type] - order[b.type] || a.queuedAt.localeCompare(b.queuedAt))) {
    if (!active()) return;
    if (op.error || (op.retryAt ?? 0) > Date.now()) continue;
    let claimed = false;
    await transactItemState(userId, state => {
      const current = state.queue.find(row => row.operationId === op.operationId);
      if (current && active()) { current.attempted = true; current.attemptCount++; claimed = true; }
    });
    if (!claimed || !active()) continue;
    try {
      let result;
      const path = `/${encodeURIComponent(op.clientItemId)}`;
      if (op.type === "delete") {
        try { result = await request(token, "DELETE", path); }
        catch (error) { if (!(error instanceof SyncHttpError) || error.status !== 404) throw error; }
      } else if (op.type === "create") {
        try { result = await request(token, "POST", "", op.payload); }
        catch (error) {
          if (!(error instanceof SyncHttpError) || error.status !== 409) throw error;
          const remote = await request(token, "GET", path);
          // A lost POST response may be retried. Only an exact semantic match
          // is safe to acknowledge; otherwise preserve a visible conflict.
          if (!Object.entries(op.payload ?? {}).every(([key, value]) => JSON.stringify(remote.item[key]) === JSON.stringify(value))) throw error;
          result = remote;
        }
      } else {
        const remote = await request(token, "GET", path);
        const local = (await readItemSyncState(userId)).items.find(item => item.id === op.clientItemId);
        if (!active()) return;
        if (local?.serverRevision && remote.item.revision > local.serverRevision) throw new SyncHttpError(409);
        const { clientItemId: _id, createdAt: _created, ...patch } = op.payload ?? {};
        for (const key of ["seriesId", "dailySeries", "completedAt", "dailyHidden", "weeklyDays", "priority", "category", "endAt", "allDay", "location", "notes", "completionNote", "alertBefore", "status", "completed", "actionResolved"]) {
          if (remote.item[key] !== undefined && patch[key] === undefined) patch[key] = null;
        }
        result = await request(token, "PATCH", path, patch);
      }
      // Writing to the original user's namespace is safe even if logout occurs
      // in flight. Never merge a response into the newly selected account.
      await acknowledgeItem(userId, op, result?.item?.revision, result?.item?.serverUpdatedAt);
    } catch (error) {
      if (error instanceof SyncHttpError && [401, 403].includes(error.status)) { blockedGeneration = generation; return; }
      const permanent = error instanceof SyncHttpError && [400, 404, 409, 413].includes(error.status);
      await transactItemState(userId, state => {
        const current = state.queue.find(row => row.operationId === op.operationId);
        if (!current) return;
        current.retryAt = Date.now() + Math.min(300000, 5000 * 2 ** Math.min(current.attemptCount, 6));
        if (permanent) {
          current.error = error instanceof SyncHttpError && error.status === 409 ? "conflict" : "invalid_or_missing_item";
          const item = state.items.find(row => row.id === op.clientItemId); if (item) item.syncStatus = "sync_error";
        }
      });
      if (!permanent) break;
    }
  }
  if (!active()) return;
  try {
    const result = await request(token, "GET", "");
    if (active() && Array.isArray(result.items)) await mergeServerItems(userId, result.items.map(restoredItem), active);
    if (!active() || !Array.isArray(result.items)) return;
    const state = await readItemSyncState(userId);
    const ids = new Set(result.items.map((item: Record<string, unknown>) => item.clientItemId));
    // Full replay after session/restart or whenever a local non-tombstoned ID
    // is absent remotely. This also catches delayed writes older than cursor.
    const missing = state.items.some(item => !Object.hasOwn(state.tombstones, item.id) && !ids.has(item.id));
    const since = deletionFeedGeneration === generation && !missing ? state.deletionCursor : undefined;
    const feed = await request(token, "GET", `/deletions${since ? `?since=${encodeURIComponent(since)}` : ""}`);
    if (!active()) return;
    if (!Array.isArray(feed.deletions) || (feed.cursor !== null &&
        (typeof feed.cursor !== "string" || !Number.isFinite(Date.parse(feed.cursor))))) throw new Error("Invalid deletion feed.");
    const deletions: ServerItemDeletion[] = feed.deletions;
    if (deletions.some(row => typeof row.clientItemId !== "string" || !row.clientItemId ||
        typeof row.deletedAt !== "string" || !Number.isFinite(Date.parse(row.deletedAt)))) throw new Error("Invalid deletion feed.");
    await applyServerDeletions(userId, deletions, feed.cursor, active);
    if (active()) deletionFeedGeneration = generation;
  } catch (error) {
    if (error instanceof SyncHttpError && [401, 403].includes(error.status)) blockedGeneration = generation;
    // Pending operations remain durable; the runtime retries later.
  }
}
export function syncItems(): Promise<void> {
  if (running) { rerun = true; return running; }
  running = (async () => {
    do { rerun = false; await run(); } while (rerun);
  })().finally(() => { running = undefined; });
  return running;
}
