# Shared recurring alarm re-arm reliability

Implemented for Android. No backend/database changes, future occurrence documents, Git commit or Git push.

1. **Previous root cause.** `sharedAlarms.ts` derived one future occurrence, then passed a temporary item with `repeat: none` to the existing scheduler. `AlarmStore.fire` correctly consumed it as a one-off and removed its native schedule. Only a later JS reconciliation could register another date. The native receiver already had a suitable re-arm-before-ringing path for personal recurrence.

2. **Native change required: yes.** Shared series need their own IANA timezone, schedule generation and occurrence identity. Passing a personal repeating payload unchanged would use the device timezone and personal occurrence IDs. The existing AlarmStore/receiver/service/plugin were extended; no separate native database or background-task framework was added. Personal recurrence calculation remains on its existing branch.

3. **Trigger.** `AlarmReceiver` delivers to synchronized `AlarmStore.fire`. The store snapshots each same-minute member, derives its next future occurrence, saves/registers that member's next main/pre-alert pair, and only then starts the existing foreground ringing service. This happens before any UI, Done, Dismiss, silence, timeout, network call or JS execution. Shared schedule metadata remains persisted while advancing, rather than being deleted between occurrences.

4. **Native metadata.** The existing `schedule:<stable-control-id>` JSON includes a versioned `sharedRecurrence` object: active flag, account-scoped base item identity, organization/item routing IDs, IANA timezone, original anchor timestamp, rule effective instant, schedule revision, selected weekly days and the earliest still-eligible timestamp (`notBefore`). Existing repeat, title/description/type, sound, vibration, pre-alert offset, next main timestamp, pre-alert cursor and delivered-pre-alert cursor are reused. Native code stores no membership lists, completion ledger or backend database copy. JS supplies the eligibility lower bound after applying authoritative or pending completion state.

5. **Daily.** The receiver advances to the next valid series-local calendar day with the same wall time, even with the app process/UI absent and no network.

6. **Weekly.** Selected weekdays retain the canonical personal/shared meaning. A single selected weekday advances one week; multiple selected weekdays choose the next selected date.

7. **Weekdays.** Only Monday through Friday qualify. Fixed-clock tests verify Friday advances to Monday.

8. **Monthly.** The anchor day is retained. Missing dates are skipped, never clamped or drifted. Parity fixtures cover days 28/29/30/31 and February across leap/non-leap years.

9. **Yearly.** The anchor month/day is retained. February 29 advances to the next leap year. The rule adapter mirrors `shared/recurrence.cjs`: timezone offsets, earlier DST fold and forward gap handling, with UTC calendar-date iteration to avoid DST drift. No new product recurrence rule was introduced.

10. **Done.** The already-fired occurrence payload has its own item ID/key. Existing native Done stops ringing and durably stores the completion intent. Shared server completion still requires the existing app confirmation/sync flow and remains occurrence scoped. Native re-arm does not complete either an individual or collective task. Done does not delete the already-registered next series schedule.

11. **Dismiss/silence.** Dismiss removes the ringing occurrence only and records no completion. Screen-off and volume silence retain existing behavior; timeout stops the ringing service. None controls whether the next native schedule exists. Done/Dismiss/screen-off separation was inspected and checked with native source contracts; physical UI interaction remains deferred.

12. **Pre-alerts.** Both cursors use the native scheduler and persisted preferences. The next main and next eligible pre-alert are registered independently; a long lead may refer to a later occurrence. Already-delivered/expired pre-alert behavior is preserved. Shared pre-alert taps now route to shared detail. Tests execute actual Kotlin pre-alert processing, repeated stale pre-alert broadcasts, main firing afterward and confirm one main/one pre PendingIntent remains.

13. **Grouping.** Existing account/same-minute grouping remains in AlarmStore and AlarmService. A mixed personal/shared group starts one ringing session, snapshots each member independently and advances each recurring shared series once. The group is never treated as a recurrence series. Occurrence-specific ringing IDs preserve individual actions. A source-handle removal helper lets authoritative reconciliation stop a ringing shared occurrence as well as cancel its next schedule.

14. **Edit/cancel/access reconciliation.** JS journals a stable series cancellation handle, cancels the old pair and writes fresh revision/rule metadata before scheduling a replacement. Registry migration cancels the previous one-off occurrence handle too. Cancellation, organization/account cleanup and membership revocation remove the same persisted series record and both PendingIntents. A late old broadcast cannot recreate missing metadata. Revision-bearing delivery fragments reject stale broadcasts after edits. Team snapshot rules and backend completion semantics are unchanged. Remote cancellation or collective completion becomes known when normal synchronization resumes.

15. **Offline.** Native calculation/registration requires no network, JavaScript or main app. A synchronized series can keep re-arming after each delivery. Cached/pending completion reconciliation still updates its local eligibility lower bound. An offline device cannot know another recipient's completion or a remote cancellation before syncing.

16. **Process death/reboot.** Ordinary process death leaves persisted schedules and AlarmManager registrations. Existing boot/package-replaced/time-set/timezone-change/exact-permission restore broadcasts call the same store. Restore derives the next future valid date from persisted JSON and re-registers the pair; it does not replay all missed alarms. Series timezone stays fixed when the device timezone changes. JVM tests exercise fresh-context restoration from persisted strings and an empty simulated AlarmManager; actual Android reboot/receiver delivery is deferred.

17. **Duplicate prevention.** Stable account/org/item control handle; distinct occurrence key fragments on main/pre PendingIntent URIs; distinct `pre` action; persisted pre-delivery cursor; synchronized mutation; nextAt guard; and stale-fragment rejection. Repeating fire/receiver/pre processing leaves one next main and one next pre entry. Ringing/Done payloads contain the actual occurrence key, separate from the stable control handle. No future database documents are involved.

18. **Parity.** 440 fixed JS-generated fixtures executed against the compiled production Kotlin calendar under three different host timezones: **1,320 next-time/key parity cases passed**. Series zones include UTC, Kolkata, New York, Berlin and Lord Howe; all frequencies, weekly selection, monthly edge dates, leap days, DST gaps/folds and host-zone independence are covered. Original personal recurrence helpers were not changed. The new Kotlin wall-time adapter is necessary because native receivers cannot run the JS calendar; fixtures check it against the canonical JS representation.

19. **Validation passed.** Expo Android prebuild and Gradle `assembleDebug`; compiled production Kotlin AlarmStore fire/re-arm/pre-alert/group/restore/edit/cancel tests with Android OS boundaries replaced by JVM doubles; the 1,320 parity cases; compiled personal Daily/Weekly/Weekdays and NativePreAlert regression programs; ten JS regression scripts (native alarms, pre-alerts, personal daily/weekly/weekdays/master recurrence, item sync, shared recurrence, shared service and shared rendered UI); TypeScript. Shared suites include 15 recurrence checks, 30 service checks and 17 rendered checks. Lint has zero errors and five existing warnings. Backend tests were not rerun because no backend code changed. No device was connected (`adb devices` empty), so no physical result is claimed. Build used a temporary portable JDK 17 because the configured JDK path was stale and installed Android Studio JDK 25 was incompatible with this Gradle/Kotlin setup.

20. **Files changed for this task.** `plugins/native-alarm/SharedAlarmRecurrence.kt` (new), `AlarmStore.kt`, `AlarmService.kt`, `AlarmPackage.kt`; their generated copies under `android/app/src/main/java/com/notiva/alarm/`; `services/sharedAlarms.ts`, `services/nativeAlarm.ts`; `scripts/test-shared-native.cjs` and `SharedAlarmRegression.java` (new), `test-native-alarms.cjs`, `test-shared-recurrence.cjs`; this report and a superseding note in the earlier recurrence report. Generated Android sources remain governed by the existing plugin. Other uncommitted foundation work was preserved.

21. **Android/platform limits.** Explicit Force Stop can block receivers/services and invalidate delivery until the user opens the app again; this implementation does not bypass that restriction. Exact-alarm permission, notification/full-screen settings, power/vendor restrictions, device shutdown and clock changes can affect delivery. Reboot restoration uses the existing normal boot receiver, not direct-boot storage. OS scheduling failure/process death during the non-atomic persistence/AlarmManager boundary cannot be guaranteed; persisted state allows existing restore/repair paths to recover. iOS retains its previous scheduling behavior; this native reliability change targets Android. Physical Done/Dismiss, audio/volume/screen-off, grouped ringing and reboot checks remain for the final device pass.

22. **APK rebuild required: yes — built successfully.** **Idhu native change — new APK/dev build rebuild venum.** The updated APK is `C:\Desktop\Reminder\android\app\build\outputs\apk\debug\app-debug.apk`. Install that build before expecting shared native re-arm; a dev-client reload alone is insufficient. For future builds, configure a working JDK 17, then run:

```powershell
cd C:\Desktop\Reminder
npx expo prebuild --platform android
cd android
.\gradlew assembleDebug
```

The APK was built but not installed because no device was connected.
