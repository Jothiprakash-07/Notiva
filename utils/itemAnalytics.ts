import type { ItemType, ReminderItem } from "../types/item";
import { getItemStatus } from "./itemStatus";

export type AnalyticsPeriod = "week" | "month" | "all";
export type AnalyticsFilters = {
  category?: { kind: "value"; value: string } | { kind: "uncategorized" };
  type?: ItemType;
};

export function matchesAnalyticsFilters(item: ReminderItem, filters: AnalyticsFilters): boolean {
  if (filters.type && item.type !== filters.type) return false;
  const category = item.category?.trim() || "";
  if (filters.category?.kind === "uncategorized") return !category;
  return !filters.category || category === filters.category.value;
}

export function weekStart(now: Date, weekStartsOn: 0 | 1 = 1): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() - weekStartsOn + 7) % 7);
}

function timestamp(value?: string): number | null {
  const time = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(time) ? time : null;
}

export function completionTime(item: ReminderItem, now: Date): number | null {
  const status = getItemStatus(item, now);
  if (status !== "Done" && status !== "Completed") return null;
  // Current storage has no completedAt or occurrence history. Done items are
  // read-only and toggleComplete records updatedAt, making it the best fallback.
  // Accept completedAt if future/imported data provides it, without changing storage.
  const recorded = timestamp((item as ReminderItem & { completedAt?: string }).completedAt);
  if (recorded !== null) return recorded;
  // Events complete with time, not an edit: updatedAt is NOT a completion date.
  if (item.type === "event") return timestamp(item.endAt || item.startAt);
  return timestamp(item.updatedAt);
}

export function calculateAnalytics(items: ReminderItem[], period: AnalyticsPeriod, now = new Date(), weekStartsOn: 0 | 1 = 1, filters: AnalyticsFilters = {}) {
  const matching = items.filter(item => matchesAnalyticsFilters(item, filters));
  const monday = weekStart(now, weekStartsOn);
  const from = period === "week" ? monday : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = period === "week"
    ? new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7)
    : new Date(now.getFullYear(), now.getMonth() + 1, 1);
  // Period summaries are a scheduled-date cohort, not a completion-history query.
  // Count stored items once; never invent occurrences for repeating items.
  const selected = matching.filter(item => {
    if (period === "all") return true;
    const start = timestamp(item.startAt);
    if (start === null) return false;
    if (item.type === "birthday") {
      const birthday = new Date(start);
      // Annual birthdays belong to the calendar period even after their day passes.
      return [from.getFullYear(), to.getFullYear()].some(year => {
        const occurrence = new Date(year, birthday.getMonth(), birthday.getDate()).getTime();
        return occurrence >= from.getTime() && occurrence < to.getTime();
      });
    }
    return start >= from.getTime() && start < to.getTime();
  });
  const types: Record<ItemType, number> = { reminder: 0, task: 0, event: 0, birthday: 0 };
  let completed = 0;
  let pending = 0;
  let missed = 0;
  let cancelled = 0;
  for (const item of selected) {
    types[item.type]++;
    const status = getItemStatus(item, now);
    if (item.type === "birthday") continue;
    if (status === "Done" || status === "Completed") completed++;
    else if (status === "Missed" || status === "Overdue") missed++;
    else if (status === "Cancelled") cancelled++;
    else pending++; // Pending reminders/tasks and Upcoming/Ongoing events.
  }
  const actionable = completed + pending + missed;
  const labels = weekStartsOn === 0 ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const days = labels.map((label, index) => ({
    label,
    start: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index).getTime(),
    end: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index + 1).getTime(),
    count: 0,
  }));
  // Weekly activity uses matching items across all periods, including items scheduled in
  // older periods but completed this week. Missing timestamps contribute nothing.
  for (const item of matching) {
    const time = completionTime(item, now);
    if (time === null || time > now.getTime()) continue;
    const day = days.find(value => time >= value.start && time < value.end);
    if (day) day.count++;
  }
  return {
    total: selected.length, completed, pending, missed, cancelled, actionable, types, days,
    percentage: actionable ? Math.round(completed / actionable * 100) : 0,
  };
}
