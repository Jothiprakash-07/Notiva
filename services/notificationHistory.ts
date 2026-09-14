import type { Notification } from "expo-notifications";
import { Platform } from "react-native";
import type { ItemType } from "../types/item";

export type NotificationHistoryEntry = {
  id: string;
  itemId: string;
  itemType: ItemType;
  title: string;
  body?: string;
  firedAt: string;
  read: boolean;
  notificationRequestId: string;
};

type History = { entries: NotificationHistoryEntry[]; clearedThrough: number };
const KEY = "notiva.notification.history.v1";
const MAX_ENTRIES = 200;
const listeners = new Set<() => void>();
let writes: Promise<unknown> = Promise.resolve();

export function subscribeNotificationHistory(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

async function read(): Promise<History> {
  let raw: string | null;
  if (Platform.OS === "web") {
    raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
  } else {
    const { File, Paths } = await import("expo-file-system");
    const file = new File(Paths.document, `${KEY}.json`);
    raw = file.exists ? await file.text() : null;
  }
  return raw ? JSON.parse(raw) : { entries: [], clearedThrough: 0 };
}

async function persist(history: History) {
  history.entries.sort((a, b) => Date.parse(b.firedAt) - Date.parse(a.firedAt));
  history.entries = history.entries.slice(0, MAX_ENTRIES);
  const raw = JSON.stringify(history);
  if (Platform.OS === "web") {
    localStorage.setItem(KEY, raw);
  } else {
    const { File, Paths } = await import("expo-file-system");
    new File(Paths.document, `${KEY}.json`).write(raw);
  }
  listeners.forEach(listener => listener());
}

function mutate(action: (history: History) => void) {
  const result = writes.then(async () => {
    const history = await read();
    action(history);
    await persist(history);
  });
  writes = result.catch(() => undefined);
  return result;
}

export async function getNotificationHistory() {
  await writes;
  const history = await read();
  return history.entries.sort((a, b) => Date.parse(b.firedAt) - Date.parse(a.firedAt));
}

// Only accept actual OS observations, never scheduled requests or calculated due dates.
export function recordNotification(notification: Notification, read = false) {
  const { identifier, content } = notification.request;
  const { itemId, itemType } = content.data ?? {};
  // SDK 54's iOS serializer returns Unix seconds; Android returns milliseconds.
  const deliveredAt = Platform.OS === "ios" ? notification.date * 1000 : notification.date;
  if (typeof itemId !== "string" || !itemId.trim() || itemId === "dev-test" ||
      !["reminder", "task", "event", "birthday"].includes(String(itemType)) ||
      !identifier || !Number.isFinite(notification.date) || notification.date <= 0 ||
      !Number.isFinite(new Date(deliveredAt).getTime())) return Promise.resolve();

  // Recurring requests reuse their identifier. The OS delivery date identifies
  // each occurrence while received/response/tray observations of it deduplicate.
  const id = JSON.stringify([identifier, deliveredAt]);
  return mutate(history => {
    if (deliveredAt <= history.clearedThrough) return;
    const existing = history.entries.find(entry => entry.id === id);
    if (existing) {
      existing.read ||= read;
      return;
    }
    history.entries.push({
      id, itemId, itemType: itemType as ItemType,
      title: content.title || "Notification",
      body: content.body || undefined,
      firedAt: new Date(deliveredAt).toISOString(),
      read, notificationRequestId: identifier,
    });
  });
}

export function markNotificationRead(id: string) {
  return mutate(history => {
    const entry = history.entries.find(entry => entry.id === id);
    if (entry) entry.read = true;
  });
}

export function clearNotificationHistory() {
  const clearedAt = Date.now();
  return mutate(history => {
    // Prevent old tray entries or cold-start responses from restoring cleared history.
    history.clearedThrough = Math.max(history.clearedThrough, clearedAt,
      ...history.entries.map(entry => Date.parse(entry.firedAt)));
    history.entries = [];
  });
}
