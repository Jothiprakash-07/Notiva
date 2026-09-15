import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { nativeAlarm, NATIVE_ALARM_PREFIX, scheduleNativeAlarm } from "./nativeAlarm";

import { ReminderItem } from "../types/item";

import {
  getItemStatus,
  isItemReadOnly,
} from "../utils/itemStatus";

import {
  cancelNotifications,
  scheduleItemNotifications,
  getNotificationSettings,
} from "./notificationService";

const KEY = "notiva.items.v1";

/** Upgrade already-saved Expo main alerts once, retaining their pre-alerts. */
export function migrateAndroidMainAlarms() {
  if (Platform.OS !== "android") return Promise.resolve();
  return mutate(async () => {
    if (!(await nativeAlarm().canSchedule()) || !(await Notifications.getPermissionsAsync()).granted) return;
    const items = await read();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const settings = await getNotificationSettings();
    for (const item of items) {
      if (isItemReadOnly(item) || !item.notificationIds.length || item.notificationIds.some(id => id.startsWith(NATIVE_ALARM_PREFIX))) continue;
      if ((!item.repeat || item.repeat === "none") && new Date(item.startAt).getTime() <= Date.now()) continue;
      const requests = scheduled.filter(request => request.content.data?.itemId === item.id);
      const preIds = requests.filter(request => request.content.data?.alertType === "pre-alert").map(request => request.identifier);
      const oldMainIds = requests.filter(request => request.content.data?.alertType !== "pre-alert").map(request => request.identifier);
      const nativeId = await scheduleNativeAlarm(item, settings.vibration, preIds);
      try {
        await cancelNotifications(oldMainIds);
        item.notificationIds = [...preIds, nativeId];
        await persist(items);
      } catch (error) {
        await nativeAlarm().cancel(nativeId);
        throw error;
      }
    }
  });
}

let writes: Promise<unknown> =
  Promise.resolve();

async function read(): Promise<
  ReminderItem[]
> {
  let raw: string | null = null;

  if (Platform.OS === "web") {
    raw =
      typeof localStorage === "undefined"
        ? null
        : localStorage.getItem(KEY);
  } else {
    const {
      File,
      Paths,
    } = await import(
      "expo-file-system"
    );

    const file = new File(
      Paths.document,
      `${KEY}.json`
    );

    raw = file.exists
      ? await file.text()
      : null;
  }

  return raw
    ? JSON.parse(raw)
    : [];
}

async function persist(
  items: ReminderItem[]
) {
  const raw =
    JSON.stringify(items);

  if (Platform.OS === "web") {
    localStorage.setItem(
      KEY,
      raw
    );

    return;
  }

  const {
    File,
    Paths,
  } = await import(
    "expo-file-system"
  );

  const file = new File(
    Paths.document,
    `${KEY}.json`
  );

  file.write(raw);
}

function mutate<T>(
  action: () => Promise<T>
): Promise<T> {
  const result =
    writes.then(action);

  writes = result.catch(
    () => undefined
  );

  return result;
}

export async function getItems() {
  await writes;

  return read();
}

export async function getItemById(
  id: string
) {
  const items =
    await getItems();

  return items.find(
    (item) =>
      item.id === id
  );
}

export function saveItem(
  item: ReminderItem
) {
  return mutate(
    async () => {
      const items =
        await read();

      await persist([
        ...items,
        item,
      ]);

      return item;
    }
  );
}

export function updateItem(
  item: ReminderItem
) {
  return mutate(
    async () => {
      const items =
        await read();

      const existing =
        items.find(
          (current) =>
            current.id ===
            item.id
        );

      if (
        !existing ||
        isItemReadOnly(
          existing
        )
      ) {
        throw new Error(
          "This item is read-only."
        );
      }

      if (
        item.status ===
        "Cancelled"
      ) {
        await cancelNotifications(
          existing.notificationIds
        );
      }

      const next =
        item.status ===
        "Cancelled"
          ? {
              ...item,
              notificationIds:
                [],
            }
          : item;

      await persist(
        items.map(
          (current) =>
            current.id ===
            item.id
              ? next
              : current
        )
      );

      return next;
    }
  );
}

export function deleteItem(
  id: string
) {
  return mutate(
    async () => {
      const items =
        await read();

      const item =
        items.find(
          (current) =>
            current.id === id
        );

      if (item) {
        await cancelNotifications(
          item.notificationIds
        );
      }

      await persist(
        items.filter(
          (current) =>
            current.id !== id
        )
      );
    }
  );
}

export function toggleComplete(
  id: string,
  completionNote?: string
) {
  return mutate(
    async () => {
      const items =
        await read();

      const item =
        items.find(
          (current) =>
            current.id === id
        );

      const status =
        item
          ? getItemStatus(
              item
            )
          : undefined;

      if (
        !item ||
        !status ||
        ![
          "Pending",
          "Missed",
          "Overdue",
        ].includes(
          status
        ) ||
        ![
          "reminder",
          "task",
        ].includes(
          item.type
        )
      ) {
        return item;
      }

      /*
       * Stop all remaining scheduled
       * notifications when item is Done.
       */
      await cancelNotifications(
        item.notificationIds
      );

      /*
       * Completion note is optional.
       * Empty spaces are treated as no note.
       */
      const cleanedNote =
        completionNote?.trim();

      const next: ReminderItem =
        {
          ...item,

          completed: true,

          actionResolved:
            true,

          status: "Done",

          completionNote:
            cleanedNote ||
            undefined,

          notificationIds:
            [],

          updatedAt:
            new Date().toISOString(),
        };

      await persist(
        items.map(
          (current) =>
            current.id === id
              ? next
              : current
        )
      );

      return next;
    }
  );
}

export function resolveItemAction(
  id: string
) {
  return mutate(
    async () => {
      const items =
        await read();

      const item =
        items.find(
          (current) =>
            current.id === id
        );

      if (!item) {
        throw new Error(
          "Item not found."
        );
      }

      const status =
        getItemStatus(item);

      const canResolve =
        ["reminder", "task"].includes(
          item.type
        ) &&
        ["Missed", "Overdue"].includes(
          status
        );

      if (!canResolve) {
        throw new Error(
          "This item does not require an action."
        );
      }

      const next: ReminderItem =
        {
          ...item,

          actionResolved:
            true,

          updatedAt:
            new Date().toISOString(),
        };

      await persist(
        items.map(
          (current) =>
            current.id === id
              ? next
              : current
        )
      );

      return next;
    }
  );
}

export function rescheduleItem(
  item: ReminderItem
) {
  return mutate(
    async () => {
      const items =
        await read();

      const existing =
        items.find(
          (current) =>
            current.id ===
            item.id
        );

      if (
        !existing ||
        ![
          "reminder",
          "task",
        ].includes(
          existing.type
        ) ||
        isItemReadOnly(
          existing
        )
      ) {
        throw new Error(
          "This item cannot be rescheduled."
        );
      }

      const start =
        new Date(
          item.startAt
        ).getTime();

      const alert =
        start -
        item.alertBefore
          .minutes *
          60_000;

      if (
        !Number.isFinite(
          start
        ) ||
        start <= Date.now() ||
        !Number.isFinite(
          alert
        ) ||
        alert <= Date.now()
      ) {
        throw new Error(
          "Choose a future date, time and alert time."
        );
      }

      const next: ReminderItem =
        {
          ...item,

          id: existing.id,

          type:
            existing.type,

          createdAt:
            existing.createdAt,

          completed: false,

          actionResolved:
            false,

          /*
           * Rescheduled item becomes
           * active again, so remove any
           * previous completion note.
           */
          completionNote:
            undefined,

          status: undefined,

          notificationIds:
            [],

          updatedAt:
            new Date().toISOString(),
        };

      await cancelNotifications(
        existing.notificationIds
      );

      /*
       * Keep original item if
       * scheduling fails.
       */
      await persist(
        items.map(
          (current) =>
            current.id ===
            existing.id
              ? {
                  ...existing,
                  notificationIds:
                    [],
                }
              : current
        )
      );

      next.notificationIds =
        await scheduleItemNotifications(
          next,
          true
        );

      try {
        await persist(
          items.map(
            (current) =>
              current.id ===
              existing.id
                ? next
                : current
          )
        );
      } catch (error) {
        await cancelNotifications(
          next.notificationIds
        );

        throw error;
      }

      return next;
    }
  );
}
