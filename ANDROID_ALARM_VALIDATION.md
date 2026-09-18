# Native alarm validation — 2026-09-16

The existing implementation was retained. No Git commit or push was performed.

## Build result

- `npx tsc --noEmit`: passed, including after the final changes.
- `npx expo prebuild --platform android --no-install`: passed, reusing the existing Android directory without `--clean`. A backup of native sources and app/package configuration is in `.build-tools/prebuild-backup`.
- All four generated alarm Kotlin files now match `plugins/native-alarm` byte for byte. The generated files had been stale, missing already-implemented Done/keyguard and cancellation-promise fixes.
- `gradlew assembleDebug`: **not successful; no APK produced**. Initial failure was missing SDK location. After installing/configuring the SDK, dependency extraction exhausted drive C: (`java.io.IOException: There is not enough space on the disk`). The build was stopped and its incomplete React Native transform removed, recovering approximately 1.6 GiB. More free space is needed for the full build.
- Separate Kotlin 2.1.20 compilation of AlarmActivity, AlarmPackage, AlarmService, and AlarmStore against Android API 36 and React Native 0.81.5: **passed, warnings only**. This does not replace Gradle assembly, manifest merging, DEX, packaging, or device tests. Log: `.build-tools/alarm-compile/compile.log`.
- No Kotlin/Java/Manifest/Gradle source error attributable to the alarm implementation was found. Initial Kotlin daemon cache access errors were avoided with in-process compilation. A PowerShell-split Gradle property argument was corrected by quoting it.

## Local toolchain

The initial process had no JAVA_HOME, ANDROID_HOME, or ANDROID_SDK_ROOT; `java -version` was not found on PATH. The existing workspace JDK reports OpenJDK/Temurin 17.0.20.1. Installed SDK components include platform 36, build tools 36.0.0 and 35.0.0, platform tools, NDK 27.1.12297006, and CMake 3.22.1.

Run from the project root after freeing additional disk space:

```powershell
$env:JAVA_HOME = 'C:\Desktop\Reminder\.build-tools\jdk\jdk-17.0.20.1+1'
$env:ANDROID_HOME = 'C:\Desktop\Reminder\.build-tools\android-sdk'
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:ANDROID_USER_HOME = 'C:\Desktop\Reminder\.build-tools\android-user'
$env:GRADLE_USER_HOME = 'C:\Desktop\Reminder\.build-tools\gradle'
$env:NODE_ENV = 'development'
Set-Location android
.\gradlew assembleDebug '-Pkotlin.compiler.execution.strategy=in-process' --max-workers=2 --console=plain
```

These are process-local settings; global environment settings were not changed.

## Confirmed fixes and files changed

- `app/screens/create/[type].tsx`: old-ID cleanup no longer cancels a replacement alarm with the same stable native ID; synchronous save guard prevents same-render double submission.
- `services/notificationService.ts`: serializes scheduling per item and removes previous Expo requests for that Android item before replacing them, preventing duplicate pre-alert accumulation.
- `components/common/NativeAlarmCompletion.tsx`: after confirmed completion, uses existing notification item routing to reload storage and show the saved Done item instead of leaving stale underlying screen state.
- `scripts/test-native-alarms.cjs`: corrected cross-VM Error identity and added exact 22:00/21:55 timing, default sound, repeated/concurrent scheduling, rescheduling, deletion, vibration preference, and edit cleanup regressions.
- `scripts/test-action-stack.cjs`: added native Done recovery, Cancel, optional-note confirmation, acknowledgement, and saved-item routing coverage.
- `scripts/test-reminder-date-filter.cjs`: supplied the missing BackHandler mock; existing date-filter tests pass.
- This validation report.
- Ignored generated Android sources refreshed by prebuild; local SDK/build outputs are under ignored `.build-tools` and `android` directories.

## Manifest

The generated source manifest contains exactly one AlarmService (`mediaPlayback`, `stopWithTask=false`), AlarmActivity (`singleTask`, `showWhenLocked=true`, `turnScreenOn=true`), AlarmReceiver, and AlarmRestoreReceiver. All four components are non-exported. AlarmPackage is registered in MainApplication. Restore actions include boot, package replacement, time/time-zone changes, and exact-alarm permission changes.

Each alarm permission occurs exactly once:

- android.permission.SCHEDULE_EXACT_ALARM
- android.permission.USE_FULL_SCREEN_INTENT
- android.permission.FOREGROUND_SERVICE
- android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK
- android.permission.WAKE_LOCK
- android.permission.VIBRATE
- android.permission.RECEIVE_BOOT_COMPLETED
- android.permission.POST_NOTIFICATIONS

Other existing app/development permissions were retained. Final merged-manifest/package validation is pending the complete build.

## Flow results and evidence limits

| Check | Result |
| --- | --- |
| 22:00 reminder / five-minute pre-alert | Mock integration passes: one Expo request at 21:55 with default sound, one native alarm at 22:00, no Expo main-time request. |
| Pre-alert tap | Test passes: native main alarm and recurrence are not cancelled. |
| Looping sound and vibration | Kotlin compiles; code owns one looping MediaPlayer and repeating vibration. Physical output untested. |
| Foreground notification | Code uses one fixed card ID and one player, with a silent notification channel and only-alert-once. Actual displayed count untested. |
| Native Done | Code stops ringing/removes foreground notification and stores a pending action. Component test verifies existing modal opens without completing, Cancel preserves status, and Skip Note confirms once. Storage completion/cancellation tests pass. Native launch/stop timing untested. |
| Dismiss | Code removes the ringing alarm, releases player/vibration, removes the foreground notification for the last alarm, and closes UI. It does not write Done or Action Required state. Physical interaction untested. |
| Complete before alarm / delete | Mock integration passes: native and Expo schedules removed. |
| Edit / repeated reschedule | Tests pass: replacement native ID retained, old pre-alert removed, one native alarm and one pre-alert remain. |
| Concurrent repeated scheduling | Five concurrent requests leave one native alarm and one Expo pre-alert in the integration harness. Android PendingIntent replacement is code-reviewed, not device-observed. |
| 45-second developer test | Scheduling/storage contract passes. Device delivery not run. |
| App foreground | NOT RUN on a device. |
| App background | NOT RUN on a device. |
| Phone locked | NOT RUN on a device. |
| Swiped from recents | NOT RUN on a device. |

`adb devices -l` returned an empty device list. Full-screen display depends on Android permission/policy. Audio remains subject to device alarm volume/settings; vibration honors the app preference. Multiple simultaneously due items intentionally share the foreground service/card. The existing ringing timeout is ten minutes. Force Stop support is not claimed.

## Test suite status

Passed: native alarm integration, Action Required/shared completion/native completion component tests, notification history tests on mocked web/Android/iOS, date-filter tests across three time zones, TypeScript, and `git diff --check`.

`scripts/test-reminders.cjs` remains an obsolete failing suite: its Android mock has no native bridge and it expects three-notification bursts (`0 !== 3` at line 55). The implementation was not changed to restore those obsolete bursts. Its expectations need a separate migration; this report does not claim all repository tests pass.

Remaining prerequisites: free additional local disk space, complete Gradle assembly, connect an authorized physical Android device with USB debugging, install the development build, and run all four 45-second scenarios plus Done/Dismiss and notification-count observations.
