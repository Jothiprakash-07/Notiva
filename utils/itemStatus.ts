import { occurrenceOn, localDateKey } from "./dailyRecurrence";
import {
  ItemStatus,
  ReminderItem,
} from "../types/item";

export function getItemStatus(
  item: ReminderItem,
  now = new Date()
): ItemStatus {
  if (item.preview) return "Upcoming";
  if (item.type === "birthday") {
    return "Upcoming";
  }

  if (item.type === "event") {
    if (item.status === "Cancelled") {
      return "Cancelled";
    }

    const start =
      new Date(
        item.startAt
      ).getTime();

    const end =
      new Date(
        item.endAt ||
          item.startAt
      ).getTime();

    const current =
      now.getTime();

    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end)
    ) {
      return "Upcoming";
    }

    if (current < start) {
      return "Upcoming";
    }

    if (current <= end) {
      return "Ongoing";
    }

    return "Completed";
  }

  if (
    item.completed ||
    item.status === "Done"
  ) {
    return "Done";
  }

  const start =
    new Date(
      item.startAt
    ).getTime();

  if (
    !Number.isFinite(start)
  ) {
    return "Pending";
  }

  if (
    start >
    now.getTime()
  ) {
    return "Pending";
  }

  return item.type === "task"
    ? "Overdue"
    : "Missed";
}

export function isItemReadOnly(
  item: ReminderItem
): boolean {
  return [
    "Done",
    "Completed",
    "Cancelled",
  ].includes(
    getItemStatus(item)
  );
}

/** Compare actual local occurrence slots without backend calls or permanent groups. */
export function findScheduleConflicts(items: ReminderItem[], candidate: ReminderItem, now = new Date()): ReminderItem[] {
  const target = new Date(candidate.startAt);
  if (!Number.isFinite(target.getTime())) return [];
  const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const seen = new Set<string>();
  return items.filter(item => {
    if (item.preview || item.id === candidate.id || item.syncStatus === "pending_delete") return false;
    if (item.dailySeries) {
      if (candidate.seriesId === item.id || !item.dailySeries.active) return false;
      const due = occurrenceOn(item, target);
      if (!due || due.getHours() !== target.getHours() || due.getMinutes() !== target.getMinutes()) return false;
      if (item.dailySeries.excludedDates.includes(localDateKey(target))) return false;
      const key = `${item.id}:${localDateKey(target)}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    }
    if (item.id === candidate.id || item.completed || item.actionResolved ||
        ["Done", "Completed", "Cancelled"].includes(getItemStatus(item, now))) return false;
    const start = new Date(item.startAt);
    if (!Number.isFinite(start.getTime()) || start.getHours() !== target.getHours() || start.getMinutes() !== target.getMinutes()) return false;
    const exactDay = dayKey(start) === dayKey(target);
    // Generated series rows already represent one actual date. Only anchors
    // and standalone repeating schedules may project another occurrence.
    const anchor = !item.seriesId;
    let occurs = exactDay && !item.dailyHidden;
    if (!occurs && anchor && start <= target && item.repeat !== "none") {
      const repeat = item.repeat;
      occurs = repeat === "daily" ||
        (repeat === "weekly" && (item.weeklyDays ?? [start.getDay()]).includes(target.getDay())) ||
        (repeat === "weekdays" && target.getDay() !== 0 && target.getDay() !== 6) ||
        (repeat === "monthly" && start.getDate() === target.getDate()) ||
        (repeat === "yearly" && start.getMonth() === target.getMonth() && start.getDate() === target.getDate());
    }
    if (item.dailyHidden && exactDay) return false;
    // Editing an occurrence must not conflict with its own series projection.
    if (candidate.seriesId && candidate.seriesId === (item.seriesId ?? item.id)) return false;
    const identity = `${item.seriesId ?? item.id}:${dayKey(target)}`;
    if (!occurs || seen.has(identity)) return false;
    seen.add(identity); return true;
  });
}

export function withCalculatedStatus(
  item: ReminderItem,
  now = new Date()
): ReminderItem {
  return {
    ...item,
    status:
      getItemStatus(
        item,
        now
      ),
  };
}

export function getNextBirthday(
  date: string,
  now = new Date()
): Date {
  const original =
    new Date(date);

  const next =
    new Date(
      now.getFullYear(),
      original.getMonth(),
      original.getDate()
    );

  if (
    next.getTime() <
    now.getTime()
  ) {
    next.setFullYear(
      next.getFullYear() +
        1
    );
  }

  return next;
}

export function isCountedAsDone(
  item: ReminderItem
): boolean {
  const status =
    getItemStatus(item);

  return (
    status === "Done" ||
    (
      item.type ===
        "event" &&
      status ===
        "Completed"
    )
  );
}

export function isCountedAsOverdue(
  item: ReminderItem
): boolean {
  const status =
    getItemStatus(item);

  return (
    status === "Missed" ||
    status === "Overdue"
  );
}
