import * as Notifications from "expo-notifications";
import { normalizeAlarmSound, type AlarmSound } from "./alarmSounds";
import { nativeAlarm, NATIVE_ALARM_PREFIX, scheduleNativeAlarm } from "./nativeAlarm";
import {
  Alert,
  Linking,
  Platform,
} from "react-native";

import { ReminderItem } from "../types/item";
import { isItemReadOnly } from "../utils/itemStatus";

/* =========================================================
 * STORAGE / CHANNEL CONSTANTS
 * ========================================================= */

const SETTINGS_KEY =
  "notiva.notification.settings.v1";

/*
 * Keep old channel ID for normal/pre-alert notifications.
 *
 * Existing users may already have selected a sound for this
 * channel in Android Settings.
 */
const PRE_ALERT_CHANNEL_ID =
  "reminders";

/*
 * Separate channel for exact reminder-time main alerts.
 *
 * Using a new channel allows MAX importance without changing
 * the user's existing normal reminder channel.
 */
const MAIN_ALERT_CHANNEL_ID =
  "notiva-main-reminders-v1";

/* =========================================================
 * NOTIFICATION SETTINGS
 * ========================================================= */

export type NotificationSettings = {
  preAlerts: boolean;
  vibration: boolean;
  alarmSound: AlarmSound;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings =
  {
    preAlerts: true,
    vibration: true,
    alarmSound: "system",
  };

function normalizeSettings(
  value: Partial<NotificationSettings> | null
): NotificationSettings {
  return {
    alarmSound: normalizeAlarmSound(value?.alarmSound),
    preAlerts: typeof value?.preAlerts === "boolean" ? value.preAlerts : true,
    vibration:
      typeof value?.vibration === "boolean"
        ? value.vibration
        : true,
  };
}


/* =========================================================
 * FOREGROUND NOTIFICATION BEHAVIOR
 * ========================================================= */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

let requestedThisSession =
  false;

let explainedExactAlarmAccess =
  false;
let explainedFullScreenAccess = false;

/* =========================================================
 * DEBUG
 * ========================================================= */

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

async function verifyScheduledNotifications(
  ids: string[]
): Promise<void> {
  if (!__DEV__) {
    return;
  }

  try {
    const scheduled =
      await Notifications.getAllScheduledNotificationsAsync();

    const missingIds =
      ids.filter(
        (id) =>
          !id.startsWith(NATIVE_ALARM_PREFIX) && !scheduled.some(
            (request) =>
              request.identifier ===
              id
          )
      );

    debug({
      currentTime:
        new Date().toISOString(),

      scheduledCount:
        scheduled.length,

      notificationIds:
        ids,

      missingIds,

      scheduledNotifications:
        scheduled,
    });

    if (
      missingIds.length >
      0
    ) {
      console.warn(
        "[Notification] Scheduled IDs absent from OS queue:",
        missingIds
      );
    }
  } catch (error) {
    console.warn(
      "[Notification] Could not verify OS queue:",
      error
    );
  }
}

/* =========================================================
 * EXACT ALARM SETTINGS
 * ========================================================= */

export async function openExactAlarmSettings(): Promise<void> {
  if (
    Platform.OS !==
    "android"
  ) {
    return;
  }

  try {
    await nativeAlarm().openExactSettings();
  } catch {
    await Linking.openSettings().catch(
      () => {
        Alert.alert(
          "Alarms & reminders",
          "Open Settings → Apps → Special app access → Alarms & reminders → Notiva and allow access."
        );
      }
    );
  }
}

/* =========================================================
 * SETTINGS STORAGE
 * ========================================================= */

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    if (
      Platform.OS ===
      "web"
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

      return normalizeSettings(
        JSON.parse(raw)
      );
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

    return normalizeSettings(
      JSON.parse(raw)
    );
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
  const safeSettings =
    normalizeSettings(
      settings
    );

  const raw =
    JSON.stringify(
      safeSettings
    );

  if (
    Platform.OS ===
    "web"
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
    Platform.OS ===
    "android"
  ) {
    await ensureAndroidChannels(
      safeSettings
    );
  }
}

export async function resetNotificationSettings() {
  await saveNotificationSettings(
    DEFAULT_NOTIFICATION_SETTINGS
  );
}

/* =========================================================
 * ANDROID CHANNELS
 * ========================================================= */

async function ensureAndroidChannels(
  settings: NotificationSettings
) {
  if (
    Platform.OS !==
    "android"
  ) {
    return;
  }

  /*
   * PRE-ALERT CHANNEL
   *
   * Android channel sound/vibration settings are mostly
   * controlled by Android after the channel is created.
   *
   * Do not recreate/reset an existing channel because it
   * could override or conflict with user's phone settings.
   */

  const existingPreChannel =
    await Notifications.getNotificationChannelAsync(
      PRE_ALERT_CHANNEL_ID
    );

  if (
    !existingPreChannel
  ) {
    await Notifications.setNotificationChannelAsync(
      PRE_ALERT_CHANNEL_ID,
      {
        name:
          "Reminders",

        description:
          "Upcoming Notiva reminder alerts",

        importance:
          Notifications
            .AndroidImportance
            .HIGH,

        sound:
          "default",

        enableVibrate:
          settings.vibration,

        vibrationPattern:
          settings.vibration
            ? [
                0,
                250,
                150,
                250,
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

  /*
   * MAIN ALERT CHANNEL
   *
   * Exact reminder-time notification.
   *
   * MAX importance + stronger vibration.
   *
   * NOTE:
   * This is still a notification channel.
   * True continuous alarm sound requires native alarm logic.
   */

  const existingMainChannel =
    await Notifications.getNotificationChannelAsync(
      MAIN_ALERT_CHANNEL_ID
    );

  if (
    !existingMainChannel
  ) {
    await Notifications.setNotificationChannelAsync(
      MAIN_ALERT_CHANNEL_ID,
      {
        name:
          "Main Reminder Alerts",

        description:
          "High priority alerts when a Notiva reminder reaches its scheduled time",

        importance:
          Notifications
            .AndroidImportance
            .MAX,

        sound:
          "default",

        enableVibrate:
          settings.vibration,

        vibrationPattern:
          settings.vibration
            ? [
                0,
                600,
                250,
                600,
                250,
                600,
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

  debug({
    preChannel:
      existingPreChannel,

    mainChannel:
      existingMainChannel,
  });
}

/* =========================================================
 * PERMISSION
 * ========================================================= */

function disabledMessage() {
  Alert.alert(
    "Notifications disabled",
    "Notifications are disabled. Enable them from device settings to receive reminders.",
    [
      {
        text:
          "Not now",

        style:
          "cancel",
      },
      {
        text:
          "Open settings",

        onPress: () => {
          void Linking.openSettings().catch(
            () =>
              undefined
          );
        },
      },
    ]
  );
}

export async function prepareNotifications(): Promise<boolean> {
  if (
    Platform.OS ===
    "web"
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

    await ensureAndroidChannels(
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
              allowAlert:
                true,

              allowSound:
                true,

              allowBadge:
                false,
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
      const preChannel =
        await Notifications.getNotificationChannelAsync(
          PRE_ALERT_CHANNEL_ID
        );

      const mainChannel =
        await Notifications.getNotificationChannelAsync(
          MAIN_ALERT_CHANNEL_ID
        );

      debug({
        preChannel,
        mainChannel,
      });

      if (
        preChannel &&
        (
          preChannel.importance <
            Notifications
              .AndroidImportance
              .HIGH ||
          preChannel.sound ===
            null
        )
      ) {
        Alert.alert(
          "Reminder alerts limited",
          "Enable alerts and sound for Notiva reminders in your phone notification settings."
        );
      }
    }

    /*
     * Android 12+ exact alarm access.
     */
    if (
      Platform.OS ===
        "android" &&
      Number(
        Platform.Version
      ) >= 31 &&
      !explainedExactAlarmAccess
      && !(await nativeAlarm().canSchedule())
    ) {
      explainedExactAlarmAccess =
        true;

      Alert.alert(
        "Allow precise reminder timing",
        "Check Settings → Apps → Special app access → Alarms & reminders → Notiva. Allow access so reminder alerts can run at the selected time.",
        [
          {
            text:
              "Continue",

            style:
              "cancel",
          },
          {
            text:
              "Open settings",

            onPress: () => {
              void openExactAlarmSettings();
            },
          },
        ]
      );
    }

    if (Platform.OS === "android" && !explainedFullScreenAccess && !(await nativeAlarm().canFullScreen())) {
      explainedFullScreenAccess = true;
      Alert.alert("Allow full-screen alarms", "Allow full-screen alerts in Android Settings to show the alarm over the lock screen. Otherwise, use the alarm notification controls.", [
        { text: "Continue", style: "cancel" },
        { text: "Open settings", onPress: () => { void nativeAlarm().openFullScreenSettings().catch(() => Linking.openSettings()); } },
      ]);
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

/* =========================================================
 * OPEN SYSTEM NOTIFICATION SETTINGS
 * ========================================================= */

export async function openNotificationSettings() {
  try {
    await Linking.openSettings();
  } catch {
    Alert.alert(
      "Unable to open settings",
      "Open your phone Settings → Apps → Notiva → Notifications."
    );
  }
}

/* =========================================================
 * CANCEL NOTIFICATIONS
 * ========================================================= */

export async function cancelNotifications(
  ids: string[] = []
) {
  if (
    !ids.length
  ) {
    return;
  }

  await Promise.all(
    ids.map(
      async (id) => {
        if (id.startsWith(NATIVE_ALARM_PREFIX)) {
          await nativeAlarm().cancel(id);
          return;
        }
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

/* =========================================================
 * DATE HELPERS
 * ========================================================= */

/*
 * Pre-alert time.
 *
 * Example:
 *
 * Reminder = 10:00 PM
 * Alert Before = 5
 *
 * Result = 9:55 PM
 */

export function notificationDateFor(
  item: ReminderItem
): Date {
  const minutes =
    item.alertBefore?.minutes;

  if (
    !Number.isFinite(
      minutes
    ) ||
    minutes < 0
  ) {
    return new Date(
      NaN
    );
  }

  const start =
    new Date(
      item.startAt
    ).getTime();

  if (
    !Number.isFinite(
      start
    )
  ) {
    return new Date(
      NaN
    );
  }

  return new Date(
    start -
      minutes *
        60_000
  );
}

function mainAlertDateFor(
  item: ReminderItem
): Date {
  const date =
    new Date(
      item.startAt
    );

  return date;
}

/* =========================================================
 * CONTENT
 * ========================================================= */

function itemTypeTitle(
  item: ReminderItem
) {
  switch (
    item.type
  ) {
    case "task":
      return "Task Due";

    case "event":
      return "Event Starting";

    case "birthday":
      return "Birthday Reminder";

    default:
      return "Reminder";
  }
}

function createPreAlertContent(
  item: ReminderItem
): Notifications.NotificationContentInput {
  const minutes =
    item.alertBefore.minutes;

  const timeText =
    minutes === 1
      ? "1 minute"
      : `${minutes} minutes`;

  return {
    title:
      item.title,

    body:
      minutes > 0
        ? `${item.title} is due in ${timeText}.`
        : item.description.trim() ||
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

      alertType:
        "pre-alert",
    },
  };
}

function createMainAlertContent(
  item: ReminderItem
): Notifications.NotificationContentInput {
  return {
    title:
      itemTypeTitle(
        item
      ),

    body:
      item.description.trim() ||
      `${item.title} is due now.`,

    sound:
      "default",

    priority:
      Notifications
        .AndroidNotificationPriority
        .MAX,

    data: {
      itemId:
        item.id,

      itemType:
        item.type,

      alertType:
        "main-alert",
    },
  };
}

/* =========================================================
 * ONE-TIME SCHEDULING
 * ========================================================= */

async function scheduleDateNotification(
  content: Notifications.NotificationContentInput,
  date: Date,
  channelId: string
): Promise<string> {
  if (
    !Number.isFinite(
      date.getTime()
    )
  ) {
    throw new Error(
      "Invalid notification date."
    );
  }

  if (
    date.getTime() <=
    Date.now()
  ) {
    throw new Error(
      "Choose a future notification time."
    );
  }

  return Notifications.scheduleNotificationAsync(
    {
      content,

      trigger: {
        type:
          Notifications
            .SchedulableTriggerInputTypes
            .DATE,

        date,

        ...(Platform.OS ===
        "android"
          ? {
              channelId,
            }
          : {}),
      },
    }
  );
}

async function scheduleOneTimeNotifications(
  item: ReminderItem,
  ids: string[]
): Promise<string[]> {
  const preAlertDate =
    notificationDateFor(
      item
    );

  const mainDate =
    mainAlertDateFor(
      item
    );

  if (
    !Number.isFinite(
      mainDate.getTime()
    )
  ) {
    throw new Error(
      "Invalid reminder date."
    );
  }

  if (
    mainDate.getTime() <=
    Date.now()
  ) {
    throw new Error(
      "Choose a future reminder time."
    );
  }

  /*
   * PRE ALERT
   *
   * Only schedule separately when Alert Before > 0.
   *
   * Example:
   * 10:00 PM reminder
   * 5 min before
   *
   * -> 9:55 PM
   */

  if (
    item.alertBefore.minutes >
    0 && (await getNotificationSettings()).preAlerts
  ) {
    if (
      !Number.isFinite(
        preAlertDate.getTime()
      ) ||
      preAlertDate.getTime() <=
        Date.now()
    ) {
      throw new Error(
        "Choose a future alert time."
      );
    }

    const preAlertId =
      await scheduleDateNotification(
        createPreAlertContent(
          item
        ),
        preAlertDate,
        PRE_ALERT_CHANNEL_ID
      );

    ids.push(
      preAlertId
    );

    debug({
      itemId:
        item.id,

      notificationId:
        preAlertId,

      alertType:
        "pre-alert",

      scheduledFor:
        preAlertDate.toString(),
    });
  }

  /*
   * MAIN ALERT
   *
   * Always schedule exact reminder time.
   */

  const mainAlertId = Platform.OS === "android"
    ? await scheduleNativeAlarm(item, await getNotificationSettings(), ids)
    : await scheduleDateNotification(
      createMainAlertContent(
        item
      ),
      mainDate,
      MAIN_ALERT_CHANNEL_ID
    );

  ids.push(
    mainAlertId
  );

  debug({
    itemId:
      item.id,

    notificationId:
      mainAlertId,

    alertType:
      "main-alert",

    scheduledFor:
      mainDate.toString(),
  });

  await verifyScheduledNotifications(
    ids
  );

  return ids;
}

/* =========================================================
 * RECURRING TRIGGER HELPER
 * ========================================================= */

function recurringTriggerForDate(
  item: ReminderItem,
  date: Date,
  channelId: string
): Notifications.SchedulableNotificationTriggerInput[] {
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

  const time = {
    hour:
      date.getHours(),

    minute:
      date.getMinutes(),

    ...(Platform.OS ===
    "android"
      ? {
          channelId,
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

/*
 * Preserve existing exported helper.
 *
 * This helper represents the PRE-ALERT recurrence.
 */
export function createRecurringTriggers(
  item: ReminderItem
): Notifications.SchedulableNotificationTriggerInput[] {
  return recurringTriggerForDate(
    item,
    notificationDateFor(
      item
    ),
    PRE_ALERT_CHANNEL_ID
  );
}

/* =========================================================
 * RECURRING SCHEDULER
 * ========================================================= */

async function scheduleRecurringNotifications(
  item: ReminderItem,
  ids: string[]
): Promise<string[]> {
  const preDate =
    notificationDateFor(
      item
    );

  const mainDate =
    mainAlertDateFor(
      item
    );

  /*
   * PRE ALERT recurring trigger.
   *
   * Skip when alertBefore = 0 because
   * main notification already fires at the same time.
   */

  if (
    item.alertBefore.minutes >
    0 && (await getNotificationSettings()).preAlerts
  ) {
    const preTriggers =
      recurringTriggerForDate(
        item,
        preDate,
        PRE_ALERT_CHANNEL_ID
      );

    for (
      const trigger of
      preTriggers
    ) {
      const nextDate =
        await Notifications.getNextTriggerDateAsync(
          trigger
        );

      if (
        nextDate === null
      ) {
        throw new Error(
          "Could not calculate recurring pre-alert."
        );
      }

      const id =
        await Notifications.scheduleNotificationAsync(
          {
            content:
              createPreAlertContent(
                item
              ),

            trigger,
          }
        );

      ids.push(
        id
      );

      debug({
        itemId:
          item.id,

        alertType:
          "recurring-pre-alert",

        notificationId:
          id,

        trigger,
      });
    }
  }

  /*
   * MAIN recurring trigger.
   */

  if (Platform.OS === "android") {
    ids.push(await scheduleNativeAlarm(item, await getNotificationSettings(), ids));
    await verifyScheduledNotifications(ids);
    return ids;
  }

  const mainTriggers =
    recurringTriggerForDate(
      item,
      mainDate,
      MAIN_ALERT_CHANNEL_ID
    );

  if (
    !mainTriggers.length
  ) {
    throw new Error(
      "Could not create recurring main alert."
    );
  }

  for (
    const trigger of
    mainTriggers
  ) {
    const nextDate =
      await Notifications.getNextTriggerDateAsync(
        trigger
      );

    if (
      nextDate === null
    ) {
      throw new Error(
        "Could not calculate recurring main alert."
      );
    }

    const id =
      await Notifications.scheduleNotificationAsync(
        {
          content:
            createMainAlertContent(
              item
            ),

          trigger,
        }
      );

    ids.push(
      id
    );

    debug({
      itemId:
        item.id,

      alertType:
        "recurring-main-alert",

      notificationId:
        id,

      trigger,
    });
  }

  await verifyScheduledNotifications(
    ids
  );

  return ids;
}

/* =========================================================
 * MAIN PUBLIC SCHEDULER
 * ========================================================= */

const schedulingItems = new Map<string, Promise<string[]>>();

export function scheduleItemNotifications(item: ReminderItem, requireSuccess = false): Promise<string[]> {
  const previous = schedulingItems.get(item.id) ?? Promise.resolve([]);
  const next = previous.catch(() => []).then(() => scheduleItemNotificationsOnce(item, requireSuccess));
  schedulingItems.set(item.id, next);
  const clear = () => { if (schedulingItems.get(item.id) === next) schedulingItems.delete(item.id); };
  void next.then(clear, clear);
  return next;
}

async function scheduleItemNotificationsOnce(
  item: ReminderItem,
  requireSuccess = false
): Promise<string[]> {
  /*
   * Done / Completed / Cancelled items
   * must not create new notifications.
   */

  if (
    isItemReadOnly(
      item
    )
  ) {
    return [];
  }

  const ids: string[] =
    [];

  try {
    const prepared =
      await prepareNotifications();

    if (
      !prepared
    ) {
      if (
        requireSuccess
      ) {
        throw new Error(
          "Enable notifications before scheduling this item."
        );
      }

      return [];
    }

    if (Platform.OS === "android" && !(await nativeAlarm().canSchedule())) {
      throw new Error("Allow Alarms & reminders access in Android Settings, then save again.");
    }

    if (Platform.OS === "android") {
      // Native PendingIntent identity replaces the main alarm. Expo generates new
      // IDs, so remove this item's previous requests before creating replacements.
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      await Promise.all(scheduled.filter(request => request.content.data?.itemId === item.id)
        .map(request => Notifications.cancelScheduledNotificationAsync(request.identifier)));
    }

    const preAlertDate =
      notificationDateFor(
        item
      );

    const mainDate =
      mainAlertDateFor(
        item
      );

    debug({
      currentTime:
        new Date().toISOString(),

      title:
        item.title,

      type:
        item.type,

      startAt:
        item.startAt,

      mainAlert:
        mainDate.toString(),

      alertBeforeMinutes:
        item.alertBefore
          ?.minutes,

      preAlert:
        preAlertDate.toString(),

      repeat:
        item.repeat,

      /*
       * Old burst settings intentionally
       * no longer used here.
       */
      burstNotifications:
        false,
    });

    /*
     * ONE-TIME ITEM
     *
     * Example:
     *
     * 10:00 PM main reminder
     * 5 min alertBefore
     *
     * 9:55 PM -> one pre-alert
     * 10:00 PM -> one main alert
     *
     * STOP.
     */

    if (
      !item.repeat ||
      item.repeat ===
        "none"
    ) {
      return await scheduleOneTimeNotifications(
        item,
        ids
      );
    }

    /*
     * RECURRING ITEM
     *
     * Each recurrence:
     *
     * one pre-alert
     * +
     * one main-time alert
     */

    return await scheduleRecurringNotifications(
      item,
      ids
    );
  } catch (error) {
    /*
     * Clean up partially scheduled notifications.
     */

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
      `${
        error instanceof Error
          ? error.message
          : "Could not schedule the notification."
      } The item can be saved without alerts; edit it to try again.`
    );

    return [];
  }
}

/* =========================================================
 * DEVELOPMENT TEST
 * ========================================================= */

export async function scheduleTestNotification(): Promise<
  string | undefined
> {
  if (!__DEV__) {
    return undefined;
  }

  if (Platform.OS === "android") {
    const now = new Date().toISOString();
    const item: ReminderItem = {
      id: `alarm-test-${Date.now()}`, type: "reminder", title: "Native alarm test",
      description: "Done opens the completion note. Dismiss leaves this reminder missed.",
      category: "Personal", repeat: "none", startAt: new Date(Date.now() + 45_000).toISOString(),
      alertBefore: { label: "At time", minutes: 0 }, notificationIds: [], createdAt: now, updatedAt: now,
    };
    item.notificationIds = await scheduleItemNotifications(item, true);
    try {
      const { saveItem } = await import("./itemStorage");
      await saveItem(item);
    } catch (error) {
      await cancelNotifications(item.notificationIds);
      throw error;
    }
    return item.notificationIds[0];
  }

  if (
    !(await prepareNotifications())
  ) {
    return undefined;
  }

  try {
    const now =
      new Date();

    const date =
      new Date(
        now.getTime() +
          10_000
      );

    const id =
      await Notifications.scheduleNotificationAsync(
        {
          content: {
            title:
              "Notiva Test",

            body:
              "Test notification after 10 seconds",

            sound:
              "default",

            priority:
              Notifications
                .AndroidNotificationPriority
                .HIGH,

            data: {
              itemId:
                "dev-test",

              itemType:
                "reminder",

              alertType:
                "test",
            },
          },

          trigger: {
            type:
              Notifications
                .SchedulableTriggerInputTypes
                .DATE,

            date,
          },
        }
      );

    debug({
      currentTime:
        now.toISOString(),

      scheduledFor:
        date.toISOString(),

      scheduledLocalTime:
        date.toString(),

      notificationId:
        id,
    });

    await verifyScheduledNotifications(
      [id]
    );

    return id;
  } catch (error) {
    console.warn(
      "Test notification failed:",
      error
    );

    Alert.alert(
      "Test failed",
      "Could not schedule the test notification. Check notification permission and Alarms & reminders access in phone settings."
    );

    return undefined;
  }
}
