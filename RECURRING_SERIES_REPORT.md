# Recurring series refactor â€” validation report

## 1â€“3. Old behavior and causes
`materializeDaily` expanded Daily/Weekly/Weekdays from the anchor through the following month. `reconcileDaily` persisted that array. Every child had its own ID, so the normal outbox produced separate creates and the existing items API accepted separate documents. Lists rendered those persisted rows. Deleting the anchor previously retained a hidden template and future alarm.

## 4â€“7. Master model, calculation, previews, activation
The existing `dailySeries` field now supports all five repeat modes. A new series keeps its original item ID, account namespace and document. `dailySeries.template.startAt` anchors the calendar rule; the master `startAt` represents its current occurrence. `masterVersion: 1` makes legacy adoption one-time. `occurrenceKey` includes series ID and local date/time. Existing native dated IDs remain compatible with completion routing.

`occurrenceOn` is the shared date predicate. `materializeDaily` now reconciles the master, without appending item rows. Local calendar dates activate at midnight, independently of alarm time. Startup and foreground reconcile offline; the existing runtime now has a rescheduled midnight timeout and notifies subscribed screens.

Tomorrow and explicit date filters call `itemsForDate` for one date. Previews carry a presentation-only flag, no alarm handles, and a Preview badge. They cannot toggle, select/delete, save, reschedule, enter sync or schedule notifications. Current lists, Action Required and analytics exclude future previews. Range filters derive a preview only for the selected From date (or To date when open-ended); they do not expand every date in a range.

## 8â€“9. Done, Dismiss, Missed and Overdue
The existing completion-note UI, `toggleComplete`, timestamps, note trimming and outbox remain in use. Sparse form edits preserve existing compact history. Done stores the result on the same master and excludes its date from native delivery; no future real card replaces it. Completion calls accept the expected scheduled timestamp to reject stale dialogs. Dismiss retains the existing unresolved native behavior. Canonical status calculation still produces Reminder Missed / Task Overdue. The next valid date resets current completion fields and archives the result.

## 10â€“12. Offline, online and multiple devices
Recurrence, completion and history are local. Normal outbox compaction updates the same identity. The new sync test performs 365 offline rollovers and reconnects and verifies one document, one POST, update-only subsequent operations and account isolation.

Identical-rule conflicts merge compact occurrence results and retain the later current occurrence. Rule edits still use the existing visible conflict path. PATCH optionally uses If-Match revision guarding; a racing series PATCH retries rather than overwriting a newer revision. Tombstones, account scoping, deletion feed and pending-local-change handling remain in place.

## 13. Native alarms
The authoritative change is in `plugins/native-alarm/AlarmStore.kt`. Monthly/Yearly now honor series exclusions and reset the anchor clock consistently. All five repeat modes use the existing durable series main/pre-alert path. Native delivery still re-arms independently of JS and internet. Generated Android source SHA-256 matches the plugin source.

Existing native policy was **skip invalid calendar dates**, not clamp. Monthly 29/30/31 skip months missing that day. Yearly February 29 skips non-leap years; 2024 advances to 2028. JS and actual compiled Kotlin tests cover these cases. Native group/date/minute identity and the existing Done bridge remain intact.

## 14â€“15. Database and migration
New series: one local master and one `items` document, including after a year of updates. No new collection or per-occurrence create queue was introduced. The backend HTTP/schema test performs 365 PATCH updates and checks one document and stale-revision rejection. These are isolated database doubles, not a claim about production MongoDB contents.

Migration retires only future children matching a known parent, deterministic generated ID, template metadata and clock, without completion/note evidence. The existing owner-scoped deletion queue handles already-synced duplicates; associated obsolete alarms are cancelled. The current legacy child's completion/note is adopted once. Historical and edited legacy records are deliberately retained through compatibility reading; no broad database migration ran. Therefore old installations may still contain multiple historical/edited documents for a legacy series. Tombstoned hidden anchors are deactivated, not revived.

## 16. UI and history
Existing card layout, colors and typography remain. Previews show a subtle status label and suppress mutation controls. Compact results produce read-only historical cards and preserve completion-note details. Analytics includes real current/past state and compact results, excluding future previews. History retains the newest **366 compact results** per master; older new-model results are pruned. Multi-day gaps generate bounded compact unresolved results, not full item rows.

## 17. Modified files
- `app/(tabs)/reminders.tsx`
- `app/screens/create/[type].tsx`
- `app/screens/details/[id].tsx`
- `app/screens/home/HomeScreen.tsx`
- `backend/controllers/itemController.js`
- `backend/services/itemData.js`
- `backend/tests/items.test.js`
- `components/common/NativeAlarmCompletion.tsx`
- `components/home/ActionRequiredStack.tsx`
- `components/home/ReminderCard.tsx`
- `plugins/native-alarm/AlarmStore.kt`
- `scripts/NativePreAlertRegression.java`
- `scripts/test-daily-recurrence.cjs`
- `scripts/test-item-delete-sync.cjs`
- `scripts/test-item-deletion-feed.cjs`
- `scripts/test-item-sync.cjs`
- `scripts/test-reminder-date-filter.cjs`
- `scripts/test-reminders.cjs`
- `scripts/test-weekdays-recurrence.cjs`
- `scripts/test-weekly-recurrence.cjs`
- `services/itemStorage.ts`
- `services/itemSyncQueue.ts`
- `services/itemSyncRuntime.ts`
- `services/itemSyncService.ts`
- `services/nativeAlarm.ts`
- `services/notificationService.ts`
- `types/item.ts`
- `utils/dailyRecurrence.ts`
- `utils/itemAnalytics.ts`
- `utils/itemSorting.ts`
- `utils/itemStatus.ts`

Pre-existing user changes in `services/apiConfig.ts` and `backend/package-lock.json` were left untouched. The only `git diff --check` finding is a pre-existing trailing blank line in `services/apiConfig.ts`.

## 18. New files
- `scripts/test-master-recurrence.cjs`: master lifecycle, five rules, preview restrictions, migration, calendar boundaries and bounded history tests.
- `scripts/test-master-sync.cjs`: 365 offline/online cycles, stable database identity, merge, stale-completion and offline foreground tests.
- `scripts/test-recurrence-preview-ui.cjs`: renders the real card and verifies preview interactions cannot mutate an occurrence.
- This report: implementation decisions, validation and limits.

No new production service was added. The old daily/weekly/weekday recurrence tests were updated because their previous assertions required persisted future children and occurrence-only deletion, which contradict the requested behavior.

## 19â€“21. Automated results
- TypeScript `npx tsc --noEmit`: passed.
- Master recurrence: **904 assertions passed**, including a 400-day bounded-history simulation.
- Master sync: **365 offline rollovers/reconnects passed**, one document and one POST.
- CJS suite pass/fail: **23 of 23 scripts passed**. Daily entrypoint delegates to the master suite; do not count its repeated assertions twice.
- Existing item-sync suite: 30 checks passed. Deletion feed: 12 checks passed. Delete-sync, completion-note/action-stack, native alarms, pre-alerts, same-time conflict, analytics, date filters, auth/login/recovery/profile/onboarding and status-bar suites passed.
- The old `test-reminders.cjs` harness initially failed identically against pre-change alarm code. It now supplies native-alarm mocks and checks the current single-main/pre-alert contract instead of obsolete Expo bursts; its completion, rescheduling, storage-failure, permission and response checks pass.
- Real ReminderCard rendering test passes: Preview label, disabled click/toggle/selection/long-press, and actionable current cards.
- Backend: **93/93 tests passed**, using `node --test --experimental-test-isolation=none backend/tests/*.test.js` (process isolation was blocked by the sandbox).
- Actual compiled Kotlin: DailyAlarmRegression, WeeklyAlarmRegression, WeekdaysAlarmRegression and NativePreAlertRegression all passed. The latter includes new Monthly/Feb-29/exclusion checks.
- Expo Android prebuild passed. Android debug APK build passed (663 tasks; 59 executed). Isolated Android test APK build passed.

## 22. Physical Vivo results
Vivo V2432, serial 10MF82FB1R0007D: updated debug APK installed successfully. Device instrumentation reported:
- PASS pre-alert edit 5â†’10/time, settings OFF/ON, vibration preference, foreground repair, reboot restoration code path/expired skip, Repeatâ†’None and pair cancellation.
- PASS account-scoped Done bridge selection and preservation of foreign-account requests.
- PASS actual grouped alarm delivery, owner/date/minute grouping, one grouped pre-alert, member cancellation, threeâ†’twoâ†’solo, one foreground notification, durable individual Done, silence, and Dismiss All without false completion.

The instrumentation uses isolated test schedule identities and cleans them up. These checks do not claim a physical power-cycle, overnight wait, manual volume-key/screen-off exercise, or full interactive JS UI validation on the phone. No production database was modified for validation.

## 23. Known limits
- Legacy historical/edited occurrence documents remain; compatibility is intentional to avoid deleting valid user data. New series and new progression use one master.
- Compact history is limited to 366 results. Historical cards are read-only.
- Future date ranges preview only their selected boundary date, not all dates in the range.
- Android native parity is tested. iOS/Expo recurring delivery was not physically validated; its existing calendar-trigger path remains.
- Overnight, physical reboot and manual hardware silence checks remain unverified as described above.

## 24â€“25. Native change and rebuild
Native Kotlin and recurrence scheduling changed. A fresh APK was built and installed on the connected Vivo. Other installations need the new native build; current TS changes are loaded by the development client.

**Idhu native change â€” new APK/dev build rebuild venum.**

No Git commit or push was performed.
