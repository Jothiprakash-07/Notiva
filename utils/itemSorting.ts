import { ReminderItem } from "../types/item";
import { getItemStatus } from "./itemStatus";

export function isActionResolved(item: ReminderItem): boolean {
  return item.actionResolved === true;
}

export function isActionRequired(item: ReminderItem, now = new Date()): boolean {
  if (isActionResolved(item)) return false;
  const status = getItemStatus(item, now);
  return (item.type === "reminder" && status === "Missed")
    || (item.type === "task" && status === "Overdue");
}

export function getItemSortRank(item: ReminderItem, now = new Date()): number {
  const status = getItemStatus(item, now);
  if (status === "Pending" || status === "Upcoming" || status === "Ongoing") return 0;
  if (status === "Missed" || status === "Overdue") return 1;
  return 2;
}

export function sortItemsByStatus(items: ReminderItem[], now = new Date()): ReminderItem[] {
  return items
    .map((item, index) => ({ item, index, rank: getItemSortRank(item, now) }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ item }) => item);
}
