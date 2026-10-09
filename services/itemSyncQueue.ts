import { Platform } from "react-native";
import type { ReminderItem } from "../types/item";

export type SyncOperation = {
  operationId: string; clientItemId: string; type: "create" | "update" | "delete";
  queuedAt: string; attemptCount: number; attempted?: boolean; error?: string; retryAt?: number;
  payload?: Record<string, unknown>;
};
export type ServerItemDeletion = { clientItemId: string; deletedAt: string; revision?: number };
export type ItemSyncState = { version: 1; items: ReminderItem[]; queue: SyncOperation[];
  deletionCursor?: string; pendingDeletionCancellations?: string[];
  tombstones: Record<string, { deletedAt: string; synced: boolean; syncStatus?: "pending_delete" | "synced" }> };
const blank = (): ItemSyncState => ({ version: 1, items: [], queue: [], tombstones: {} });
let writes: Promise<unknown> = Promise.resolve();
let sequence = 0;
let wake: (() => void) | undefined;
export function onItemQueueChanged(callback?: () => void) { wake = callback; }
export const itemNamespace = (userId: string) => `notiva.items.v1:${encodeURIComponent(userId)}`;
export const queueNamespace = (userId: string) => `notiva.item.sync.queue.v1:${encodeURIComponent(userId)}`;

async function readKey(key: string): Promise<string | null> {
  if (Platform.OS === "web") return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  const { File, Paths } = await import("expo-file-system");
  const file = new File(Paths.document, `${key}.json`);
  return file.exists ? file.text() : null;
}
async function writeKey(key: string, value: string) {
  if (Platform.OS === "web") { localStorage.setItem(key, value); return; }
  const { File, Paths } = await import("expo-file-system");
  new File(Paths.document, `${key}.json`).write(value);
}
function decodeState(raw: string | null): ItemSyncState | undefined {
  if (!raw) return;
  try {
    const value = JSON.parse(raw);
    if (value.version === 1 && Array.isArray(value.items) && Array.isArray(value.queue) && value.tombstones) return value;
  } catch { /* A previous durable snapshot can recover an interrupted write. */ }
}
async function load(userId: string): Promise<ItemSyncState> {
  const key = queueNamespace(userId);
  const raw = await readKey(key);
  const current = decodeState(raw); if (current) return current;
  const backup = await readKey(`${key}.backup`), recovered = decodeState(backup);
  if (recovered) return recovered;
  if (raw || backup) throw new Error("Local item sync storage needs recovery.");
  const items = await readKey(itemNamespace(userId));
  // Only an already account-scoped array may be imported. Never read legacy
  // device-wide notiva.items.v1 here because its ownership is unknown.
  const state = blank(); state.items = items ? JSON.parse(items) : [];
  return state;
}
async function save(userId: string, state: ItemSyncState) {
  const key = queueNamespace(userId), raw = JSON.stringify(state);
  const previous = await readKey(key);
  // Never replace a valid backup with a partially written primary snapshot.
  if (decodeState(previous)) await writeKey(`${key}.backup`, previous!);
  // One authoritative snapshot commits items + outbox + tombstones together.
  // The familiar item-array key is a repairable mirror, never the authority.
  await writeKey(key, raw);
  try { await writeKey(itemNamespace(userId), JSON.stringify(state.items)); } catch { /* Snapshot already safely committed. */ }
}
export function transactItemState<T>(userId: string, action: (state: ItemSyncState) => T | Promise<T>): Promise<T> {
  const result = writes.then(async () => { const state = await load(userId); const result = await action(state); await save(userId, state); return result; });
  writes = result.catch(() => undefined); return result;
}
export function readItemSyncState(userId: string) {
  return writes.then(() => load(userId));
}
const fields = ["seriesId", "dailySeries", "completedAt", "dailyHidden", "type", "title", "description", "category", "repeat", "weeklyDays", "priority", "startAt", "endAt", "allDay", "location", "notes", "completionNote", "alertBefore", "status", "completed", "actionResolved", "createdAt", "updatedAt"];
export function itemPayload(item: ReminderItem): Record<string, unknown> {
  const value: Record<string, unknown> = { clientItemId: item.id, notificationIds: [] };
  for (const key of fields) {
    const field = item[key as keyof ReminderItem]; if (field !== undefined) value[key] = field;
  }
  if (item.dailySeries) value.dailySeries = { ...item.dailySeries, notificationIds: [], dirty: true };
  return JSON.parse(JSON.stringify(value));
}
function operation(id: string, type: SyncOperation["type"], payload?: Record<string, unknown>): SyncOperation {
  return { operationId: `${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2)}`, clientItemId: id, type, queuedAt: new Date().toISOString(), attemptCount: 0, payload };
}
function queueDeletion(state: ItemSyncState, item: ReminderItem, retainedAnchor = false) {
  if (Object.hasOwn(state.tombstones, item.id)) {
    const tombstone = state.tombstones[item.id];
    tombstone.syncStatus = tombstone.synced ? "synced" : "pending_delete";
    return;
  }
  const pending = state.queue.find(row => row.clientItemId === item.id);
  state.queue = state.queue.filter(row => row.clientItemId !== item.id);
  const neverSent = pending?.type === "create" && !pending.attempted && !item.serverRevision;
  if (neverSent && !retainedAnchor) return;
  Object.defineProperty(state.tombstones, item.id, { value: {
    deletedAt: new Date().toISOString(), synced: Boolean(neverSent), syncStatus: neverSent ? "synced" : "pending_delete",
  }, enumerable: true, configurable: true, writable: true });
  if (!neverSent) state.queue.push(operation(item.id, "delete"));
}
export async function commitLocalItems(userId: string, items: ReminderItem[]) {
  let changed = false;
  await transactItemState(userId, state => {
    const previous = new Map(state.items.map(item => [item.id, item]));
    for (const item of items) {
      // A remote deletion is final. A stale in-flight/local snapshot cannot
      // clear its tombstone or queue an accidental restore.
      if (Object.hasOwn(state.tombstones, item.id) && !(item.dailyHidden && item.dailySeries)) continue;
      const old = previous.get(item.id), payload = itemPayload(item);
      if (old?.serverRevision) { item.serverRevision = old.serverRevision; item.serverUpdatedAt = old.serverUpdatedAt; item.lastSyncedAt = old.lastSyncedAt; }
      // Deleting the original recurring occurrence retains its local template
      // for future dates. Its cloud identity must nevertheless be deleted.
      if (item.dailyHidden && item.dailySeries) {
        if (!Object.hasOwn(state.tombstones, item.id)) changed = true;
        queueDeletion(state, item, true);
        item.syncStatus = state.tombstones[item.id].synced ? "synced" : "pending_delete";
        continue;
      }
      const pending = state.queue.find(row => row.clientItemId === item.id);
      // Alarm handles/dirty retries are local and don't create sync churn.
      if (!old || JSON.stringify(itemPayload(old)) !== JSON.stringify(payload)) {
        changed = true;
        const type = pending?.type === "create" || (!old?.serverRevision && !item.serverRevision) ? "create" : "update";
        const next = operation(item.id, type, payload);
        if (pending?.attempted) next.attempted = true;
        state.queue = state.queue.filter(row => row.clientItemId !== item.id); state.queue.push(next);
        item.syncStatus = type === "create" ? "pending_create" : "pending_update";
      } else {
        item.syncStatus = old.syncStatus; item.serverRevision = old.serverRevision; item.lastSyncedAt = old.lastSyncedAt;
        item.serverUpdatedAt = old.serverUpdatedAt;
      }
      delete state.tombstones[item.id];
    }
    for (const old of state.items) {
      if (items.some(item => item.id === old.id)) continue;
      changed = true;
      queueDeletion(state, old);
    }
    state.items = items.filter(item => !Object.hasOwn(state.tombstones, item.id) || (item.dailyHidden && item.dailySeries));
  });
  if (changed) wake?.();
}

export async function acknowledgeItem(userId: string, op: SyncOperation, revision?: number, serverUpdatedAt?: string) {
  await transactItemState(userId, state => {
    const pending = state.queue.find(row => row.clientItemId === op.clientItemId);
    const item = state.items.find(row => row.id === op.clientItemId);
    if (item && revision) { item.serverRevision = revision; item.serverUpdatedAt = serverUpdatedAt; }
    if (pending?.operationId !== op.operationId) {
      // An edit/delete made during POST must survive the earlier response.
      if (pending?.type === "create" && revision) { pending.type = "update"; if (item) item.syncStatus = "pending_update"; }
      return;
    }
    state.queue = state.queue.filter(row => row.operationId !== op.operationId);
    if (op.type === "delete" && Object.hasOwn(state.tombstones, op.clientItemId)) {
      state.tombstones[op.clientItemId].synced = true;
      state.tombstones[op.clientItemId].syncStatus = "synced";
    }
    if (item) { item.syncStatus = "synced"; item.lastSyncedAt = new Date().toISOString(); }
  });
}
