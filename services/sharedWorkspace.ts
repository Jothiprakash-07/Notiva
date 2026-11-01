import { AppState } from "react-native";
import { getItemAccount, getItemSyncSession } from "./itemAccount";
import { organizationApi, sharedApi, SharedApiError } from "./sharedApi";
import { clearOtherSharedAlarms, clearSharedAlarms, clearSharedAlarmItem, sharedScheduledItemIds, pruneSharedAlarms, reconcileSharedAlarms } from "./sharedAlarms";
import { emptySharedCache, purgeSharedCache, readSharedCache, readSharedStorage, sharedAccountKey, updateSharedCache, writeSharedStorage } from "./sharedCache";
import type { SharedAccountCache, SharedCache } from "./sharedCache";
import type { OrganizationEntry, SharedDraft, SharedEntry, SharedView, SharedRecurrence } from "../types/shared";
import { deriveSharedOccurrence, isSharedRecurring } from "../utils/sharedRecurrence";
import { nextMidnight } from "../shared/recurrence.cjs";
export type WorkspaceState = { account?: string; organizations: OrganizationEntry[]; selectedId?: string; loading: boolean; fresh: boolean; error?: string; version: number };
const blank: WorkspaceState = { organizations: [], loading: true, fresh: false, version: 0 };
let state = blank, generation = 0, flight: Promise<void> | undefined;
const organizationEpochs = new Map<string, number>();
const epochKey = (account: string, org: string) => JSON.stringify([account, org]);
const organizationEpoch = (account: string, org: string) => organizationEpochs.get(epochKey(account, org)) ?? 0;
function checkScope(account: string, org: string, epoch: number) {
  if (getItemAccount() !== account || organizationEpoch(account, org) !== epoch) throw new SharedApiError(401, "Workspace access changed. Refresh to continue.");
}
async function reconcileCachedSeries(account: string, org: string) {
  const cache = await readSharedCache(account, org);
  const entries = dedupeSharedEntries([...(cache.lists.inbox ?? []), ...Object.values(cache.series ?? {})], org)
    .map(entry => deriveSharedOccurrence(entry, cache.occurrenceActions));
  if (getItemAccount() === account) await reconcileSharedAlarms(account, org, entries, () => guard(account));
}
async function flushOccurrenceActions(account: string, org: string) {
  const epoch = organizationEpoch(account, org);
  const cache = await readSharedCache(account, org);
  for (const action of cache.occurrenceActions ?? []) {
    if (action.state !== "pending") continue;
    checkScope(account, org, epoch);
    try {
      await sharedApi.action(account, org, action.itemId, action.action, action.expectedRevision, action.occurrenceKey);
      checkScope(account, org, epoch);
      await updateSharedCache(account, org, value => { value.occurrenceActions = value.occurrenceActions?.filter(row => row.occurrenceKey !== action.occurrenceKey || row.itemId !== action.itemId || row.action !== action.action); });
    } catch (error) {
      if (error instanceof SharedApiError && [400, 403, 404, 409].includes(error.status)) {
        checkScope(account, org, epoch);
        await updateSharedCache(account, org, value => { const row = value.occurrenceActions?.find(row => row.itemId === action.itemId && row.occurrenceKey === action.occurrenceKey && row.action === action.action); if (row) { row.state = "conflict"; row.error = error.message; } });
      } else throw error;
    }
  }
}
const listeners = new Set<() => void>();
export const subscribeWorkspace = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getWorkspaceState = () => state;
function publish(value: Partial<WorkspaceState>) { state = { ...state, ...value, version: state.version + 1 }; listeners.forEach(fn => fn()); }
function guard(account: string, stamp = generation) { return stamp === generation && getItemAccount() === account && state.account === account; }
const denied = (error: unknown) => error instanceof SharedApiError && [403, 404].includes(error.status);
export function dedupeSharedEntries(entries: SharedEntry[], org: string) {
  const byId = new Map<string, SharedEntry>();
  for (const entry of entries) {
    if (entry.item.organizationId !== org) continue;
    const prior = byId.get(entry.item.id);
    if (!prior || entry.item.serverRevision > prior.item.serverRevision || (entry.item.serverRevision === prior.item.serverRevision &&
      (entry.recipient?.recipientRevision ?? 0) >= (prior.recipient?.recipientRevision ?? 0))) byId.set(entry.item.id, entry);
  }
  return [...byId.values()];
}
async function checkMembershipAfterDenied(account: string, org: string) {
  try {
    const current = await organizationApi.detail(account, org);
    if (guard(account)) {
      const before = state.organizations.find(row => row.organization.id === org);
      if (JSON.stringify(before) !== JSON.stringify(current)) publish({ organizations: state.organizations.map(row => row.organization.id === org ? current : row) });
    }
  } catch (error) { if (denied(error)) await revokeSharedOrganization(account, org); }
}
export function sharedErrorMessage(error: unknown) {
  if (error instanceof SharedApiError) return error.status === 409 ? "This shared item changed. The latest version has been loaded. Review it before trying again." : error.message;
  return "Could not reach the workspace. Check your connection and retry. Saved data is read-only.";
}
export async function revokeSharedOrganization(account: string, org: string) {
  organizationEpochs.set(epochKey(account, org), organizationEpoch(account, org) + 1);
  await purgeSharedCache(account, org);
  if (guard(account)) {
    const organizations = state.organizations.filter(row => row.organization.id !== org);
    publish({ organizations, selectedId: state.selectedId === org ? organizations[0]?.organization.id : state.selectedId });
    await writeSharedStorage(sharedAccountKey(account), { organizations, selectedId: state.selectedId });
  }
  await clearSharedAlarms(account, org);
}
export async function refreshSharedWorkspace() {
  const account = state.account, stamp = generation;
  if (!account || !guard(account)) return;
  if (flight) return flight;
  const operation = (async () => {
    publish({ loading: true });
    try {
      await clearOtherSharedAlarms(account);
      const organizations = await organizationApi.list(account);
      if (!guard(account, stamp)) return;
      for (const previous of state.organizations) if (!organizations.some(org => org.organization.id === previous.organization.id)) await revokeSharedOrganization(account, previous.organization.id);
      if (!guard(account, stamp)) return;
      const selectedId = organizations.some(row => row.organization.id === state.selectedId) ? state.selectedId : organizations[0]?.organization.id;
      publish({ organizations, selectedId, fresh: true, error: undefined });
      await writeSharedStorage(sharedAccountKey(account), { organizations, selectedId });
      await pruneSharedAlarms(account, organizations.map(row => row.organization.id));
      // Refresh every organization, independent of the currently visible screen.
      for (const org of organizations) {
        if (!guard(account, stamp)) return;
        const id = org.organization.id;
        try {
          await flushOccurrenceActions(account, id);
          const entries = await sharedApi.list(account, id, "inbox");
          if (!guard(account, stamp)) return;
          const byId = new Map(dedupeSharedEntries(entries, id).map(entry => [entry.item.id, entry]));
          // Offset pagination can move: verify missing previously scheduled/cached
          // receipts by detail before treating absence as revocation.
          const previous = await readSharedCache(account, id);
          const previousIds = new Set([...(previous.lists.inbox ?? []).map(entry => entry.item.id), ...await sharedScheduledItemIds(account, id)]);
          for (const itemId of previousIds) if (!byId.has(itemId)) {
            try { const current = await sharedApi.detail(account, id, itemId); if (current.recipient?.accessStatus === "active") byId.set(itemId, current); }
            catch (error) { if (!denied(error)) throw error; }
          }
          const inbox = [...byId.values()];
          if (!guard(account, stamp)) return;
          await updateSharedCache(account, id, cache => { cache.lists.inbox = inbox; cache.series = Object.fromEntries(inbox.filter(entry => isSharedRecurring(entry) && entry.item.status === "active").map(entry => [entry.item.id, entry])); cache.refreshedAt = new Date().toISOString(); });
          await reconcileSharedAlarms(account, id, inbox, () => guard(account, stamp));
        } catch (error) {
          if (!guard(account, stamp)) return;
          if (denied(error)) await revokeSharedOrganization(account, id);
          else { await reconcileCachedSeries(account, id); publish({ error: sharedErrorMessage(error) }); }
        }
      }
    } catch (error) {
      if (guard(account, stamp)) {
        for (const org of state.organizations) await reconcileCachedSeries(account, org.organization.id);
        publish({ fresh: false, error: sharedErrorMessage(error) });
      }
    } finally { if (guard(account, stamp)) publish({ loading: false }); }
  })(); flight = operation;
  try { await operation; } finally { if (flight === operation) flight = undefined; }
}
export async function selectSharedOrganization(org: string) {
  const account = state.account;
  if (!account || !guard(account) || !state.organizations.some(row => row.organization.id === org)) return;
  publish({ selectedId: org });
  await writeSharedStorage(sharedAccountKey(account), { organizations: state.organizations, selectedId: org });
}
export async function dismissSharedOccurrenceConflicts(account: string, org: string, itemId: string) {
  const epoch = organizationEpoch(account, org); checkScope(account, org, epoch);
  await updateSharedCache(account, org, cache => { cache.occurrenceActions = cache.occurrenceActions?.filter(row => row.itemId !== itemId || row.state !== "conflict"); });
  if (guard(account)) publish({});
}
export function startSharedWorkspace(account: string) {
  const stamp = ++generation; flight = undefined;
  let midnightTimer: ReturnType<typeof setTimeout> | undefined;
  const armMidnight = async () => {
    const zones = new Set<string>();
    for (const org of state.organizations) {
      const cache = await readSharedCache(account, org.organization.id);
      for (const entry of Object.values(cache.series ?? {})) if (entry.item.recurrence?.timeZone) zones.add(entry.item.recurrence.timeZone);
    }
    if (!guard(account, stamp)) return;
    const now = new Date(), next = Math.min(...[...zones].map(zone => nextMidnight(now, zone)), Date.now() + 60000);
    midnightTimer = setTimeout(() => {
      if (!guard(account, stamp)) return;
      publish({});
      void Promise.all(state.organizations.map(org => reconcileCachedSeries(account, org.organization.id))).catch(() => {}).finally(() => { void armMidnight(); });
    }, Math.max(1, next - Date.now()));
  };
  state = { ...blank, account }; publish({});
  void (async () => {
    const saved = await readSharedStorage<SharedAccountCache>(sharedAccountKey(account), { organizations: [] });
    if (!guard(account, stamp)) return;
    publish({ organizations: saved.organizations, selectedId: saved.selectedId });
    for (const org of saved.organizations) await reconcileCachedSeries(account, org.organization.id);
    await refreshSharedWorkspace();
    await armMidnight();
  })().catch(error => { if (guard(account, stamp)) publish({ loading: false, error: sharedErrorMessage(error) }); });
  const listener = AppState.addEventListener("change", next => { if (next === "active") void refreshSharedWorkspace(); });
  const timer = setInterval(() => { if (AppState.currentState === "active") void refreshSharedWorkspace(); }, 30000);
  return () => {
    ++generation; flight = undefined; listener.remove(); clearInterval(timer); clearTimeout(midnightTimer); state = blank; publish({});
    void clearSharedAlarms(account).catch(error => console.warn("Shared alarm cleanup will retry:", error));
  };
}
export async function loadSharedList(account: string, org: string, view: SharedView): Promise<{ entries: SharedEntry[]; cached: boolean }> {
  const epoch = organizationEpoch(account, org);
  try {
    const values = await sharedApi.list(account, org, view), entries = dedupeSharedEntries(values, org).slice(0, view === "inbox" ? 200 : 50);
    if (view !== "inbox") {
      // Enrich visible management cards with counts; detail contains no contact data.
      for (let i = 0; i < Math.min(entries.length, 50); i += 4) await Promise.all(entries.slice(i, i + 4).map(async (entry, index) => {
        try { entries[i + index] = await sharedApi.detail(account, org, entry.item.id); } catch (error) { if (denied(error)) throw error; }
      }));
    }
    checkScope(account, org, epoch);
    await updateSharedCache(account, org, cache => { cache.lists[view] = entries; });
    const actions = (await readSharedCache(account, org)).occurrenceActions;
    return { entries: entries.map(entry => deriveSharedOccurrence(entry, actions)), cached: false };
  } catch (error) {
    if (error instanceof SharedApiError && error.status === 401) throw error;
    if (denied(error)) { await checkMembershipAfterDenied(account, org); throw error; }
    const cache = await readSharedCache(account, org);
    if (cache.lists[view]) return { entries: cache.lists[view]!.map(entry => deriveSharedOccurrence(entry, cache.occurrenceActions)), cached: true };
    throw error;
  }
}
export async function loadSharedDetail(account: string, org: string, id: string): Promise<{ entry: SharedEntry; cached: boolean }> {
  const epoch = organizationEpoch(account, org);
  try {
    const entry = await sharedApi.detail(account, org, id);
    checkScope(account, org, epoch);
    await updateSharedCache(account, org, cache => {
      cache.details[id] = entry;
      if (entry.recipient?.accessStatus === "active") {
        cache.lists.inbox = dedupeSharedEntries([...(cache.lists.inbox ?? []), entry], org);
        if (isSharedRecurring(entry)) { cache.series ??= {}; cache.series[id] = entry; }
      } else {
        if (cache.series) delete cache.series[id];
        cache.lists.inbox = cache.lists.inbox?.filter(row => row.item.id !== id);
        cache.occurrenceActions = cache.occurrenceActions?.filter(row => row.itemId !== id);
      }
    });
    if (entry.recipient?.accessStatus !== "active") await clearSharedAlarmItem(account, org, id);
    else await reconcileCachedSeries(account, org);
    return { entry: deriveSharedOccurrence(entry, (await readSharedCache(account, org)).occurrenceActions), cached: false };
  } catch (error) {
    if (error instanceof SharedApiError && error.status === 401) throw error;
    if (denied(error)) {
      await updateSharedCache(account, org, cache => { delete cache.details[id]; if (cache.series) delete cache.series[id]; cache.occurrenceActions = cache.occurrenceActions?.filter(row => row.itemId !== id); for (const view of Object.keys(cache.lists) as SharedView[]) cache.lists[view] = cache.lists[view]?.filter(row => row.item.id !== id); });
      await clearSharedAlarmItem(account, org, id); await checkMembershipAfterDenied(account, org); throw error;
    }
    const cache = await readSharedCache(account, org), entry = cache.details[id] ?? cache.series?.[id]; if (entry) return { entry: deriveSharedOccurrence(entry, cache.occurrenceActions), cached: true };
    throw error;
  }
}
export async function mutateSharedClient(account: string, org: string, id: string, action: "acknowledge" | "complete" | "cancel" | "edit", revision: number,
  draft?: Partial<Pick<SharedDraft, "title" | "description" | "schedule" | "targets">> & { recurrence?: SharedRecurrence }, occurrenceKey?: string) {
  const epoch = organizationEpoch(account, org);
  let result: SharedEntry;
  try {
    if (action === "edit") result = await sharedApi.edit(account, org, id, draft!, revision);
    else result = await sharedApi.action(account, org, id, action, revision, occurrenceKey);
  } catch (error) {
    if (action === "edit" && draft?.targets && !(error instanceof SharedApiError)) throw new Error("You're offline. Connect to update recipients.");
    if (occurrenceKey && (action === "acknowledge" || action === "complete") && (!(error instanceof SharedApiError) || error.status >= 500)) {
      checkScope(account, org, epoch);
      const cache = await updateSharedCache(account, org, cache => {
        cache.occurrenceActions ??= [];
        if (!cache.occurrenceActions.some(row => row.itemId === id && row.occurrenceKey === occurrenceKey && row.action === action)) {
          if (cache.occurrenceActions.length >= 100) throw new Error("Sync pending shared responses before adding more.");
          cache.occurrenceActions.push({ itemId: id, occurrenceKey, action, expectedRevision: revision, state: "pending" });
        }
      });
      const entry = cache.details[id] ?? cache.series?.[id]; if (!entry) throw error;
      await reconcileCachedSeries(account, org);
      return { entry: deriveSharedOccurrence(entry, cache.occurrenceActions), cached: true };
    }
    if (error instanceof SharedApiError && error.status === 409) { await loadSharedDetail(account, org, id); await refreshSharedWorkspace(); }
    else if (error instanceof SharedApiError && error.status === 403) await refreshSharedWorkspace();
    throw error;
  }
  // Apply authoritative mutation evidence even if the following GET goes offline.
  checkScope(account, org, epoch);
  await updateSharedCache(account, org, cache => {
    if (cache.details[id]) cache.details[id] = { ...cache.details[id], ...result };
    if (cache.series?.[id]) cache.series[id] = { ...cache.series[id], ...result };
    for (const view of Object.keys(cache.lists) as SharedView[]) cache.lists[view] = cache.lists[view]?.map(entry => entry.item.id === id ? { ...entry, ...result } : entry);
    if (Object.prototype.hasOwnProperty.call(result, "recipient") && result.recipient?.accessStatus !== "active") {
      if (cache.series) delete cache.series[id];
      cache.lists.inbox = cache.lists.inbox?.filter(entry => entry.item.id !== id);
      cache.occurrenceActions = cache.occurrenceActions?.filter(row => row.itemId !== id);
    }
  });
  if (action === "edit" || action === "cancel" || result.item.status !== "active" || result.alarm?.eligible === false || isSharedRecurring(result)) await clearSharedAlarmItem(account, org, id);
  if (isSharedRecurring(result)) await reconcileCachedSeries(account, org);
  const detail = await loadSharedDetail(account, org, id); await refreshSharedWorkspace(); return detail;
}
export async function createSharedClient(account: string, org: string, draft: SharedDraft) {
  const epoch = organizationEpoch(account, org);
  let pending = (await readSharedCache(account, org)).pendingCreate;
  if (pending && JSON.stringify(pending.draft) !== JSON.stringify(draft)) throw new Error("Retry the saved creation before starting another item.");
  if (!pending) {
    pending = { draft, clientRequestId: `shared-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}` };
    await updateSharedCache(account, org, cache => { cache.pendingCreate = pending; });
  }
  let result: SharedEntry;
  try { result = await sharedApi.create(account, org, pending.draft, pending.clientRequestId); }
  catch (error) {
    if (error instanceof SharedApiError && [400, 403].includes(error.status)) await updateSharedCache(account, org, cache => { delete cache.pendingCreate; });
    throw error;
  }
  checkScope(account, org, epoch);
  await updateSharedCache(account, org, cache => { delete cache.pendingCreate; });
  await refreshSharedWorkspace(); return result;
}
export const currentSharedAccount = () => getItemSyncSession()?.user.id;
export { emptySharedCache };
export type { SharedCache };
