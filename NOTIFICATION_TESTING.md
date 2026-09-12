# Notification core verification

Run `node scripts/test-reminders.cjs` and `npx tsc --noEmit` from the project root.
The regression suite mocks native APIs; it does not prove OS delivery or navigation rendering.

## Physical Android device

1. Rebuild/install with `npx expo run:android --device` (the native manifest now declares exact-alarm permission, matching app.json). Allow notifications. In Android Settings > Apps > Special app access > Alarms & reminders, allow Notiva/Reminder54 if offered. Enable the Reminders channel, sound, and vibration. Turn off Do Not Disturb for this test.
2. Defaults are 3 alerts, 5 seconds apart, vibration true. Existing saved choices remain in effect. The existing development-only “Send Test Notification” action calls `scheduleTestNotification()`: expect alerts approximately 5, 10, and 15 seconds after invoking it. It returns all three IDs. No Profile UI was added or edited for this work.
3. Create a nonrecurring Reminder at least 6 minutes ahead with “5 minutes before.” Inspect `getItemById(id).notificationIds` in a development debugging session: expect 3 IDs. Inspect `Notifications.getAllScheduledNotificationsAsync()`: their dates must equal start minus 5 minutes, then +5 and +10 seconds; all contain the same itemId. Observe the actual alerts.
4. Repeat step 3 for Task, Event, and Birthday using a one-time item. If the Birthday creation flow always uses yearly recurrence, expect the recurring fallback (step 9).
5. Tap the first early alert: Details opens, and the remaining alerts for that item disappear from the OS schedule. Confirm the stored item's completed/status/actionResolved values are unchanged. A second item's alerts must remain scheduled.
6. Create an at-time Reminder and Task. Wait until each is Missed/Overdue, then tap its notification. Action Required opens with that item first, including when a stack was already open. Events and Birthdays open Details. Back/focus changes must not reopen the handled response.
7. Repeat taps with the app foregrounded, backgrounded, and removed from Recents. After handling a tap, terminate and open via the app icon: the old response must not reopen. Also leave a fresh burst untouched and open via the icon between alerts: the remaining alerts must still fire. Android Force Stop is not equivalent to removing from Recents.
8. Test Mark Done, Delete, Reschedule, explicit Skip, and left/right swipes. Done/Delete/Reschedule cancel old IDs. Reschedule stores all new IDs. Skip persists actionResolved; swipes only dismiss temporarily. Events/Birthdays never enter Action Required.
9. Create daily, weekly, weekdays, monthly, and yearly items at the next applicable occurrence. Expect ONE native alert per occurrence (five weekly IDs for weekdays, one ID for other recurrences). Check weekday rollover for alerts before midnight. Tapping cancels those IDs, including future occurrences; edit/reschedule explicitly to re-enable alerts. A month-crossing monthly/yearly offset or a native next occurrence earlier than the selected start reports a scheduling error instead of silently choosing an incorrect date.
10. Using `saveNotificationSettings` in a development caller, try each repeatCount (1/3/5) and repeatIntervalSeconds (3/5/10), then schedule a fresh one-time item/test. Verify count and date spacing. Settings changes apply to newly scheduled alerts. Restore defaults with `resetNotificationSettings()`.
11. Choose a different Reminders sound in phone settings, then schedule again and restart the app. The chosen sound must remain. Change vibration in phone settings and verify foreground/background behavior. The saved vibration boolean initializes a new channel only; Android will not let the app override an existing channel's sound/vibration. iOS vibration follows device settings.
12. Deny notification permission, then try creating/rescheduling and the dev test: expect a clear message and no crash. Test invalid/past alert dates through the service: no notifications should remain after failure. Automated tests inject partial schedule/cancel/storage failures.

## Limits

- SDK 54 portable recurring calendar triggers have minute precision and cannot reliably create 3/5/10-second bursts on every recurrence. They use one native alert per occurrence. They cannot represent a future start-date fence or every variable-month offset; unsupported cases are rejected clearly.
- Tapping cancels all schedules for the item, including native recurring schedules. It never changes item status. Cancellation starts when JS receives the tap; an alert already delivered or fired during cold startup cannot be recalled.
- OS permissions, channel settings, Do Not Disturb, battery restrictions, and force-stop behavior can suppress or delay delivery/sound. These are scheduled notifications, not full-screen alarms. No JS timers deliver alerts.
- The single Android channel retains user settings. A future Profile vibration toggle cannot directly change an existing channel; it must link to system settings. No custom sound files or ringtone enumeration are used.

Reference: https://docs.expo.dev/versions/v54.0.0/sdk/notifications/
