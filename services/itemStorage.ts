import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { nativeAlarm, NATIVE_ALARM_PREFIX } from "./nativeAlarm";

import { ReminderItem } from "../types/item";
import { getItemAccount, accountAlarmId, localAlarmItemId } from "./itemAccount";
import { commitLocalItems, readItemSyncState, transactItemState } from "./itemSyncQueue";
import type { ServerItemDeletion } from "./itemSyncQueue";
import { attachDailySeries, dailyTemplate, localDateKey, materializeDaily } from "../utils/dailyRecurrence";
import { alignWeeklyItem } from "../utils/weeklyRecurrence";

import {
  getItemStatus,
  isItemReadOnly,
  findScheduleConflicts,
} from "../utils/itemStatus";

import {
  cancelNotifications,
  scheduleItemNotifications,
} from "./notificationService";

const KEY = "notiva.items.v1";
let taskAccount: string | null | undefined;
const restoreListeners = new Set<() => void>();
export function subscribeItemRestore(listener: () => void) {
  restoreListeners.add(listener);
  return () => { restoreListeners.delete(listener); };
}

/** Upgrade already-saved Expo main alerts once, retaining their pre-alerts. */
export function migrateAndroidMainAlarms() {
  if (Platform.OS !== "android") return Promise.resolve();
  return mutate(async () => {
    if (!(await nativeAlarm().canSchedule()) || !(await Notifications.getPermissionsAsync()).granted) return;
    const items = await read();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const item of items) {
      if (item.seriesId) continue; // Daily reconciliation owns its series alarm.
      if (isItemReadOnly(item) || !item.notificationIds.length || item.notificationIds.some(id => id.startsWith(NATIVE_ALARM_PREFIX))) continue;
      if ((!item.repeat || item.repeat === "none") && new Date(item.startAt).getTime() <= Date.now()) continue;
      const requests = scheduled.filter(request => request.content.data?.itemId === item.id);
      const preIds = requests.filter(request => request.content.data?.alertType === "pre-alert").map(request => request.identifier);
      const oldMainIds = requests.filter(request => request.content.data?.alertType !== "pre-alert").map(request => request.identifier);
      const nativeIds = await scheduleItemNotifications(item, true, taskAccount);
      const nativeId = nativeIds[0];
      try {
        await cancelNotifications([...preIds, ...oldMainIds]);
        item.notificationIds = nativeIds;
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
  if (taskAccount === null) return [];
  if (taskAccount) {
    const state = await readItemSyncState(taskAccount);
    // Repair retained anchors hidden by older delete code that queued PATCH.
    if (state.items.some(item => item.dailyHidden && item.dailySeries && !Object.hasOwn(state.tombstones, item.id))) {
      await commitLocalItems(taskAccount, state.items);
      return (await readItemSyncState(taskAccount)).items;
    }
    return state.items;
  }
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
  if (taskAccount === null) throw new Error("Sign in before saving personal items.");
  if (taskAccount) { await commitLocalItems(taskAccount, items); return; }
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
  const account = getItemAccount();
  const result =
    writes.then(async () => {
      taskAccount = account;
      if (account !== getItemAccount()) throw new Error("The active account changed. Try again.");
      return action();
    });

  writes = result.catch(
    () => undefined
  );

  return result;
}

async function reconcileDaily(items: ReminderItem[], interactive = false): Promise<ReminderItem[]> {
  // Upgrade active legacy Daily rows once; don't revive previously completed series.
  const next = materializeDaily(items.map(item =>
    ["daily", "weekly", "weekdays"].includes(item.repeat) && !item.seriesId && !isItemReadOnly(item) ? attachDailySeries(item) : item));
  if (JSON.stringify(next) !== JSON.stringify(items)) await persist(next);
  for (const root of next) {
    const series = root.dailySeries;
    if (series?.active && !series.dirty && Platform.OS === "android") {
      try {
        if (await nativeAlarm().hasSchedule?.(`${NATIVE_ALARM_PREFIX}${series.repeat ?? "daily"}-series:${accountAlarmId(root.id, taskAccount)}`) === false) {
          series.dirty = true;
          await persist(next);
        }
      } catch { /* Retry silently on the next read when the native bridge is ready. */ }
    }
    if (!series?.dirty) continue;
    if (!interactive && series.active) {
      // Reconciliation is silent. Permission explanations belong to explicit saves.
      if (Platform.OS === "web") continue;
      try {
        if (!(await Notifications.getPermissionsAsync()).granted ||
          (Platform.OS === "android" && !(await nativeAlarm().canSchedule()))) continue;
      } catch { continue; }
    }
    try {
      // The deterministic master ID also covers a crash after OS scheduling but
      // before the returned ID was persisted to the item file.
      const previous = [...series.notificationIds, ...(Platform.OS === "android"
        ? [`${NATIVE_ALARM_PREFIX}daily-series:${accountAlarmId(root.id, taskAccount)}`, `${NATIVE_ALARM_PREFIX}weekly-series:${accountAlarmId(root.id, taskAccount)}`, `${NATIVE_ALARM_PREFIX}weekdays-series:${accountAlarmId(root.id, taskAccount)}`] : [])];
      const ids = series.active ? await scheduleItemNotifications({
        ...root, ...series.template, repeat: series.repeat ?? "daily", completed: false, status: undefined,
        notificationIds: [],
      }, !interactive, taskAccount) : [];
      await cancelNotifications(previous.filter(id => !ids.includes(id)));
      series.notificationIds = ids;
      series.dirty = series.active && ids.length === 0;
      await persist(next);
    } catch (error) {
      // The durable dirty flag retries interrupted scheduling on the next read.
      console.warn("Could not reconcile recurring alarms:", error);
    }
  }
  return next;
}

async function reconcileRestored(items: ReminderItem[], active: () => boolean) {
    // Existing recurrence reconciler owns recurring schedule deduplication.
    for (const item of items) {
      if (!active()) return;
      if (!item.restoreNeedsScheduling || item.seriesId || ["daily", "weekly", "weekdays"].includes(item.repeat)) continue;
      try {
        const previous = item.notificationIds;
        const ids = isItemReadOnly(item) || (item.repeat === "none" && new Date(item.startAt).getTime() <= Date.now())
          ? [] : await scheduleItemNotifications(item, true, taskAccount);
        await cancelNotifications(previous.filter(id => !ids.includes(id)));
        item.notificationIds = ids; item.restoreNeedsScheduling = false; await persist(items);
      }
      catch { /* Permission/scheduling failures retry locally on a future read. */ }
    }
}

/** Merge under the same local mutation lock used by edits and completions. */
export function applyServerDeletions(userId: string, deletions: ServerItemDeletion[], cursor: string | null,
  active: () => boolean) {
  return mutate(async () => {
    if (!active() || taskAccount !== userId) return;
    await transactItemState(userId, state => {
      if (!active()) return;
      const cancellations = new Set(state.pendingDeletionCancellations ?? []);
      for (const deletion of deletions) {
        const item = state.items.find(row => row.id === deletion.clientItemId);
        const root = item && state.items.find(row => row.id === item.seriesId);
        for (const id of item?.notificationIds ?? []) cancellations.add(id);
        if (Platform.OS === "android") cancellations.add(`${NATIVE_ALARM_PREFIX}${accountAlarmId(deletion.clientItemId, userId)}`);
        // Match local occurrence deletion, retaining the template for future
        // dates and excluding only this occurrence from the native series.
        if (item && root?.dailySeries) {
          root.dailySeries.excludedDates = [...new Set([...root.dailySeries.excludedDates, localDateKey(item.startAt)])];
          root.dailySeries.dirty = true;
          if (item.id === root.id) root.dailyHidden = true;
        }
        state.items = state.items.filter(row => row.id !== deletion.clientItemId ||
          (row.id === root?.id && Boolean(root?.dailySeries)));
        state.queue = state.queue.filter(op => op.clientItemId !== deletion.clientItemId);
        Object.defineProperty(state.tombstones, deletion.clientItemId, { value: {
          deletedAt: deletion.deletedAt, synced: true, syncStatus: "synced",
        }, enumerable: true, configurable: true, writable: true });
      }
      // Save cancellation intent together with tombstones before touching OS.
      state.pendingDeletionCancellations = [...cancellations];
    });
    if (!active()) return;
    const state = await readItemSyncState(userId);
    const pending = state.pendingDeletionCancellations ?? [];
    await cancelNotifications(pending);
    if (!active()) return;
    await reconcileDaily((await readItemSyncState(userId)).items);
    if (!active()) return;
    await transactItemState(userId, latest => {
      if (!active()) return;
      latest.pendingDeletionCancellations = (latest.pendingDeletionCancellations ?? []).filter(id => !pending.includes(id));
      if (cursor) latest.deletionCursor = cursor;
    });
    if (active() && deletions.length) restoreListeners.forEach(listener => listener());
  });
}

export function mergeServerItems(userId: string, serverItems: ReminderItem[], active: () => boolean) {
  return mutate(async () => {
    if (!active() || taskAccount !== userId) return;
    let changed = false;
    await transactItemState(userId, state => {
      if (!active()) return;
      for (const incoming of serverItems) {
        if (Object.hasOwn(state.tombstones, incoming.id) || state.queue.some(row => row.clientItemId === incoming.id)) continue;
        const index = state.items.findIndex(row => row.id === incoming.id);
        const existing = state.items[index];
        if (existing && !existing.serverRevision) continue;
        if (existing && (existing.serverRevision ?? 0) >= (incoming.serverRevision ?? 0)) continue;
        const restored: ReminderItem = { ...incoming, notificationIds: [], syncStatus: "synced", lastSyncedAt: new Date().toISOString() };
        restored.restoreNeedsScheduling = true;
        // Cloud notification handles never represent this device's schedules.
        if (restored.dailySeries) restored.dailySeries = { ...restored.dailySeries, notificationIds: [], dirty: true };
        if (existing) {
          // Preserve handles when scheduling fields haven't changed.
          const scheduleFields = ["startAt", "endAt", "repeat", "weeklyDays", "alertBefore", "completed", "status", "dailySeries"] as const;
          restored.notificationIds = existing.notificationIds;
          if (scheduleFields.every(key => JSON.stringify(existing[key]) === JSON.stringify(incoming[key]))) restored.restoreNeedsScheduling = false;
          if (restored.dailySeries && existing.dailySeries) restored.dailySeries.notificationIds = existing.dailySeries.notificationIds;
        }
        if (index < 0) state.items.push(restored); else state.items[index] = restored;
        changed = true;
      }
    });
    if (!active()) return;
    const items = await read();
    await reconcileRestored(items, active);
    await reconcileDaily(items);
    if (changed && active()) restoreListeners.forEach(listener => listener());
  });
}

export function getItems(): Promise<ReminderItem[]> {
  return mutate(async () => {
    const items = await read();
    // Remote deletion cancellation survives force-stop and can retry offline.
    if (taskAccount) {
      const userId = taskAccount;
      const pending = (await readItemSyncState(userId)).pendingDeletionCancellations ?? [];
      if (pending.length) {
        try {
          await cancelNotifications(pending);
          await transactItemState(userId, state => {
            state.pendingDeletionCancellations = (state.pendingDeletionCancellations ?? []).filter(id => !pending.includes(id));
          });
        } catch { /* Keep durable cancellation intent for the next read/sync. */ }
      }
    }
    await reconcileRestored(items, () => taskAccount === getItemAccount());
    if (Platform.OS === "android" && (await Notifications.getPermissionsAsync()).granted && await nativeAlarm().canSchedule()) {
      for (const item of items) {
        if (item.seriesId || ["daily", "weekly", "weekdays"].includes(item.repeat) || isItemReadOnly(item)) continue;
        if ((!item.repeat || item.repeat === "none") && new Date(item.startAt).getTime() <= Date.now()) continue;
        const id = `${NATIVE_ALARM_PREFIX}${accountAlarmId(item.id, taskAccount)}`;
        if (await nativeAlarm().hasSchedule?.(id) !== false && item.notificationIds.includes(id) && item.notificationIds.length === 1) continue;
        try {
          const previous = item.notificationIds;
          item.notificationIds = await scheduleItemNotifications(item, true, taskAccount);
          await cancelNotifications(previous.filter(value => !item.notificationIds.includes(value)));
          await persist(items);
        } catch { /* Retry missing/migrated pairs on the next foreground read. */ }
      }
    }
    return (await reconcileDaily(items)).filter(item => !item.dailyHidden);
  });
}

async function saveDailyEdit(items: ReminderItem[], item: ReminderItem, existing?: ReminderItem) {
  item = alignWeeklyItem(item);
  const root = items.find(row => row.id === existing?.seriesId);
  if (!root?.dailySeries) {
    const attached = attachDailySeries({ ...item, notificationIds: existing?.notificationIds ?? item.notificationIds });
    const next = existing ? items.map(row => row.id === item.id ? attached : row) : [...items, attached];
    await persist(next);
    await reconcileDaily(next, true);
    return attached;
  }
  const series = root.dailySeries;
  // Editing a dated row changes this and following occurrences, never history.
  const cutoff = new Date(existing!.startAt).getTime();
  let next = items.filter(row => row.id === root.id || row.id === item.id ||
    row.seriesId !== root.id || isItemReadOnly(row) || new Date(row.startAt).getTime() < cutoff ||
    new Date(row.startAt).getTime() <= Date.now());
  const replacement = { ...item, seriesId: root.id, dailySeries: item.id === root.id ? series : undefined };
  next = next.map(row => row.id === item.id ? replacement : row);
  series.active = ["daily", "weekly", "weekdays"].includes(item.repeat) && item.status !== "Cancelled";
  if (series.active) series.repeat = item.repeat as "daily" | "weekly" | "weekdays";
  series.template = dailyTemplate(item);
  series.templateId = item.id;
  series.dirty = true;
  const removedRows = items.filter(row => !next.some(retained => retained.id === row.id));
  const obsoleteIds = [...new Set([
    ...(existing?.notificationIds ?? []),
    ...removedRows.flatMap(row => [...row.notificationIds, ...(Platform.OS === "android"
      ? [`${NATIVE_ALARM_PREFIX}${accountAlarmId(row.id, taskAccount)}`] : [])]),
  ])];
  // Keep cleanup durable too: restart reconciliation must cancel obsolete alarms
  // even if the process dies immediately after the updated rows are written.
  series.notificationIds = [...new Set([...series.notificationIds, ...obsoleteIds])];
  await persist(next); // Save cancellation intent before touching the OS.
  // Removed projections may have standalone alarms retained by a previous edit.
  await cancelNotifications(obsoleteIds);
  // A future occurrence edit must not drop an earlier, still-pending alarm.
  // These retained dates are outside the updated series template's range.
  for (const row of next) {
    if (row.seriesId === root.id && row.id !== item.id && !isItemReadOnly(row) &&
      new Date(row.startAt).getTime() > Date.now() && new Date(row.startAt).getTime() < cutoff) {
      row.notificationIds = await scheduleItemNotifications({ ...row, repeat: "none", dailySeries: undefined }, false, taskAccount);
      await persist(next);
    }
  }
  await reconcileDaily(next, true);
  if (!series.active && item.status !== "Cancelled") {
    replacement.notificationIds = await scheduleItemNotifications({ ...replacement, dailySeries: undefined }, false, taskAccount);
    await persist(next);
  }
  return replacement;
}

export async function getItemById(
  id: string
) {
  const localId = localAlarmItemId(id);
  if (localId === undefined) return undefined;
  const items =
    await getItems();

  return items.find(
    (item) =>
      item.id === localId
  );
}

export function getScheduleConflicts(candidate: ReminderItem) {
  return mutate(async () => {
    const state = taskAccount ? await readItemSyncState(taskAccount) : undefined;
    const items = state?.items ?? await read();
    return findScheduleConflicts(items.filter(item => !state || !Object.hasOwn(state.tombstones, item.id) ||
      Boolean(item.dailyHidden && item.dailySeries)), candidate);
  });
}

export function saveItem(
  item: ReminderItem
) {
  return mutate(
    async () => {
      const items =
        await read();

      if (["daily", "weekly", "weekdays"].includes(item.repeat)) {
        const saved = items.find(row => row.id === item.id);
        return saved ?? saveDailyEdit(items, item);
      }

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

      if (existing.seriesId || ["daily", "weekly", "weekdays"].includes(item.repeat)) return saveDailyEdit(items, item, existing);

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

      const root = items.find(row => row.id === item?.seriesId);
      if (item && root?.dailySeries) {
        root.dailySeries.excludedDates = [...new Set([...root.dailySeries.excludedDates, localDateKey(item.startAt)])];
        root.dailySeries.dirty = true;
        if (Platform.OS === "android") await cancelNotifications([`${NATIVE_ALARM_PREFIX}${accountAlarmId(item.id, taskAccount)}`]);
        await cancelNotifications(item.notificationIds);
        if (item.id === root.id) root.dailyHidden = true;
        const next = items.filter(row => row.id !== id || row.id === root.id);
        await persist(next);
        await reconcileDaily(next);
        return;
      }
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
      await cancelNotifications(item.seriesId && Platform.OS === "android"
        ? [...item.notificationIds, `${NATIVE_ALARM_PREFIX}${accountAlarmId(item.id, taskAccount)}`]
        : item.notificationIds);

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
          completedAt: item.completedAt ?? new Date().toISOString(),

          completionNote:
            cleanedNote ||
            undefined,

          notificationIds:
            [],

          updatedAt:
            new Date().toISOString(),
        };

      const updated = items.map(current => current.id === id ? next : current);
      const root = updated.find(row => row.id === item.seriesId);
      if (root?.dailySeries?.active) {
        root.dailySeries.excludedDates = [...new Set([
          ...root.dailySeries.excludedDates, localDateKey(item.startAt),
        ])];
        root.dailySeries.dirty = true;
      }
      await persist(updated);
      if (root) await reconcileDaily(updated);

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

      if (
        !Number.isFinite(
          start
        ) ||
        start <= Date.now()
      ) {
        throw new Error(
          "Choose a future date and time."
        );
      }

      if (existing.seriesId || ["daily", "weekly", "weekdays"].includes(item.repeat)) return saveDailyEdit(items, {
        ...item, completed: false, actionResolved: false, status: undefined,
        completionNote: undefined, completedAt: undefined,
      }, existing);

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
          true,
          taskAccount
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
