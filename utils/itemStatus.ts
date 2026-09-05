import { ItemStatus, ReminderItem } from "../types/item";

export function getItemStatus(item: ReminderItem, now = new Date()): ItemStatus {
  if (item.type === "birthday") return "Upcoming";
  if (item.type === "event") {
    if (item.status === "Cancelled") return "Cancelled";
    const start = new Date(item.startAt).getTime();
    const end = new Date(item.endAt || item.startAt).getTime();
    const current = now.getTime();
    if (current < start) return "Upcoming";
    if (current <= end) return "Ongoing";
    return "Completed";
  }
  if (item.completed || item.status === "Done") return "Done";
  return new Date(item.startAt).getTime() > now.getTime()
    ? "Pending"
    : item.type === "task" ? "Overdue" : "Missed";
}

export function isItemReadOnly(item: ReminderItem): boolean {
  return ["Done", "Completed", "Cancelled"].includes(getItemStatus(item));
}

export function withCalculatedStatus(item: ReminderItem, now = new Date()): ReminderItem {
  return { ...item, status: getItemStatus(item, now) };
}

export function getNextBirthday(date: string, now = new Date()): Date {
  const original = new Date(date);
  const next = new Date(now.getFullYear(), original.getMonth(), original.getDate());
  if (next.getTime() < now.getTime()) next.setFullYear(next.getFullYear() + 1);
  return next;
}

export function isCountedAsDone(item: ReminderItem): boolean {
  const status = getItemStatus(item);
  return status === "Done" || (item.type === "event" && status === "Completed");
}

export function isCountedAsOverdue(item: ReminderItem): boolean {
  const status = getItemStatus(item);
  return status === "Missed" || status === "Overdue";
}
