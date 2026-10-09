import type { ReminderItem } from "../types/item";

export const WEEKDAYS = [1, 2, 3, 4, 5] as const;

export function nextWeekdayOccurrence(current: Date, inclusive = false): Date {
  return nextWeeklyOccurrence(current, [...WEEKDAYS], inclusive);
}

/** The app and native bridge both use JavaScript's Sunday=0 convention. */
export function normalizeWeeklyDays(days: number[] | undefined, fallback?: number): number[] {
  const selected = days === undefined && fallback !== undefined ? [fallback] : days ?? [];
  const result = [...new Set(selected.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
  if (!result.length) throw new Error("Choose at least one weekday.");
  return result;
}

export function nextWeeklyOccurrence(current: Date, days: number[], inclusive = false): Date {
  if (!Number.isFinite(current.getTime())) throw new Error("Invalid reminder date.");
  const selected = normalizeWeeklyDays(days);
  for (let offset = inclusive ? 0 : 1; offset <= 7; offset++) {
    const candidate = new Date(current.getFullYear(), current.getMonth(), current.getDate() + offset,
      current.getHours(), current.getMinutes(), current.getSeconds(), current.getMilliseconds());
    if (selected.includes(candidate.getDay())) return candidate;
  }
  throw new Error("Could not calculate next weekly occurrence.");
}

/** Align the first row with the first chosen weekday on/after the selected date. */
export function alignWeeklyItem(item: ReminderItem): ReminderItem {
  if (item.repeat !== "weekly" && item.repeat !== "weekdays") return item;
  const start = new Date(item.startAt);
  const weeklyDays = item.repeat === "weekdays" ? [...WEEKDAYS] : normalizeWeeklyDays(item.weeklyDays, start.getDay());
  const aligned = nextWeeklyOccurrence(start, weeklyDays, true);
  const end = item.endAt ? new Date(item.endAt) : undefined;
  if (end) {
    const days = Math.round((Date.UTC(aligned.getFullYear(), aligned.getMonth(), aligned.getDate()) -
      Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) / 86_400_000);
    end.setDate(end.getDate() + days);
  }
  return { ...item, weeklyDays: item.repeat === "weekly" ? weeklyDays : undefined,
    startAt: aligned.toISOString(), endAt: end?.toISOString() };
}
