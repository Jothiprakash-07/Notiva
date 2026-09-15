import * as Notifications from "expo-notifications";
import { getItemById } from "./itemStorage";
import { cancelNotifications } from "./notificationService";
import { recordNotification } from "./notificationHistory";

export function notificationResponseKey(response: Notifications.NotificationResponse) {
  return `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
}

// Shared across layout effect replays. Reserve before any asynchronous work.
const handled = new Set<string>();

export async function consumeNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<{ itemId: string; responseKey: string } | undefined> {
  const responseKey = notificationResponseKey(response);
  if (handled.has(responseKey)) return;
  const itemId = response.notification.request.content.data?.itemId;
  if (typeof itemId !== "string" || !itemId.trim()) return;
  handled.add(responseKey);
  // History failures must not prevent the existing phone-tap cleanup/routing.
  await recordNotification(response.notification, true).catch(error => {
    console.warn("Could not save tapped notification history:", error);
  });
  try {
    const ids = new Set<string>();
    // The OS lookup also covers dev tests and alerts scheduled just before an
    // item save. A storage failure must not prevent this cancellation fallback.
    try {
      const item = await getItemById(itemId);
      item?.notificationIds?.forEach(id => ids.add(id));
    } catch (error) {
      console.warn("Could not read tapped notification item:", error);
    }
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      scheduled.filter(request => request.content.data?.itemId === itemId)
        .forEach(request => ids.add(request.identifier));
    } catch (error) {
      console.warn("Could not inspect scheduled notifications:", error);
    }
    // A pre-alert tap opens the item; it must not cancel the main alarm or
    // future recurring pre-alerts. Preserve legacy cleanup for older payloads.
    if (response.notification.request.content.data?.alertType !== "pre-alert") {
      await cancelNotifications([...ids]);
    }
    // Never write item status, completion, Skip, or deletion on a tap.
    // Clear only this response, so normal launches cannot replay it. Leave a
    // newer native response available for its listener/cold-start handler.
    const last = await Notifications.getLastNotificationResponseAsync();
    if (last && notificationResponseKey(last) === responseKey) {
      await Notifications.clearLastNotificationResponseAsync();
    }
  } catch (error) {
    console.warn("Could not finish notification response cleanup:", error);
  }
  return { itemId, responseKey };
}
