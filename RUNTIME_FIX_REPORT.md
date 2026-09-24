# Notiva runtime fix report

## Alarm sound

The service previously read only `alarmSound` captured in the scheduled payload. Notification Settings persisted the new choice in JavaScript storage but never updated a native preference. Already-scheduled reminders therefore kept the old sound.

`saveNotificationSettings` now saves the normalized JavaScript setting and calls the `NotivaAlarm.setAlarmSound` bridge. Android durably mirrors it in SharedPreferences **`notiva_alarm_preferences`**, key **`alarm_sound`**. Startup and settings reads also synchronize the mirror, including existing installations. Reads and saves are serialized so an older asynchronous read cannot overwrite a newer selection. The settings UI updates immediately and reports save/sync failures.

At firing, `AlarmService` reads the latest native preference, falling back to payload `alarmSound`, then `system`. Invalid values normalize to `system`. JavaScript storage remains the UI source of truth; native storage is its runtime mirror.

The existing allowlisted `AlarmAudio` resource lookup maps each key to the matching Android raw resource:

| Key | Resource |
| --- | --- |
| ethereal_uplifting | R.raw.ethereal_uplifting |
| positive_vibe | R.raw.positive_vibe |
| positive_western | R.raw.positive_western |
| robotic_loop | R.raw.robotic_loop |
| sandy_summer | R.raw.sandy_summer |
| system / invalid | RingtoneManager TYPE_ALARM, existing TYPE_NOTIFICATION fallback |

The existing single owned MediaPlayer, release-before-switch behavior, looping playback, USAGE_ALARM and CONTENT_TYPE_SONIFICATION are retained. The service logs `NotivaAlarm: Playing alarm sound = <key>`. Preview remains separate and cannot play while the alarm service is active. The pre-alert channel and its default notification sound are unchanged.

## Silence and alarm actions

`AlarmActivity.dispatchKeyEvent` consumes Volume Up, Down and Mute, calling `silenceCurrentAlarm` on key-down. The service stops audio and vibration, without removing the alarm, closing the activity, changing completion status or cancelling schedules. It remembers silenced active alarms to prevent a refresh from restarting them.

The service dynamically registers an ACTION_SCREEN_OFF receiver while alive, uses the receiver flag required on recent Android versions, and unregisters it on destruction. Screen-off invokes the same silence method. Screen-on has no audio restart handler; no physical power-button interception is attempted.

Done now silences immediately before persisting the existing pending completion request. The app still opens the existing Completion Note flow; native Done does not finalize completion. Dismiss retains the existing removal/close behavior without marking the item completed. Recurrence and scheduling logic were not changed.

The native screen already displayed only title, optional description, Done and Dismiss. That layout and dark styling are preserved; explicit JSON-null descriptions now render as absent.

## Logout

The stored session already used one SecureStore entry, `notiva.auth.session.v1`, containing the token and current user. No separate refresh token store exists. Its existing deletion function is retained and reminder data is untouched.

Previously, React state cleared only after queued persistence completed, startup/profile operations could restore stale state, and authenticated routes lacked guards. The `/` entry also sent unauthenticated users through onboarding rather than directly to Login.

Logout now clears the live session and React state immediately and invalidates older async operations, while queuing session deletion after existing writes. Startup and profile writes cannot repopulate a logged-out session. Root Stack.Protected guards remove authenticated routes and history when the session becomes null. Notification navigation and Completion Note presentation require a session. The profile's existing `router.replace("/")` is retained, and `/` displays Login after the splash for unauthenticated startup/logout.

## Files modified by this task

- app/_layout.tsx
- app/index.tsx
- app/screens/profile/NotificationSettingsScreen.tsx
- contexts/AuthContext.tsx
- services/nativeAlarm.ts
- services/notificationService.ts
- plugins/native-alarm/AlarmActivity.kt
- plugins/native-alarm/AlarmPackage.kt
- plugins/native-alarm/AlarmService.kt
- plugins/native-alarm/AlarmStore.kt
- scripts/test-native-alarms.cjs
- scripts/test-profile-preferences.cjs
- scripts/test-profile-session.cjs
- RUNTIME_FIX_REPORT.md

Expo prebuild copied the authoritative plugin Kotlin files into generated android/app/src/main/java/com/notiva/alarm; their hashes were verified to match. The config plugin, AlarmAudio, authStorage and profile logout handler were inspected and did not need changes. Existing unrelated login/register/API changes were left intact.

## Validation

- `npx tsc --noEmit`: passed.
- `node scripts/test-profile-session.cjs`: passed, including immediate logout during an in-flight write, stale startup read, late profile responses and fresh startup after logout.
- `node scripts/test-profile-preferences.cjs`: passed, including Positive Vibe scheduled payload followed by Robotic Loop native mirror, concurrent read/save ordering, restart persistence, invalid/default keys, 72 sound/recurrence/vibration combinations and unchanged pre-alert sound.
- `node scripts/test-native-alarms.cjs`: passed, covering scheduling, pre-alerts, recurrence delegation, permissions, rollback and completion.
- `git diff --check`: passed.
- `npx expo prebuild --platform android`: passed.
- `android/gradlew assembleDebug`: BUILD SUCCESSFUL. Existing deprecation warnings remain.
- APK: **D:\Reminder\android\app\build\outputs\apk\debug\app-debug.apk**.

The first sandboxed build could not access the Gradle cache; the permitted retry succeeded. No device was attached according to adb. Tests above use JavaScript mocks/contracts, not Android playback. Physical-device verification remains required for actual sound selection at firing (especially an already-scheduled reminder), volume/power silence, Done/Completion Note, Dismiss, Android Back after logout, and restart persistence. The debug APK is a development build and uses Metro for JavaScript.

No Git commit or push was performed.

Native change completed — new APK/dev build rebuild venum.
