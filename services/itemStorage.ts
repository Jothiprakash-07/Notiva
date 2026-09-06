import { Platform } from "react-native";
import { ReminderItem } from "../types/item";
import { getItemStatus, isItemReadOnly } from "../utils/itemStatus";
import { cancelNotifications, scheduleItemNotifications } from "./notificationService";

const KEY = "notiva.items.v1";
let writes: Promise<unknown> = Promise.resolve();

async function read(): Promise<ReminderItem[]> {
  let raw: string | null = null;
  if (Platform.OS === "web") {
    raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
  } else {
    const { File, Paths } = await import("expo-file-system");
    const file = new File(Paths.document, `${KEY}.json`);
    raw = file.exists ? await file.text() : null;
  }
  return raw ? JSON.parse(raw) : [];
}

async function persist(items: ReminderItem[]) {
  const raw = JSON.stringify(items);
  if (Platform.OS === "web") {
    localStorage.setItem(KEY, raw);
  } else {
    const { File, Paths } = await import("expo-file-system");
    new File(Paths.document, `${KEY}.json`).write(raw);
  }
}

function mutate<T>(action: () => Promise<T>): Promise<T> {
  const result = writes.then(action);
  writes = result.catch(() => undefined);
  return result;
}

export async function getItems() { await writes; return read(); }
export async function getItemById(id: string) { return (await getItems()).find((item) => item.id === id); }
export function saveItem(item: ReminderItem) {
  return mutate(async () => { const items = await read(); await persist([...items, item]); return item; });
}
export function updateItem(item: ReminderItem) {
  return mutate(async () => {
    const items = await read();
    const existing = items.find((current) => current.id === item.id);
    if (!existing || isItemReadOnly(existing)) throw new Error("This item is read-only.");
    if (item.status === "Cancelled") await cancelNotifications(existing.notificationIds);
    const next = item.status === "Cancelled" ? { ...item, notificationIds: [] } : item;
    await persist(items.map((current) => current.id === item.id ? next : current));
    return next;
  });
}
export function deleteItem(id: string) {
  return mutate(async () => {
    const items = await read();
    const item = items.find((current) => current.id === id);
    if (item) await cancelNotifications(item.notificationIds);
    await persist(items.filter((current) => current.id !== id));
  });
}
export function toggleComplete(id: string) {
  return mutate(async () => {
    const items = await read();
    const item = items.find((current) => current.id === id);
    const status = item ? getItemStatus(item) : undefined;
    if (!item || !status || !["Pending", "Missed", "Overdue"].includes(status) || !["reminder", "task"].includes(item.type)) return item;
    await cancelNotifications(item.notificationIds);
    const next: ReminderItem = { ...item, completed: true, actionResolved: true, status: "Done", notificationIds: [], updatedAt: new Date().toISOString() };
    await persist(items.map((current) => current.id === id ? next : current));
    return next;
  });
}

export function resolveItemAction(id: string) {
  return mutate(async () => {
    const items = await read();
    const item = items.find((current) => current.id === id);
    if (!item) throw new Error("Item not found.");
    const next: ReminderItem = {
      ...item,
      actionResolved: true,
      updatedAt: new Date().toISOString(),
    };
    await persist(items.map((current) => current.id === id ? next : current));
    return next;
  });
}

export function rescheduleItem(item: ReminderItem) {
  return mutate(async () => {
    const items = await read();
    const existing = items.find((current) => current.id === item.id);
    if (!existing || !["reminder", "task"].includes(existing.type) || isItemReadOnly(existing)) {
      throw new Error("This item cannot be rescheduled.");
    }
    const start = new Date(item.startAt).getTime();
    const alert = start - item.alertBefore.minutes * 60000;
    if (!Number.isFinite(start) || start <= Date.now() || !Number.isFinite(alert) || alert <= Date.now()) {
      throw new Error("Choose a future date, time and alert time.");
    }
    const next: ReminderItem = { ...item, id: existing.id, type: existing.type, createdAt: existing.createdAt, completed: false, actionResolved: false, status: undefined, notificationIds: [], updatedAt: new Date().toISOString() };
    await cancelNotifications(existing.notificationIds);
    next.notificationIds = await scheduleItemNotifications(next);
    try {
      await persist(items.map((current) => current.id === existing.id ? next : current));
    } catch (error) {
      await cancelNotifications(next.notificationIds);
      throw error;
    }
    return next;
  });
}
