import * as calendar from "../shared/recurrence.cjs";
import type { SharedEntry, SharedOccurrenceAction, SharedOccurrenceResult } from "../types/shared";
export const sharedRepeats = ["none", "daily", "weekly", "weekdays", "monthly", "yearly"] as const;
export const repeatLabel = (value?: string) => value && value !== "none" ? value[0].toUpperCase() + value.slice(1) : "Does not repeat";
export const isSharedRecurring = (entry: SharedEntry) => !!entry.item.recurrence && entry.item.recurrence.repeat !== "none";
export function deriveSharedOccurrence(entry: SharedEntry, actions: SharedOccurrenceAction[] = [], now = new Date()): SharedEntry {
  if (!isSharedRecurring(entry)) return entry;
  const pending = actions.filter(action => action.itemId === entry.item.id);
  let history = entry.recipient?.occurrenceHistory ?? [];
  for (const action of pending) {
    if (action.state !== "pending") continue;
    const day = action.occurrenceKey.match(/\|(\d{4}-\d{2}-\d{2})T/)?.[1];
    const due = day ? calendar.dueOn(entry.item, day) : null;
    if (due?.key === action.occurrenceKey) history = calendar.mergeHistory(history, { occurrenceKey: action.occurrenceKey, scheduledAt: due.startAt, status: action.action === "complete" ? "completed" : "acknowledged" });
  }
  const due = calendar.currentOccurrence(entry.item, now, entry.recipient ?? undefined), own = history.find(row => row.occurrenceKey === due?.key);
  const global = entry.item.occurrenceHistory?.find(row => row.occurrenceKey === due?.key);
  const after = new Date(Math.max(+now, entry.recipient?.eligibleFrom ? Date.parse(entry.recipient.eligibleFrom) - 1 : 0));
  const next = entry.recipient?.accessStatus === "active" ? calendar.nextOccurrence(entry.item, after, history, entry.item.occurrenceHistory) : null;
  const status = calendar.occurrenceStatus(entry.item, due, own, global, now);
  const pendingCurrent = pending.some(action => action.state === "pending" && action.occurrenceKey === due?.key);
  return { ...entry, pendingOccurrenceActions: pending, occurrence: due ? { ...due, status, completedByUserId: global?.completedByUserId, completedAt: global?.completedAt } : null,
    recipientSummary: due?.key !== entry.occurrence?.key ? entry.recipientSummary?.map(row => ({ ...row, status: "pending" })) : entry.recipientSummary,
    recipient: entry.recipient ? { ...entry.recipient, status: own?.status ?? "pending", acknowledgedAt: own?.acknowledgedAt, completedAt: own?.completedAt } : entry.recipient,
    effectiveStatus: pendingCurrent ? "pending_sync" : status,
    alarm: { eligible: !!next, key: next ? `shared:${entry.item.organizationId}:${entry.item.id}:${entry.recipient?.userId}:${next.key}` : null,
      scheduleRevision: entry.item.scheduleRevision, occurrenceKey: next?.key, startAt: next?.startAt, endAt: next?.endAt } };
}
/** Virtual recent unresolved slots plus real compact history. Never persisted. */
export function sharedRecentHistory(entry: SharedEntry, now = new Date()): (SharedOccurrenceResult | { occurrenceKey: string; scheduledAt: string; status: string })[] {
  if (!isSharedRecurring(entry)) return [];
  const globalHistory = (entry.item.occurrenceHistory ?? []).filter(row => !entry.recipient || row.occurrenceKey !== entry.recipient.excludedOccurrenceKey && (!entry.recipient.eligibleFrom || Date.parse(row.scheduledAt) >= Date.parse(entry.recipient.eligibleFrom)));
  const history = new Map([...(entry.recipient?.occurrenceHistory ?? []), ...globalHistory].map(row => [row.occurrenceKey, row]));
  const today = calendar.wallDateKey(now, entry.item.recurrence!.timeZone!);
  for (let offset = 1; offset <= 30; offset++) {
    const day = new Date(today + "T12:00:00Z"); day.setUTCDate(day.getUTCDate() - offset);
    const due = calendar.dueOn(entry.item, day.toISOString().slice(0, 10));
    if (due && due.key !== entry.recipient?.excludedOccurrenceKey && (!entry.recipient?.eligibleFrom || Date.parse(due.startAt) >= Date.parse(entry.recipient.eligibleFrom)) && !history.has(due.key)) history.set(due.key, { occurrenceKey: due.key, scheduledAt: due.startAt, status: calendar.occurrenceStatus(entry.item, due, undefined, entry.item.occurrenceHistory?.find(row => row.occurrenceKey === due.key), now) } as SharedOccurrenceResult);
  }
  return [...history.values()].sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)).slice(0, 30);
}
