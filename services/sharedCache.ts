import { Platform } from "react-native";
import type { OrganizationEntry, SharedDraft, SharedEntry, SharedView, SharedOccurrenceAction } from "../types/shared";
export const sharedCacheKey = (account: string, org: string) => `notiva.shared.v1.${encodeURIComponent(account)}.${encodeURIComponent(org)}`;
export const sharedAccountKey = (account: string) => `notiva.shared.account.v1.${encodeURIComponent(account)}`;
export type SharedCache = { lists: Partial<Record<SharedView, SharedEntry[]>>; details: Record<string, SharedEntry>;
  pendingCreate?: { clientRequestId: string; draft: SharedDraft }; refreshedAt?: string; occurrenceActions?: SharedOccurrenceAction[]; series?: Record<string, SharedEntry> };
export type SharedAccountCache = { selectedId?: string; organizations: OrganizationEntry[] };
let writes: Promise<unknown> = Promise.resolve();
export async function readSharedStorage<T>(key: string, fallback: T): Promise<T> {
  await writes;
  let raw: string | null;
  if (Platform.OS === "web") raw = typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  else { const { File, Paths } = await import("expo-file-system"); const file = new File(Paths.document, `${key}.json`); raw = file.exists ? await file.text() : null; }
  try { return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
export function writeSharedStorage<T>(key: string, value: T) {
  const operation = writes.catch(() => undefined).then(async () => {
    const raw = JSON.stringify(value);
    if (Platform.OS === "web") { if (typeof localStorage !== "undefined") localStorage.setItem(key, raw); }
    else { const { File, Paths } = await import("expo-file-system"); new File(Paths.document, `${key}.json`).write(raw); }
  });
  writes = operation.catch(() => undefined); return operation;
}
export const emptySharedCache = (): SharedCache => ({ lists: {}, details: {} });
export const readSharedCache = (account: string, org: string) => readSharedStorage(sharedCacheKey(account, org), emptySharedCache());
let cacheWrites: Promise<unknown> = Promise.resolve();
export function updateSharedCache(account: string, org: string, update: (cache: SharedCache) => void) {
  const result = cacheWrites.catch(() => undefined).then(async () => {
    const cache = await readSharedCache(account, org); update(cache);
    const ids = Object.keys(cache.details); for (const id of ids.slice(0, Math.max(0, ids.length - 100))) delete cache.details[id];
    for (const view of ["inbox", "created", "management"] as const) if (cache.lists[view]) cache.lists[view] = cache.lists[view]!.slice(0, 200);
    await writeSharedStorage(sharedCacheKey(account, org), cache); return cache;
  }); cacheWrites = result.catch(() => undefined); return result;
}
export function purgeSharedCache(account: string, org: string) {
  return updateSharedCache(account, org, cache => { cache.lists = {}; cache.details = {}; delete cache.pendingCreate; delete cache.refreshedAt; delete cache.occurrenceActions; delete cache.series; });
}
