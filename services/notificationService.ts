import * as Notifications from "expo-notifications";
import {
  Alert,
  Linking,
  Platform,
} from "react-native";

import { ReminderItem } from "../types/item";
import { isItemReadOnly } from "../utils/itemStatus";

const SETTINGS_KEY =
  "notiva.notification.settings.v1";

const ANDROID_CHANNEL_ID =
  "reminders";

/* ---------------------------------
 * Notification settings
 * --------------------------------- */

export type NotificationRepeatCount =
  | 1
  | 3
  | 5;

export type NotificationRepeatInterval =
  | 3
  | 5
  | 10;

export type NotificationSettings = {
  repeatCount: NotificationRepeatCount;
  repeatIntervalSeconds: NotificationRepeatInterval;
  vibration: boolean;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings =
  {
    repeatCount: 1,
    repeatIntervalSeconds: 5,
    vibration: true,
  };

function normalizeSettings(value: Partial<NotificationSettings> | null): NotificationSettings {
  return {
    repeatCount: [1, 3, 5].includes(value?.repeatCount as number)
      ? value!.repeatCount! : 1,
    repeatIntervalSeconds: [3, 5, 10].includes(value?.repeatIntervalSeconds as number)
      ? value!.repeatIntervalSeconds! : 5,
    vibration: typeof value?.vibration === "boolean" ? value.vibration : true,
  };
}

export const NOTIFICATION_REPEAT_OPTIONS = [
  {
    label: "1 Time",
    value: 1,
  },
  {
    label: "3 Times",
    value: 3,
  },
  {
    label: "5 Times",
    value: 5,
  },
] as const;

export const NOTIFICATION_INTERVAL_OPTIONS = [
  {
    label: "3 Seconds",
    value: 3,
  },
  {
    label: "5 Seconds",
    value: 5,
  },
  {
    label: "10 Seconds",
    value: 10,
  },
] as const;

/* ---------------------------------
 * Foreground notification behavior
 * --------------------------------- */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let requestedThisSession = false;
let explainedExactAlarmAccess = false;

// SDK 54 exposes no JS canScheduleExactAlarms API. A queued ID does not
// establish exact access: Expo falls back to an inexact native alarm.
export async function openExactAlarmSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Linking.sendIntent("android.settings.REQUEST_SCHEDULE_EXACT_ALARM");
  } catch {
    await Linking.openSettings().catch(() => {
      Alert.alert("Alarms & reminders", "Open Settings → Apps → Special app access → Alarms & reminders → Notiva (Reminder54) and allow access.");
    });
  }
}

async function verifyScheduledNotifications(ids: string[]): Promise<void> {
  if (!__DEV__) return;
  // Diagnostics must not cancel valid OS alarms if inspection itself fails.
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const missingIds = ids.filter(id => !scheduled.some(request => request.identifier === id));
    debug({ currentTime: new Date().toISOString(), scheduledCount: scheduled.length,
      notificationIds: ids, missingIds, scheduledNotifications: scheduled });
    if (missingIds.length) console.warn("[Notification] Scheduled IDs absent from OS queue:", missingIds);
  } catch (error) {
    console.warn("[Notification] Could not verify OS queue:", error);
  }
}

/* ---------------------------------
 * Helpers
 * --------------------------------- */

function debug(
  values: Record<string, unknown>
) {
  if (__DEV__) {
    console.log(
      "[Notification]",
      values
    );
  }
}

function disabledMessage() {
  Alert.alert(
    "Notifications disabled",
    "Notifications are disabled. Enable them from device settings to receive reminders.",
    [
      {
        text: "Not now",
        style: "cancel",
      },
      {
        text: "Open settings",
        onPress: () => {
          void Linking.openSettings().catch(
            () => undefined
          );
        },
      },
    ]
  );
}

/* ---------------------------------
 * Settings storage
 * --------------------------------- */

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    if (
      Platform.OS === "web"
    ) {
      if (
        typeof localStorage ===
        "undefined"
      ) {
        return DEFAULT_NOTIFICATION_SETTINGS;
      }

      const raw =
        localStorage.getItem(
          SETTINGS_KEY
        );

      if (!raw) {
        return DEFAULT_NOTIFICATION_SETTINGS;
      }

      return normalizeSettings(JSON.parse(raw));
    }

    const {
      File,
      Paths,
    } = await import(
      "expo-file-system"
    );

    const file =
      new File(
        Paths.document,
        `${SETTINGS_KEY}.json`
      );

    if (!file.exists) {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }

    const raw =
      await file.text();

    if (!raw) {
      return DEFAULT_NOTIFICATION_SETTINGS;
    }

    return normalizeSettings(JSON.parse(raw));
  } catch (error) {
    console.warn(
      "Could not read notification settings:",
      error
    );

    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export async function saveNotificationSettings(
  settings: NotificationSettings
): Promise<void> {
  const safeSettings = normalizeSettings(settings);

  const raw =
    JSON.stringify(
      safeSettings
    );

  if (
    Platform.OS === "web"
  ) {
    if (
      typeof localStorage !==
      "undefined"
    ) {
      localStorage.setItem(
        SETTINGS_KEY,
        raw
      );
    }

    return;
  }

  const {
    File,
    Paths,
  } = await import(
    "expo-file-system"
  );

  const file =
    new File(
      Paths.document,
      `${SETTINGS_KEY}.json`
    );

  file.write(raw);

  if (
    Platform.OS === "android"
  ) {
    await ensureAndroidChannel(
      safeSettings
    );
  }
}

export async function resetNotificationSettings() {
  await saveNotificationSettings(
    DEFAULT_NOTIFICATION_SETTINGS
  );
}

/* ---------------------------------
 * Android notification channel
 * --------------------------------- */

async function ensureAndroidChannel(
  settings: NotificationSettings
) {
  if (
    Platform.OS !== "android"
  ) {
    return;
  }

  // Android channel sound/vibration are immutable after creation. Preserve the
  // user's system choices; saved vibration seeds a NEW channel only. Later UI
  // must direct users to system settings for an existing channel.
  const existing = await Notifications.getNotificationChannelAsync(ANDROID_CHANNEL_ID);
  debug({ channel: existing });
  if (existing) return;

  await Notifications.setNotificationChannelAsync(
    ANDROID_CHANNEL_ID,
    {
      name:
        "Reminders",

      description:
        "Notiva reminder notifications",

      importance:
        Notifications
          .AndroidImportance
          .HIGH,

      /*
       * Android phone's notification
       * sound will be used.
       *
       * User can change the channel
       * sound from phone settings.
       */
      sound:
        "default",

      enableVibrate:
        settings.vibration,

      vibrationPattern:
        settings.vibration
          ? [
              0,
              300,
              250,
              300,
            ]
          : [0],

      showBadge:
        false,

      lockscreenVisibility:
        Notifications
          .AndroidNotificationVisibility
          .PUBLIC,
    }
  );
}

/* ---------------------------------
 * Permission
 * --------------------------------- */

export async function prepareNotifications(): Promise<boolean> {
  if (
    Platform.OS === "web"
  ) {
    Alert.alert(
      "Notifications unavailable",
      "Local reminder notifications require the Android or iOS app."
    );

    return false;
  }

  try {
    const settings =
      await getNotificationSettings();

    await ensureAndroidChannel(
      settings
    );

    let permission =
      await Notifications.getPermissionsAsync();

    if (
      !permission.granted &&
      permission.canAskAgain &&
      !requestedThisSession
    ) {
      requestedThisSession =
        true;

      permission =
        await Notifications.requestPermissionsAsync(
          {
            ios: {
              allowAlert: true,
              allowSound: true,
              allowBadge: false,
            },
          }
        );
    }

    debug({
      permissionStatus:
        permission.status,

      iosStatus:
        permission.ios?.status,
    });

    if (
      !permission.granted
    ) {
      disabledMessage();

      return false;
    }

    if (
      Platform.OS ===
      "android"
    ) {
      const configured =
        await Notifications.getNotificationChannelAsync(
          ANDROID_CHANNEL_ID
        );

      debug({ channel: configured });

      if (
        configured &&
        (configured.importance < Notifications.AndroidImportance.HIGH || configured.sound === null)
      ) {
        Alert.alert(
          "Reminder alerts limited",
          "Enable alerts and sound for the Reminders notification channel in device settings."
        );
      }
    }

    if (Platform.OS === "android" && Number(Platform.Version) >= 31 && !explainedExactAlarmAccess) {
      explainedExactAlarmAccess = true;
      Alert.alert("Allow precise reminder timing",
        "Check Settings → Apps → Special app access → Alarms & reminders → Notiva (Reminder54). Allow access, then return here. Without it Android may delay reminders even when scheduling succeeds. Power management can still affect delivery.",
        [{ text: "Continue", style: "cancel" },
          { text: "Open settings", onPress: () => { void openExactAlarmSettings(); } }]);
    }
    return true;
  } catch (error) {
    console.warn(
      "Notification setup failed:",
      error
    );

    Alert.alert(
      "Notifications unavailable",
      "Could not prepare notifications. Check device notification settings and try again."
    );

    return false;
  }
}

/* ---------------------------------
 * Open system notification settings
 * --------------------------------- */

export async function openNotificationSettings() {
  try {
    await Linking.openSettings();
  } catch {
    Alert.alert(
      "Unable to open settings",
      "Open your phone Settings → Apps → Notiva → Notifications → Reminders → Sound."
    );
  }
}

/* ---------------------------------
 * Cancel notifications
 * --------------------------------- */

export async function cancelNotifications(
  ids: string[] = []
) {
  if (!ids.length) {
    return;
  }

  await Promise.all(
    ids.map(
      async (id) => {
        try {
          await Notifications.cancelScheduledNotificationAsync(
            id
          );
        } catch (error) {
          if (__DEV__) {
            console.warn(
              "Notification cancel failed:",
              id,
              error
            );
          }
        }
      }
    )
  );
}

/* ---------------------------------
 * Notification alert date
 * --------------------------------- */

export function notificationDateFor(
  item: ReminderItem
): Date {
  if (!Number.isFinite(item.alertBefore?.minutes) || item.alertBefore.minutes < 0) {
    return new Date(NaN);
  }
  return new Date(
    new Date(
      item.startAt
    ).getTime() -
      item.alertBefore
        .minutes *
        60_000
  );
}

/* ---------------------------------
 * Recurring triggers
 * --------------------------------- */

export function createRecurringTriggers(
  item: ReminderItem
): Notifications.SchedulableNotificationTriggerInput[] {
  const date =
    notificationDateFor(
      item
    );

  if (
    !Number.isFinite(
      date.getTime()
    )
  ) {
    throw new Error(
      "Invalid reminder date."
    );
  }

  const types =
    Notifications
      .SchedulableTriggerInputTypes;

  const start = new Date(item.startAt);
  // A fixed day/month trigger cannot express "N minutes before" across
  // variable-length month boundaries. Refuse instead of silently alerting on
  // the wrong day in later months/years. Use an at-time alert in this case.
  if ((item.repeat === "monthly" || item.repeat === "yearly") &&
      (start.getMonth() !== date.getMonth() || start.getFullYear() !== date.getFullYear())) {
    throw new Error("This recurring alert crosses a month boundary. Choose an at-time alert or a one-time item.");
  }

  const time = {
    hour:
      date.getHours(),

    minute:
      date.getMinutes(),

    ...(Platform.OS ===
    "android"
      ? {
          channelId:
            ANDROID_CHANNEL_ID,
        }
      : {}),
  };

  switch (
    item.repeat
  ) {
    case "daily":
      return [
        {
          type:
            types.DAILY,

          ...time,
        },
      ];

    case "weekly":
      return [
        {
          type:
            types.WEEKLY,

          weekday:
            date.getDay() +
            1,

          ...time,
        },
      ];

    case "weekdays": {
      const start =
        new Date(
          item.startAt
        );

      const startDay =
        Date.UTC(
          start.getFullYear(),
          start.getMonth(),
          start.getDate()
        );

      const alertDay =
        Date.UTC(
          date.getFullYear(),
          date.getMonth(),
          date.getDate()
        );

      const shift =
        Math.round(
          (
            alertDay -
            startDay
          ) /
            86_400_000
        );

      return [
        1,
        2,
        3,
        4,
        5,
      ].map(
        (day) => ({
          type:
            types.WEEKLY,

          weekday:
            (
              (
                day +
                shift
              ) %
                7 +
              7
            ) %
              7 +
            1,

          ...time,
        })
      );
    }

    case "monthly":
      return [
        {
          type:
            types.MONTHLY,

          day:
            date.getDate(),

          ...time,
        },
      ];

    case "yearly":
      return [
        {
          type:
            types.YEARLY,

          month:
            date.getMonth(),

          day:
            date.getDate(),

          ...time,
        },
      ];

    default:
      return [];
  }
}

/* ---------------------------------
 * Notification content
 * --------------------------------- */

function createContent(
  item: ReminderItem,
  alertNumber = 1,
  totalAlerts = 1
): Notifications.NotificationContentInput {
  return {
    title:
      item.title,

    body:
      item.description.trim() ||
      `It's time for ${item.title}.`,

    sound:
      "default",

    priority:
      Notifications
        .AndroidNotificationPriority
        .HIGH,

    data: {
      itemId:
        item.id,

      itemType:
        item.type,

      alertNumber,

      totalAlerts,
    },
  };
}

/* ---------------------------------
 * One-time repeated notifications
 * --------------------------------- */

async function scheduleOneTimeBurst(
  item: ReminderItem,
  settings: NotificationSettings,
  ids: string[]
): Promise<string[]> {

  const firstDate =
    notificationDateFor(
      item
    );

  if (
    !Number.isFinite(
      firstDate.getTime()
    )
  ) {
    throw new Error(
      "Invalid reminder date."
    );
  }

  if (
    firstDate.getTime() <=
    Date.now()
  ) {
    throw new Error(
      "Choose a future notification time."
    );
  }

  for (
    let index = 0;
    index <
    settings.repeatCount;
    index += 1
  ) {
    const alertDate =
      new Date(
        firstDate.getTime() +
          index *
            settings
              .repeatIntervalSeconds *
            1000
      );

    if (alertDate.getTime() <= Date.now()) throw new Error("Choose a future notification time.");
    const id =
      await Notifications.scheduleNotificationAsync(
        {
          content:
            createContent(
              item,
              index + 1,
              settings.repeatCount
            ),

          trigger: {
            type:
              Notifications
                .SchedulableTriggerInputTypes
                .DATE,

            date:
              alertDate,

            ...(Platform.OS ===
            "android"
              ? {
                  channelId:
                    ANDROID_CHANNEL_ID,
                }
              : {}),
          },
        }
      );

    ids.push(id);

    debug({
      itemId:
        item.id,

      notificationId:
        id,

      alert:
        index + 1,

      total:
        settings.repeatCount,

      scheduledFor:
        alertDate.toString(),
    });
  }

  await verifyScheduledNotifications(ids);
  return ids;
}

/* ---------------------------------
 * Main scheduler
 * --------------------------------- */

export async function scheduleItemNotifications(
  item: ReminderItem,
  requireSuccess = false
): Promise<string[]> {
  if (
    isItemReadOnly(
      item
    )
  ) {
    return [];
  }

  const ids: string[] = [];

  try {
    const prepared =
      await prepareNotifications();

    if (!prepared) {
      if (
        requireSuccess
      ) {
        throw new Error(
          "Enable notifications before rescheduling this item."
        );
      }

      return [];
    }

    const settings =
      await getNotificationSettings();

    const scheduledFor =
      notificationDateFor(
        item
      );

    debug({
      currentTime: new Date().toISOString(),
      alertBeforeMinutes: item.alertBefore?.minutes,
      title:
        item.title,

      startAt:
        item.startAt,

      scheduledFor:
        scheduledFor.toString(),

      repeat:
        item.repeat,

      repeatCount:
        settings.repeatCount,

      repeatIntervalSeconds:
        settings.repeatIntervalSeconds,
    });

    /*
     * One-time reminder/task:
     *
     * Full 1 / 3 / 5 burst alerts
     * with 3 / 5 / 10 sec interval.
     */
    if (
      !item.repeat ||
      item.repeat === "none"
    ) {
      return await scheduleOneTimeBurst(
        item,
        settings,
        ids
      );
    }

    /*
     * Recurring reminders:
     *
     * Preserve Android/iOS native
     * recurring notification.
     *
     * Expo recurring calendar
     * triggers do not reliably
     * support 3 / 5 / 10 second
     * burst repetition for every
     * future recurrence.
     */
    const triggers =
      createRecurringTriggers(
        item
      );

    if (
      !triggers.length
    ) {
      if (
        requireSuccess
      ) {
        throw new Error(
          "Could not create recurring notification."
        );
      }

      return [];
    }

    for (
      const trigger of
        triggers
    ) {
      // Native calendar triggers have no start-date fence. Do not schedule a
      // recurrence before the selected item's first alert date.
      const nextDate = await Notifications.getNextTriggerDateAsync(trigger);
      if (nextDate === null || nextDate < scheduledFor.getTime() - 59_999) {
        throw new Error("This recurring alert cannot start on the selected date. Choose a one-time item or set up the recurrence closer to its start.");
      }
      const id =
        await Notifications.scheduleNotificationAsync(
          {
            content:
              createContent(
                item
              ),

            trigger,
          }
        );

      ids.push(id);

      debug({
        itemId:
          item.id,

        notificationId:
          id,

        trigger,
      });
    }

    await verifyScheduledNotifications(ids);
    return ids;
  } catch (error) {
    await cancelNotifications(
      ids
    );

    if (
      requireSuccess
    ) {
      throw new Error(
        error instanceof Error
          ? error.message
          : "Could not schedule notification."
      );
    }

    console.warn(
      "Failed to schedule notification:",
      error
    );

    Alert.alert(
      "Reminder alert unavailable",
      `${error instanceof Error ? error.message : "Could not schedule the notification."} The item can be saved without alerts; edit it to try again.`
    );

    return [];
  }
}

/* ---------------------------------
 * Test notification
 * --------------------------------- */

export async function scheduleTestNotification(): Promise<string | undefined> {
  if (!__DEV__) return undefined;
  if (!(await prepareNotifications())) return undefined;
  try {
    const now = new Date();
    const date = new Date(now.getTime() + 10_000);
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Notiva Test",
        body: "Single 10-second notification test",
        sound: "default",
        priority: Notifications.AndroidNotificationPriority.HIGH,
        data: { itemId: "dev-test", itemType: "reminder", alertNumber: 1, totalAlerts: 1 },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        ...(Platform.OS === "android" ? { channelId: ANDROID_CHANNEL_ID } : {}),
      },
    });
    debug({ currentTime: now.toISOString(), scheduledFor: date.toISOString(),
      scheduledLocalTime: date.toString(), notificationId: id });
    await verifyScheduledNotifications([id]);
    return id;
  } catch (error) {
    console.warn("Test notification failed:", error);
    Alert.alert("Test failed", "Could not schedule the test notification. Check notification permission and Alarms & reminders access in phone settings.");
    return undefined;
  }
}
