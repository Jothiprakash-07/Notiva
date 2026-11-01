import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { scheduleItemNotifications, cancelNotifications, getNotificationSettings } from "./notificationService";
import { nativeAlarm, NATIVE_ALARM_PREFIX } from "./nativeAlarm";
import { accountAlarmId, localAlarmItemId } from "./itemAccount";
import { readSharedStorage, writeSharedStorage } from "./sharedCache";
import type { SharedEntry } from "../types/shared";
import type { ReminderItem } from "../types/item";
import { deriveSharedOccurrence, isSharedRecurring } from "../utils/sharedRecurrence";
type AlarmRecord = { account: string; org: string; item: string; occurrenceKey?: string; nativeRecurring?: boolean; fingerprint: string; ids: string[] };
const registryKey = "notiva.shared.alarm.registry.v1";
export const sharedAlarmItemId = (org: string, item: string, occurrenceKey?: string) => `notiva-shared[${encodeURIComponent(org)}]::${encodeURIComponent(item)}${occurrenceKey ? `::occ[${encodeURIComponent(occurrenceKey)}]` : ""}`;
export function parseSharedAlarmId(value: string) {
  const local = localAlarmItemId(value);
  const match = local?.match(/^notiva-shared\[([^\]]+)\]::([^:]+)(?:::occ\[([^\]]+)\])?$/);
  if (!match) return undefined;
  try { return { organizationId: decodeURIComponent(match[1]), itemId: decodeURIComponent(match[2]), ...(match[3] ? { occurrenceKey: decodeURIComponent(match[3]) } : {}) }; } catch { return undefined; }
}
const nativeId = (row: AlarmRecord) => `${NATIVE_ALARM_PREFIX}${accountAlarmId(sharedAlarmItemId(row.org, row.item, row.nativeRecurring ? undefined : row.occurrenceKey), row.account)}`;
let operations: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>) { const result = operations.catch(() => undefined).then(work); operations = result.catch(() => undefined); return result; }
async function remove(row: AlarmRecord) {
  if (Platform.OS === "web") return;
  const payload = accountAlarmId(sharedAlarmItemId(row.org, row.item, row.occurrenceKey), row.account);
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const ids = new Set([...row.ids, ...scheduled.filter(request => request.content.data?.itemId === payload).map(request => request.identifier)]);
  if (Platform.OS === "android") ids.add(nativeId(row));
  await cancelNotifications([...ids]);
  const remaining = await Notifications.getAllScheduledNotificationsAsync();
  if (remaining.some(request => request.content.data?.itemId === payload)) throw new Error("Could not cancel a shared alert. Retry refresh.");
}
export function clearSharedAlarms(account: string, org?: string) {
  return serialize(async () => {
    const rows = await readSharedStorage<AlarmRecord[]>(registryKey, []);
    for (const row of rows.filter(row => row.account === account && (!org || row.org === org))) {
      await remove(row); rows.splice(rows.indexOf(row), 1); await writeSharedStorage(registryKey, rows);
    }
  });
}
export function clearSharedAlarmItem(account: string, org: string, item: string) {
  return serialize(async () => {
    const rows = await readSharedStorage<AlarmRecord[]>(registryKey, []);
    const row = rows.find(row => row.account === account && row.org === org && row.item === item);
    if (row) { await remove(row); await writeSharedStorage(registryKey, rows.filter(current => current !== row)); }
  });
}
export async function sharedScheduledItemIds(account: string, org: string) {
  return (await readSharedStorage<AlarmRecord[]>(registryKey, [])).filter(row => row.account === account && row.org === org).map(row => row.item);
}
export function pruneSharedAlarms(account: string, activeOrganizations: string[]) {
  return serialize(async () => {
    const rows = await readSharedStorage<AlarmRecord[]>(registryKey, []);
    for (const row of [...rows]) if (row.account === account && !activeOrganizations.includes(row.org)) {
      await remove(row); rows.splice(rows.indexOf(row), 1); await writeSharedStorage(registryKey, rows);
    }
  });
}
export function clearOtherSharedAlarms(account: string) {
  return serialize(async () => {
    const rows = await readSharedStorage<AlarmRecord[]>(registryKey, []);
    for (const row of [...rows]) if (row.account !== account) {
      await remove(row); rows.splice(rows.indexOf(row), 1); await writeSharedStorage(registryKey, rows);
    }
  });
}
export function reconcileSharedAlarms(account: string, org: string, entries: SharedEntry[], active: () => boolean = () => true) {
  return serialize(async () => {
    const rows = await readSharedStorage<AlarmRecord[]>(registryKey, []);
    const desired = new Map(entries.map(entry => deriveSharedOccurrence(entry, entry.pendingOccurrenceActions)).filter(entry => entry.item.organizationId === org && entry.recipient?.userId === account &&
      entry.recipient.accessStatus === "active" && entry.item.status === "active" && entry.alarm?.eligible && Date.parse(entry.alarm.startAt ?? entry.item.schedule.startAt) > Date.now()).map(entry => [entry.item.id, entry]));
    for (const row of [...rows]) if (row.account === account && row.org === org && !desired.has(row.item)) {
      await remove(row); rows.splice(rows.indexOf(row), 1); await writeSharedStorage(registryKey, rows);
    }
    for (const [id, entry] of desired) {
      if (!active()) return;
      const nativeRecurring = Platform.OS === "android" && isSharedRecurring(entry);
      const fingerprint = JSON.stringify({ key: entry.alarm?.key, nativeRecurring, recurrence: entry.item.recurrence, type: entry.item.type, title: entry.item.title, description: entry.item.description, schedule: entry.item.schedule });
      let row = rows.find(row => row.account === account && row.org === org && row.item === id);
      if (row?.fingerprint === fingerprint && row.ids.length) {
        const exists = Platform.OS === "android" ? await nativeAlarm().hasSchedule?.(nativeId(row)) !== false : Platform.OS === "web" ||
          (await Notifications.getAllScheduledNotificationsAsync()).some(request => request.identifier === row!.ids.at(-1));
        if (exists) continue;
      }
      if (!row) { row = { account, org, item: id, fingerprint: "", ids: [] }; rows.push(row); }
      // Journal identity before side effects. Recovery can find an interrupted
      // iOS schedule by payload and Android by deterministic PendingIntent ID.
      await writeSharedStorage(registryKey, rows); await remove(row); row.ids = []; row.fingerprint = "";
      row.occurrenceKey = entry.alarm?.occurrenceKey;
      row.nativeRecurring = nativeRecurring;
      await writeSharedStorage(registryKey, rows);
      if (!active()) return;
      const item: ReminderItem = { id: sharedAlarmItemId(org, id, row.occurrenceKey), type: entry.item.type,
        title: `Shared · ${entry.item.title}`, description: entry.item.description, ...entry.item.schedule,
        startAt: entry.alarm?.startAt ?? entry.item.schedule.startAt, endAt: entry.alarm?.endAt ?? entry.item.schedule.endAt,
        repeat: "none", notificationIds: [], createdAt: entry.item.createdAt, updatedAt: entry.item.updatedAt };
      if (nativeRecurring) {
        const bridge = nativeAlarm();
        if (!(await bridge.sharedRecurrenceVersion?.())) throw new Error("Shared recurring alarms require the new Android build. Rebuild and reopen Notiva.");
        const settings = await getNotificationSettings();
        const baseItemId = accountAlarmId(sharedAlarmItemId(org, id), account);
        row.ids = [await bridge.schedule(JSON.stringify({
          id: nativeId(row), itemId: accountAlarmId(item.id, account), title: item.title, description: item.description, itemType: item.type,
          startAt: Date.parse(entry.item.schedule.startAt), repeat: entry.item.recurrence!.repeat,
          preAlertMinutes: item.alertBefore?.minutes ?? 0, preAlertIds: [], vibration: settings.vibration, alarmSound: settings.alarmSound,
          sharedRecurrence: { version: 1, active: true, baseItemId, organizationId: org, sharedItemId: id, timeZone: entry.item.recurrence!.timeZone,
            anchorAt: Date.parse(entry.item.schedule.startAt), effectiveFrom: Date.parse(entry.item.recurrence!.effectiveFrom ?? entry.item.schedule.startAt),
            scheduleRevision: entry.item.scheduleRevision, weeklyDays: entry.item.recurrence!.weeklyDays,
            notBefore: Date.parse(entry.alarm!.startAt!) },
        }))];
      } else row.ids = Platform.OS === "web" ? [] : await scheduleItemNotifications(item, false, account);
      if (!active()) { await remove(row); rows.splice(rows.indexOf(row), 1); }
      else row.fingerprint = fingerprint;
      await writeSharedStorage(registryKey, rows);
    }
  });
}
