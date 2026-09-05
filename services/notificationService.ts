import * as Notifications from "expo-notifications";
import { Alert, Linking, Platform } from "react-native";
import { ReminderItem } from "../types/item";
import { isItemReadOnly } from "../utils/itemStatus";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let requestedThisSession = false;
const channel = () => Platform.OS === "android" ? { channelId: "reminders" } : {};
function debug(values: Record<string, unknown>) {
  if (__DEV__) console.log("[Notification]", values);
}
function disabledMessage() {
  Alert.alert("Notifications disabled", "Notifications are disabled. Enable them from device settings to receive reminders.", [
    { text: "Not now", style: "cancel" },
    { text: "Open settings", onPress: () => { void Linking.openSettings().catch(() => undefined); } },
  ]);
}

export async function prepareNotifications(): Promise<boolean> {
  if (Platform.OS === "web") {
    Alert.alert("Notifications unavailable", "Local reminder notifications require the Android or iOS app.");
    return false;
  }
  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("reminders", {
        name: "Reminders", importance: Notifications.AndroidImportance.HIGH,
        sound: "default", enableVibrate: true, vibrationPattern: [0, 250, 250, 250],
      });
    }
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain && !requestedThisSession) {
      requestedThisSession = true;
      permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
    }
    debug({ permissionStatus: permission.status, iosStatus: permission.ios?.status });
    if (!permission.granted) { disabledMessage(); return false; }
    if (Platform.OS === "android") {
      const configured = await Notifications.getNotificationChannelAsync("reminders");
      if (configured && configured.importance < Notifications.AndroidImportance.HIGH) {
        Alert.alert("Reminder banners disabled", "Enable alerts and sound for the Reminders notification channel in device settings.");
      }
    }
    return true;
  } catch (error) {
    console.warn("Notification permission setup failed:", error);
    Alert.alert("Notifications unavailable", "Could not prepare notifications. Check device notification settings and try again.");
    return false;
  }
}

export async function cancelNotifications(ids: string[] = []) {
  if (!ids.length) return;
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
}

export function notificationDateFor(item: ReminderItem): Date {
  return new Date(new Date(item.startAt).getTime() - item.alertBefore.minutes * 60000);
}

export function createTriggers(item: ReminderItem): Notifications.SchedulableNotificationTriggerInput[] {
  const date = notificationDateFor(item);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid reminder date.");
  const time = { hour: date.getHours(), minute: date.getMinutes(), ...channel() };
  const types = Notifications.SchedulableTriggerInputTypes;
  switch (item.repeat) {
    case "daily": return [{ type: types.DAILY, ...time }];
    case "weekly": return [{ type: types.WEEKLY, weekday: date.getDay() + 1, ...time }];
    case "weekdays": {
      // Shift weekdays when an alert offset crosses midnight.
      const start = new Date(item.startAt);
      const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
      const alertDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
      const shift = Math.round((alertDay - startDay) / 86400000);
      return [1, 2, 3, 4, 5].map((day) => ({ type: types.WEEKLY, weekday: ((day + shift) % 7 + 7) % 7 + 1, ...time }));
    }
    case "monthly": return [{ type: types.MONTHLY, day: date.getDate(), ...time }];
    case "yearly": return [{ type: types.YEARLY, month: date.getMonth(), day: date.getDate(), ...time }];
    default: return date.getTime() > Date.now() ? [{ type: types.DATE, date, ...channel() }] : [];
  }
}

export async function scheduleItemNotifications(item: ReminderItem): Promise<string[]> {
  if (isItemReadOnly(item)) return [];
  const ids: string[] = [];
  try {
    const scheduledFor = notificationDateFor(item);
    debug({ title: item.title, startAt: item.startAt, alertMinutes: item.alertBefore.minutes, scheduledFor: scheduledFor.toString(), currentTime: new Date().toString() });
    const triggers = createTriggers(item);
    if (!triggers.length) {
      Alert.alert("Alert time has passed", "This item will be saved without a notification. Choose a future alert time to receive a reminder.");
      return [];
    }
    if (!(await prepareNotifications())) return [];
    for (const trigger of triggers) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: item.title, body: item.description.trim() || `It's time for ${item.title}.`,
          sound: "default", priority: Notifications.AndroidNotificationPriority.HIGH,
          data: { itemId: item.id, itemType: item.type },
        }, trigger,
      });
      ids.push(id);
      debug({ notificationId: id, trigger });
    }
    return ids;
  } catch (error) {
    await cancelNotifications(ids).catch((failure) => console.warn("Notification cleanup failed", failure));
    console.warn("Failed to schedule notification:", error);
    Alert.alert("Reminder alert unavailable", "The item can be saved, but its alert could not be scheduled. Check notification and Alarms & reminders permissions in device settings, then edit the item to try again.");
    return [];
  }
}

// Invoke from the development console; never exposed in production UI.
export async function scheduleTestNotification(): Promise<string | undefined> {
  if (!__DEV__) return undefined;
  if (!(await prepareNotifications())) return undefined;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: "Notification Test", body: "Five-second local notification test.", sound: "default", priority: Notifications.AndroidNotificationPriority.HIGH, data: { itemId: "dev-test", itemType: "reminder" } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, repeats: false, ...channel() },
    });
    debug({ notificationId: id, seconds: 5, currentTime: new Date().toString() });
    return id;
  } catch (error) {
    console.warn("Test notification failed", error);
    Alert.alert("Test failed", "Could not schedule the test notification. Check device notification settings.");
    return undefined;
  }
}
