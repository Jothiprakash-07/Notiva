# Android local notification audit and device tests

## Verified in this checkout

- Expo ~54.0.37 and expo-notifications ~0.32.17 match Expo's bundled dependency map. No package changes.
- app.json already declares android.permission.SCHEDULE_EXACT_ALARM once and configures expo-notifications. No app.config.js/ts exists. eas.json already has a development-client profile. No config changes.
- android/app/src/main/AndroidManifest.xml already has exact-alarm permission. expo-notifications supplies POST_NOTIFICATIONS and RECEIVE_BOOT_COMPLETED through manifest merging; VIBRATE is in the app manifest.
- One-time reminders already use native DATE triggers, calculated as startAt minus alertBefore.minutes * 60000. Local date getters are used for recurring calendar triggers; no hardcoded timezone or JS delivery timer.
- Expo's installed ExpoSchedulingDelegate.kt uses setExactAndAllowWhileIdle when allowed, but silently falls back to setAndAllowWhileIdle when exact access is missing. A returned ID/queue entry does NOT prove exact access or delivery.
- Existing channel settings are preserved. New reminders channels use HIGH importance, default sound and the saved vibration preference. Android phone channel settings control existing-channel sound/vibration/banners.
- AppState refreshes the Home UI only. The root tap listener cancels remaining item alerts; Home routes Missed/Overdue to Action Required and Pending/Upcoming/Ongoing to Details. These paths were not changed.

## Changes

Default repeat count is now 1 (existing saved preferences remain intact). The dev test always schedules one DATE notification for 10 seconds later and returns its string ID. Profile's existing test confirmation now describes that result. DEV diagnostics include permissions, channel, current time, startAt, alert offset, scheduled time, returned IDs, OS queue count/entries and missing-ID warnings. Queue-inspection failures do not cancel successfully scheduled alarms. Exact-access guidance appears once per Android 12+ session; its settings helper opens Alarms & reminders with an app-settings fallback. It does not pretend to measure exact access. Individual cancellation failures remain isolated.

## Build

These edits are JavaScript-only: no new native build is required IF the installed development build already includes this checkout's permissions and expo-notifications version. The installed binary was not inspected. If it predates those native settings, rebuild and install with `npx expo run:android`, or `eas build --platform android --profile development`. Metro cannot update a native manifest. Test in Notiva's own development build, not Expo Go. Android native directory exists locally and is ignored by Git; keep it synchronized with app.json when making future native config changes.

## Phone setup

The current configured app name is Reminder54, so locate Notiva/Reminder54 in Settings.

1. Settings → Apps → Notiva/Reminder54 → Notifications → Allow notifications ON.
2. Notifications → Reminders → Alerting, Sound = an audible default/selected tone, Pop on screen/banners ON; select vibration as desired. Existing channel preferences are not overwritten by the app's vibration toggle.
3. Settings → Apps → Special app access → Alarms & reminders → Notiva/Reminder54 → Allow setting alarms and reminders ON. Return to the app and create a fresh reminder after granting access (previously queued inexact alarms are not automatically promoted by this change).
4. Set notification volume above zero and disable silent/Do Not Disturb for the sound test.
5. If vendor delays persist, manually compare Settings → Apps → Notiva/Reminder54 → Battery → Unrestricted / Don't optimize. Setting labels vary by vendor; no battery bypass is implemented.

## Manual tests (physical Android phone)

Set Profile notification Repeat count = 1 explicitly, because saved settings may still say 3. Use a one-time reminder, not a recurring reminder. Complete permissions/settings prompts before each timed test.

- Test A: Open app → create reminder 2 minutes in the future → Alert Before = 0 → Repeat count = 1 → save → inspect DEV queue log → background app with Home → do not Force Stop → verify notification and sound near the selected time.
- Test B: Create another reminder 2 minutes ahead with Alert Before = 0 and Repeat count = 1 → save → verify queued ID → swipe app away from recents normally → verify notification and sound.
- Test C: In a development build, Profile → Send Test Notification → confirm one ID is logged, scheduled time is current time + 10 seconds, scheduledCount includes the new entry and missingIds is empty → verify one notification with sound. Function: scheduleTestNotification().
- Also repeat A with the app open to check foreground sound/banner. After single delivery works, optionally select 3 alerts / 5 seconds and test tapping the first alert: remaining item alerts should cancel and navigation should match the current item status. Android may throttle closely spaced alerts in idle mode.

Force Stop is different from normal backgrounding/swipe-away and may prevent delivery until the app is opened again. Exact delivery is not guaranteed across Android power management and OEM restrictions.

## Diagnose using evidence

Capture DEV [Notification] logs and actual arrival time, phone model/Android version, installed build identity, and system settings. No device logs were supplied for this audit; adb was not available on PATH, so physical delivery was not verified.

- Wrong scheduledFor vs startAt minus alertBeforeMinutes: investigate input/trigger time, comparing ISO and local timestamps.
- permissionStatus denied: enable app notification permission.
- Channel importance below HIGH or sound null: inspect Reminders channel; confirm audible tone, volume and DND.
- Correct time and queued ID, but Alarms & reminders off: enable special access and schedule a fresh item. Queue presence alone cannot distinguish exact from inexact alarms.
- Access missing from installed app settings: verify the installed manifest/build includes SCHEDULE_EXACT_ALARM; rebuild if stale.
- Correct permissions/channel/time/build but delays remain: compare with Battery Unrestricted, then investigate OEM restrictions using device logs. Do not label OEM/battery as the cause without that comparison.

## Validation

`npx tsc --noEmit`: PASS (exit 0).
`node scripts/test-reminders.cjs`: PASS; native APIs are mocked, covering timing/offsets, single test, channel preservation, repeats, cancellation failures, partial scheduling rollback, permission denial, tap response cleanup and storage/status behavior. This is not a device delivery test.

References: https://docs.expo.dev/versions/v54.0.0/sdk/notifications/ and https://developer.android.com/develop/background-work/services/alarms
