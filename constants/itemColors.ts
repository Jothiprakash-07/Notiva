import { ItemStatus, Priority } from "../types/item";

type BadgeColors = { backgroundColor: string; color: string };
const green = { backgroundColor: "#DCFCE7", color: "#15803D" };
const orange = { backgroundColor: "#FEF3C7", color: "#B45309" };
const red = { backgroundColor: "#FEE2E2", color: "#B91C1C" };

export const priorityColors: Record<Priority, BadgeColors> = {
  High: red, Medium: orange, Low: green,
};
export const statusColors: Record<ItemStatus, BadgeColors> = {
  Done: green, Pending: orange, Missed: red, Overdue: red,
  Upcoming: { backgroundColor: "#EDE9FE", color: "#5B21B6" },
  Ongoing: { backgroundColor: "#DBEAFE", color: "#1D4ED8" },
  Completed: green,
  Cancelled: { backgroundColor: "#E5E7EB", color: "#4B5563" },
};
