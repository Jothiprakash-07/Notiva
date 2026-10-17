import type { DailySeries, ReminderItem, OccurrenceResult } from "../types/item";
import { getItemStatus } from "./itemStatus";
import { alignWeeklyItem, normalizeWeeklyDays, WEEKDAYS } from "./weeklyRecurrence";

export function localDateKey(value: string | Date): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function dailyOccurrenceId(seriesId: string, firstAt: string, date: Date, repeat = "daily"): string {
  return localDateKey(firstAt) === localDateKey(date)
    ? seriesId : `${repeat}:${seriesId}:${localDateKey(date)}`;
}

export function dailyTemplate(item: ReminderItem): DailySeries["template"] {
  const { type, title, description, category, priority, alertBefore, startAt, endAt, allDay, location, notes, weeklyDays } = item;
  return { type, title, description, category, priority, alertBefore, startAt, endAt, allDay, location, notes, weeklyDays };
}

export function attachDailySeries(item: ReminderItem): ReminderItem {
  if (!["daily", "weekly", "weekdays", "monthly", "yearly"].includes(item.repeat) || item.seriesId) return item;
  item = alignWeeklyItem(item);
  return { ...item, seriesId: item.id, notificationIds: [], dailySeries: {
    repeat: item.repeat as NonNullable<DailySeries["repeat"]>,
    masterVersion: 1, active: true, firstAt: item.startAt, templateId: item.id, template: dailyTemplate(item),
    excludedDates: [], notificationIds: item.notificationIds, dirty: true,
  } };
}

/** Matches native calendar arithmetic: skip invalid month days and non-leap Feb 29. */
export function occurrenceOn(item: ReminderItem, day: Date): Date | undefined {
  const series = item.dailySeries;
  if (!series?.active) return;
  const anchor = new Date(series.template.startAt);
  const date = new Date(day.getFullYear(), day.getMonth(), day.getDate(), anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds());
  if (!Number.isFinite(date.getTime()) || date < anchor) return;
  const repeat = series.repeat ?? "daily";
  if (repeat === "weekly" && !normalizeWeeklyDays(series.template.weeklyDays, anchor.getDay()).includes(date.getDay())) return;
  if (repeat === "weekdays" && !WEEKDAYS.some(value => value === date.getDay())) return;
  if ((repeat === "monthly" || repeat === "yearly") && date.getDate() !== anchor.getDate()) return;
  if (repeat === "yearly" && date.getMonth() !== anchor.getMonth()) return;
  return date;
}
export function occurrenceKey(item: ReminderItem, date: Date): string {
  return `${item.seriesId ?? item.id}|${localDateKey(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
export function occurrenceResult(item: ReminderItem, now = new Date()): OccurrenceResult {
  return { occurrenceKey: occurrenceKey(item, new Date(item.startAt)), scheduledAt: item.startAt,
    status: getItemStatus(item, now), completedAt: item.completedAt, completionNote: item.completionNote, actionResolved: item.actionResolved };
}
/** Bounded compact results; never full item snapshots. */
export function mergeOccurrenceHistory(...histories: (OccurrenceResult[] | undefined)[]): OccurrenceResult[] {
  const rows = new Map<string, OccurrenceResult>();
  for (const entry of histories.flatMap(history => history ?? [])) {
    const old = rows.get(entry.occurrenceKey);
    if (!old || old.status !== "Done" || entry.status === "Done") rows.set(entry.occurrenceKey, entry);
  }
  return [...rows.values()].sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(-366);
}
/** Reconcile only the current date, never advance to a future card. */
export function materializeDaily(items: ReminderItem[], now = new Date()): ReminderItem[] {
  return items.map(item => {
    if (!item.dailySeries?.active || item.dailyHidden) return item;
    const due = occurrenceOn(item, now);
    if (!due || localDateKey(due) === localDateKey(item.startAt)) return item;
    let history = new Date(item.startAt) < due
      ? mergeOccurrenceHistory(item.occurrenceHistory, [occurrenceResult(item, now)]) : item.occurrenceHistory;
    // After days closed, retain compact unresolved results within the same
    // 366-result retention window. Never reconstruct full item rows.
    const skipped: OccurrenceResult[] = [];
    for (let offset = 366; offset > 0; offset--) {
      const date = occurrenceOn(item, new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset));
      if (!date || date <= new Date(item.startAt)) continue;
      skipped.push({ occurrenceKey: occurrenceKey(item, date), scheduledAt: date.toISOString(),
        status: getItemStatus({ ...item, startAt: date.toISOString(), completed: false, status: undefined }, now) });
    }
    history = mergeOccurrenceHistory(history, skipped);
    const recorded = history?.find(row => row.occurrenceKey === occurrenceKey(item, due));
    return { ...item, dailySeries: { ...item.dailySeries, excludedDates: item.dailySeries.excludedDates.filter(date => date >= localDateKey(now)) }, startAt: due.toISOString(), occurrenceKey: occurrenceKey(item, due), occurrenceHistory: history,
      completed: recorded?.status === "Done", status: recorded?.status, completedAt: recorded?.completedAt,
      completionNote: recorded?.completionNote, actionResolved: recorded?.actionResolved ?? false,
      updatedAt: now.toISOString() };
  });
}
/** Project a single requested date only; never persist this result. */
export function itemsForDate(items: ReminderItem[], day: Date, now = new Date()): ReminderItem[] {
  return items.flatMap(item => {
    if (!item.dailySeries?.active) return [item];
    const due = occurrenceOn(item, day);
    if (!due || item.dailyHidden) return [];
    if (localDateKey(due) === localDateKey(item.startAt) && localDateKey(due) <= localDateKey(now)) return [item];
    if (localDateKey(due) <= localDateKey(now)) {
      return historyItems([item]).filter(row => localDateKey(row.startAt) === localDateKey(due));
    }
    return [{ ...item, startAt: due.toISOString(), occurrenceKey: occurrenceKey(item, due), preview: true,
      completed: false, status: "Upcoming" as const, actionResolved: false, completedAt: undefined, completionNote: undefined,
      notificationIds: [] }];
  });
}
export function visibleCurrentItems(items: ReminderItem[], now = new Date()): ReminderItem[] {
  return items.filter(item => !item.preview && (!item.dailySeries?.active || localDateKey(item.startAt) === localDateKey(now)));
}

/** Merge only identical rules. Concurrent rule edits keep the existing conflict flow. */
export function mergeSeriesState(local: ReminderItem, remote: ReminderItem): ReminderItem | undefined {
  if (!local.dailySeries || !remote.dailySeries || local.id !== remote.id) return;
  const rule = (item: ReminderItem) => JSON.stringify({ repeat: item.repeat, template: item.dailySeries!.template, active: item.dailySeries!.active });
  if (rule(local) !== rule(remote)) return;
  const same = local.startAt === remote.startAt;
  const chosen = same ? (remote.completed ? remote : local) : (local.startAt > remote.startAt ? local : remote);
  const history = mergeOccurrenceHistory(local.occurrenceHistory, remote.occurrenceHistory,
    [occurrenceResult(local), occurrenceResult(remote)]);
  return { ...chosen, occurrenceHistory: history, dailySeries: { ...chosen.dailySeries!,
    excludedDates: [...new Set([...local.dailySeries.excludedDates, ...remote.dailySeries.excludedDates])].sort().slice(-366),
    notificationIds: local.dailySeries.notificationIds, dirty: true } };
}


/** Read-only historical cards are reconstructed solely for the history list. */
export function historyItems(items: ReminderItem[]): ReminderItem[] {
  return items.flatMap(item => [...(item.occurrenceHistory ?? []).filter(row => row.scheduledAt !== item.startAt),
    ...(item.dailySeries?.active && localDateKey(item.startAt) < localDateKey(new Date()) ? [occurrenceResult(item)] : [])].filter(row =>
    !items.some(legacy => legacy.id !== item.id && legacy.seriesId === item.id && legacy.startAt === row.scheduledAt)).map(row => ({
      ...item, id: row.occurrenceKey, dailySeries: undefined, occurrenceHistory: undefined, historical: true,
      startAt: row.scheduledAt, completed: row.status === "Done", status: row.status, completedAt: row.completedAt,
      completionNote: row.completionNote, actionResolved: true, notificationIds: [],
    })));
}
