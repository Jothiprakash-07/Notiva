# Notiva Weekly recurrence

Implemented and validated on September 25, 2026. Existing uncommitted work was preserved. No Git commit or push was performed.

## Behavior

1. **Architecture:** Weekly reuses Daily's stored series template, dated occurrence rows, serialized storage writes, reconciliation and native master schedule. The legacy `dailySeries` property/helper names remain for compatibility; `dailySeries.repeat` distinguishes Weekly from Daily, with absent values treated as Daily.
2. **Weekday format:** `weeklyDays?: number[]`, sorted and deduplicated, Sunday = 0 through Saturday = 6 in TypeScript and native payloads. Kotlin converts `Calendar.DAY_OF_WEEK` at the boundary. Legacy Weekly items without this field default to their original weekday.
3. **Selection:** Weekly reveals seven multi-select chips using the existing purple/white rounded styles. The selected date's weekday is initially selected. Saving an empty selection shows an inline error. Selecting chips/options never checks alarm permission. Weekdays remains a separate, unchanged repeat option.
4. **Next occurrence:** Calendar date construction in JavaScript and `Calendar` arithmetic in Kotlin find the next selected weekday while retaining local clock time. Mon/Wed/Fri advances Monday → Wednesday → Friday → Monday; one selected day advances seven days. The initial occurrence aligns to the first selected weekday on or after the chosen date.
5. **History:** Each occurrence has its own status, actual date/time and completion note. Done excludes only that date from future native scheduling. Completed rows retain their historical metadata. Dismiss continues to remove only the ringing service entry.
6. **Identity:** Generated Weekly rows use `weekly:<seriesId>:<local YYYY-MM-DD>`, preserving Daily's one-occurrence-per-date identity convention. Original and edited anchor rows retain their IDs. Native delivery computes the same IDs. Set-based materialization and a deterministic native master ID prevent duplicate rows and alarms.
7. **Filters:** Today, Tomorrow, This Week and This Month use the existing actual `startAt` filters. Dated projections cover the current and following month and are extended on reads/restarts; native recurrence continues beyond that projection horizon.
8. **Pre-alerts:** Each next occurrence gets its own native pre-alert at due time minus the selected minutes, followed by its main alarm. Expired pre-alerts are silently omitted without dropping the main alarm. Android series pre-alerts are not duplicated through Expo.
9. **Background operation:** The persisted Android schedule uses `AlarmManager.setAlarmClock` for the main alarm and `setExactAndAllowWhileIdle` for valid pre-alerts. JavaScript is unnecessary for firing and advancing an already scheduled series. Existing full-screen, sound preference, volume-button and screen-off behavior is retained.
10. **Native re-arming:** Before starting the ringing service, the receiver advances the durable series to the next selected weekday and schedules its main/pre-alert pair. Reopening the app repairs missing projected rows, missing native schedule records and interrupted scheduling, silently when permission is unavailable.
11. **Reboot:** The existing `AlarmRestoreReceiver`, `RECEIVE_BOOT_COMPLETED` permission and boot/package/time/permission-change registrations already restore persisted schedules. Weekly data now participates in the same restoration path; no additional service or receiver was needed.
12. **Repeat → None:** The series is deactivated, its master alarm/pre-alert cancelled, obsolete future projections removed, and the edited row scheduled as a one-time item. History remains. The existing edit boundary is preserved: an earlier still-pending occurrence preceding the edited row is retained as a one-time alarm.
13. **Editing weekdays:** The editable occurrence and following future projections use the new weekdays. Obsolete future schedules are cancelled; cancellation IDs are persisted so cleanup can retry after interruption. Completed and earlier history remains unchanged.
14. **Editing time/pre-alert:** Future rows and native schedules use the revised local time and alert-before value. Historical rows retain original values. The same master PendingIntent is replaced rather than duplicated.

## Files changed for Weekly

- `app/screens/create/[type].tsx`: weekday selection, validation and recurrence-owned saves.
- `types/item.ts`: weekday metadata and backward-compatible series repeat type.
- `utils/weeklyRecurrence.ts`: normalization, next-weekday helper and initial-date alignment.
- `utils/dailyRecurrence.ts`: shared Weekly materialization, template and identity behavior.
- `services/itemStorage.ts`: shared Weekly lifecycle, edits, reconciliation and durable cleanup.
- `services/nativeAlarm.ts`: Weekly native payload, build capability check and schedule lookup.
- `services/notificationService.ts`: native Weekly delegation and weekday-aware Expo triggers.
- `plugins/native-alarm/AlarmStore.kt`: selected-weekday matching, occurrence identity and exclusions.
- `plugins/native-alarm/AlarmPackage.kt`: Weekly capability and persisted-schedule query.
- `scripts/test-weekly-recurrence.cjs`: new storage/helper/filter/native-wiring regressions.
- `scripts/WeeklyAlarmRegression.java`: new tests against the compiled production Kotlin scheduler.
- `scripts/test-daily-native.cjs`: accepts the native regression source to execute.
- `scripts/test-native-alarms.cjs`: Weekly bridge and persisted-storage test fixtures.
- `scripts/test-create-analytics.cjs`: multi-select, empty selection and scheduling ownership checks.
- `WEEKLY_IMPLEMENTATION.md`: this report.

Expo prebuild also copied the native plugin sources into the generated Android project. Other pre-existing changes shown by Git, including Home filtering, app configuration and picker work, were retained.

## Validation results

All of these passed:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `node scripts/test-weekly-recurrence.cjs` | Passed, including Kolkata/New York/UTC and DST boundaries |
| `node scripts/test-daily-recurrence.cjs` | Passed |
| `node scripts/test-native-alarms.cjs` | Passed |
| `node scripts/test-create-analytics.cjs` | Passed |
| `node scripts/test-reminder-date-filter.cjs` | Passed |
| `node scripts/test-daily-native.cjs` | Passed against compiled Kotlin |
| `node scripts/test-daily-native.cjs WeeklyAlarmRegression.java` | Passed against compiled Kotlin |
| `git diff --check` | Passed; only Git line-ending advisories |
| `npx expo prebuild --platform android` | Succeeded |
| `.\gradlew assembleDebug` (from `android`) | BUILD SUCCESSFUL, 663 tasks; existing deprecation warnings |

The first Gradle invocation could not write its default `C:/.gradle` cache. The successful build used `GRADLE_USER_HOME=C:/Users/ELCOT/.gradle`. Set that same environment variable when running the native regression scripts in this environment.

APK: `D:/Reminder/android/app/build/outputs/apk/debug/app-debug.apk` (224,861,563 bytes). This is the requested debug/development build; normal development use loads JavaScript through Metro.

The implementation supports the existing native scheduling path for foreground, background, removal from Recents, locked screen, absent JavaScript and idle/Doze with the necessary permissions. **Physical-device delivery in those states was not exercised in this session.** Native tests cover calculation and persisted JSON restoration, and contract tests cover receiver wiring; they do not simulate an actual reboot or Android alarm delivery. Full-screen presentation remains subject to the existing permission flow and Android/device behavior.

No support is claimed for uninstall, a powered-off phone, or Android Force Stop.

Idhu native change — new APK/dev build rebuild venum.

Reference consulted before code changes: [Expo v54 SDK documentation](https://docs.expo.dev/versions/v54.0.0/) and [Expo v54 Notifications](https://docs.expo.dev/versions/v54.0.0/sdk/notifications/).
