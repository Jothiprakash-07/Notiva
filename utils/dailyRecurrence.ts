import type { DailySeries, ReminderItem } from "../types/item";
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
  if (!["daily", "weekly", "weekdays"].includes(item.repeat) || item.seriesId) return item;
  item = alignWeeklyItem(item);
  return { ...item, seriesId: item.id, notificationIds: [], dailySeries: {
    repeat: item.repeat as "daily" | "weekly" | "weekdays",
    active: true, firstAt: item.startAt, templateId: item.id, template: dailyTemplate(item),
    excludedDates: [], notificationIds: item.notificationIds, dirty: true,
  } };
}

/** Persist dated rows through the next month, including missed days after restart.
 * The native series alarm has no such horizon and re-arms while JS is closed. */
export function materializeDaily(items: ReminderItem[], now = new Date()): ReminderItem[] {
  const result = [...items];
  const ids = new Set(items.map(item => item.id));
  for (const root of items) {
    const series = root.dailySeries;
    if (!series?.active) continue;
    const anchor = new Date(series.template.startAt);
    if (!Number.isFinite(anchor.getTime())) continue;
    const repeat = series.repeat ?? "daily";
    const weeklyDays = repeat === "weekdays" ? [...WEEKDAYS] :
      repeat === "weekly" ? normalizeWeeklyDays(series.template.weeklyDays, anchor.getDay()) : undefined;
    const until = new Date(Math.max(
      new Date(now.getFullYear(), now.getMonth() + 2, 1).getTime(),
      new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 2).getTime(),
    ));
    // Reconstruct from the anchor's clock on each date, so a DST gap on one
    // day doesn't permanently shift subsequent days' wall-clock time.
    for (let offset = 0; ; offset++) {
      const date = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + offset,
        anchor.getHours(), anchor.getMinutes(), anchor.getSeconds(), anchor.getMilliseconds());
      if (date >= until) break;
      if (weeklyDays && !weeklyDays.includes(date.getDay())) continue;
      const id = offset === 0 ? series.templateId : dailyOccurrenceId(root.id, series.firstAt, date, repeat);
      if (ids.has(id) || series.excludedDates.includes(localDateKey(date))) continue;
      const end = series.template.endAt ? new Date(series.template.endAt) : undefined;
      if (end) end.setDate(end.getDate() + offset);
      result.push({ ...series.template, id, seriesId: root.id, startAt: date.toISOString(),
        endAt: end?.toISOString(), repeat, weeklyDays: repeat === "weekly" ? weeklyDays : undefined,
        completed: false, notificationIds: [],
        createdAt: now.toISOString(), updatedAt: now.toISOString() });
      ids.add(id);
    }
  }
  return result;
}
