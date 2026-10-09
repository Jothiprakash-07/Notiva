# Notiva Weekdays recurrence and Android status bar

Implemented and validated on September 25, 2026. Existing Daily/Weekly work and other uncommitted changes were preserved. No Git commit or push was performed.

## Recurrence behavior

1. **Architecture:** Weekdays now uses the same stored series template, `seriesId`, dated rows, serialized storage writes, durable scheduling and reconciliation as Daily/Weekly. The backward-compatible `dailySeries.repeat` field accepts `weekdays`. No parallel recurrence engine was introduced.
2. **Next-day algorithm:** A fixed `[1, 2, 3, 4, 5]` set uses Sunday=0 numbering internally. `nextWeekdayOccurrence` reuses the tested calendar-date helper, preserving local clock time. Monday through Thursday advance one day; Friday, Saturday and Sunday advance to Monday. Weekend start dates align to Monday. Weekdays does not persist or depend on user-selected `weeklyDays`.
3. **Occurrences/history:** Each dated row preserves its title, description, priority, category, alert-before and relevant template metadata with `repeat: weekdays`. Done changes only that occurrence, keeps its completion note and historical time, and leaves the series active. Dismiss still stops only the ringing alarm service entry.
4. **Duplicate protection:** Generated IDs use `weekdays:<seriesId>:<local YYYY-MM-DD>`, with original/edited anchor IDs retained. Native delivery derives the same identity. Idempotent materialization and a deterministic native master ID prevent duplicate rows/schedules. Missing rows and native schedule records are repaired; dirty scheduling intent retries after restart.
5. **Filters:** Existing filters continue to use actual occurrence dates. Friday appears in Today; Saturday/Sunday contain no Weekdays rows. This Week and This Month include applicable Monday–Friday rows and preserved history. No filter calculations or extra card date UI were changed.
6. **Pre-alerts:** Each next occurrence has its own native main/pre-alert pair. For a 09:00 occurrence and five-minute alert, the pre-alert is 08:55. Expired pre-alerts are silently skipped while retaining the main alarm. Native series pre-alerts are not duplicated through Expo.
7. **Native re-arming:** Weekdays joins the existing series path for native occurrence IDs, completed-date exclusions, calendar clock restoration and the native capability check. The receiver schedules the next weekday before starting the current ringing service. Already scheduled recurrence does not need JavaScript alive.
8. **Reboot:** Existing persisted JSON, `AlarmRestoreReceiver`, boot permission and boot/time/package/permission-change registrations handle Weekdays. No new receiver or background service was added. Exact-alarm permission behavior remains intact.
9. **Weekdays → None:** Existing edit semantics deactivate the series, cancel its master alarm/pre-alert and obsolete future schedules, retain historical rows, and schedule the edited row as a one-time item. Earlier pending rows before the edited occurrence retain the existing one-time-alarm preservation behavior.
10. **Time/alert edits:** Future rows and the replacement native schedule use the new clock and alert-before. Completed and earlier history retains original values. Obsolete schedule cleanup uses the existing durable cancellation mechanism.

## Status bar

11. **Implementation:** A single `AppStatusBar` is mounted in the root layout, including while auth is loading. Screen-level conflicting status bars were removed from Home, Create, New Reminder, Splash, Onboarding, Login and both registration screens. The root native Stack also uses light Android status-bar icons, preventing navigation transitions from restoring dark icons. Tabs, details and profile/settings inherit this root configuration.
12. **Appearance and safe area:** Android icons/text use Expo `style="light"` and Stack `statusBarStyle="light"`. A non-interactive absolute View paints exactly the measured top safe-area inset with `#4D3FE6`. This follows edge-to-edge behavior instead of relying on the deprecated background-color prop. Existing screen SafeAreaViews, content spacing, screen backgrounds and bottom navigation remain intact. Native AlarmActivity and its lock-screen/full-screen UI were not changed. No status-bar-specific native/config change was necessary; edge-to-edge was already enabled.

Weekdays shows “Repeats Monday to Friday” and no weekday chips. Weekly retains its selectable purple chips. Monthly and Yearly behavior was not modified. Alarm sounds, silence controls, Completion Note UI, analytics calculations, picker styling, auth/session logic, organization and backend code were not changed.

## Files modified in this task

Recurrence implementation:

- `types/item.ts`
- `utils/weeklyRecurrence.ts`
- `utils/dailyRecurrence.ts`
- `services/itemStorage.ts`
- `services/nativeAlarm.ts`
- `services/notificationService.ts`
- `plugins/native-alarm/AlarmStore.kt`
- `plugins/native-alarm/AlarmPackage.kt`
- `app/screens/create/[type].tsx`

Global status bar and removal of conflicting screen overrides:

- `components/common/AppStatusBar.tsx` (new)
- `app/_layout.tsx`
- `app/screens/home/HomeScreen.tsx`
- `app/screens/reminder/NewReminderScreen.tsx`
- `app/screens/Splash/SplashScreen.tsx`
- `app/screens/Onboarding/OnboardingScreen.tsx`
- `app/screens/login/LoginScreen.tsx`
- `app/screens/login/UserRegisterScreen.tsx`
- `app/screens/login/OrganizationRegisterScreen.tsx`

Tests and report:

- `scripts/test-weekdays-recurrence.cjs` (new)
- `scripts/WeekdaysAlarmRegression.java` (new)
- `scripts/test-status-bar.cjs` (new)
- `scripts/test-native-alarms.cjs` (Weekdays bridge fixture)
- `scripts/test-create-analytics.cjs` (Weekdays/Weekly UI behavior)
- `WEEKDAYS_STATUS_BAR_REPORT.md` (new)

Expo prebuild copied the modified native plugin sources into the generated Android project. Other pre-existing changes visible in Git were retained.

## Validation

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `node scripts/test-weekdays-recurrence.cjs` | Passed |
| `node scripts/test-weekly-recurrence.cjs` | Passed |
| `node scripts/test-daily-recurrence.cjs` | Passed |
| `node scripts/test-native-alarms.cjs` | Passed |
| `node scripts/test-create-analytics.cjs` | Passed |
| `node scripts/test-reminder-date-filter.cjs` | Passed |
| `node scripts/test-status-bar.cjs` | Passed |
| `node scripts/test-daily-native.cjs` | Passed against compiled Kotlin |
| `node scripts/test-daily-native.cjs WeeklyAlarmRegression.java` | Passed against compiled Kotlin |
| `node scripts/test-daily-native.cjs WeekdaysAlarmRegression.java` | Passed against compiled Kotlin |
| `git diff --check` | Passed; Git emitted line-ending advisories |
| `npx expo prebuild --platform android` | Succeeded |
| `.\gradlew assembleDebug` from `android` | BUILD SUCCESSFUL in 1m 3s; 663 tasks |

Weekdays tests cover all seven day transitions, local-time/DST preservation, weekend alignment, metadata, Done/note retention, actual-date filters, missing row/schedule repair, duplicate protection, None and time/alert edits in Kolkata, New York and UTC. Native tests execute the production Kotlin helpers, including pre-alert time/expiry, completion exclusions and persisted JSON restoration. Dismiss and reboot receiver wiring have regression contract checks.

Status-bar tests exercise Android/iOS/web branches and top insets of 0/24/48, confirming the purple backdrop, light Android icons, no added content padding, no bottom-bar changes and no remaining screen overrides. They are component/contract tests, not physical-device visual tests.

The build used `GRADLE_USER_HOME=C:/Users/ELCOT/.gradle`. Use the same variable for native regression tests in this environment. The build emitted existing Kotlin/Gradle deprecation warnings but no errors.

APK: `D:/Reminder/android/app/build/outputs/apk/debug/app-debug.apk` (224,861,563 bytes; rebuilt September 25, 2026 at 21:27 local time). This is the requested debug/development build and uses Metro for development JavaScript.

The native path is designed for foreground/background, removal from Recents, locked screen, absent JavaScript and idle/Doze with required permissions. **Physical-device delivery, actual reboot restoration and status-bar appearance were not exercised in this session.** Calculator/persistence tests and a successful build do not establish device-level delivery. No support is claimed for uninstall, a powered-off phone or Android Force Stop.

No Git commit or push was performed.

Idhu native change — new APK/dev build rebuild venum.

References: [Expo v54 SDK](https://docs.expo.dev/versions/v54.0.0/), [Expo v54 StatusBar](https://docs.expo.dev/versions/v54.0.0/sdk/status-bar/), [Expo system bars](https://docs.expo.dev/develop/user-interface/system-bars/). The installed Expo status-bar Android implementation also explicitly recommends a View behind the system bar when edge-to-edge is enabled.
