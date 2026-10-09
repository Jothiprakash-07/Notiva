# Notiva local-first item synchronization

Items are isolated by the immutable authenticated backend user ID:

- `notiva.items.v1:<userId>`: compatible local item-array mirror.
- `notiva.item.sync.queue.v1:<userId>`: authoritative durable snapshot containing
  items, compacted operations, and minimal deletion tombstones.
- The queue snapshot has a backup for interrupted/corrupt writes. Items and the
  outbox commit together, so a crash between separate item and queue writes
  cannot leave a successful local save without its replay operation. A failed
  mirror write does not invalidate the authoritative snapshot.

Web uses localStorage. Native uses the existing Expo FileSystem document files.
The device-wide legacy `notiva.items.v1` data is left untouched and is not
assigned to whichever account happens to sign in first. Those old items remain
recoverable, but are intentionally not visible in authenticated namespaces.
An explicit ownership-confirmed import is needed before uploading them.

Local create/edit/completion/delete and existing alarm operations never wait
for HTTP. Changes queue after durable local persistence. Pending create/update
operations compact to their newest payload; delete replaces a pending update.
An unattempted create followed by delete disappears without contacting the
server. An attempted create is treated conservatively because it may already
exist remotely even if its response was lost. Deletes retain tombstones.

Uploads run in delete/create/update order, with one worker at a time. Operations
have identities so an old response cannot remove a newer edit/delete. Temporary
failures keep operations with exponential retry times capped at five minutes.
The foreground runtime checks every 30 seconds, on startup/session restore,
on foreground, on mutations, and on connectivity restoration. 401/403 stops
transport until the session changes; it does not delete data or force logout.

Expo Network is loaded lazily. A development client without its native module
still uses foreground HTTP retries; loading that module's native event listener
requires a rebuilt client. No native alarm source or implementation was changed.

Pending local operations and tombstones win over server fetches. Server-only
items restore into the selected account. Known newer revisions replace synced
local data; unversioned local data is retained. Revision conflicts and invalid
updates are kept as sync_error with durable queue error metadata, rather than
discarding local changes. An exact duplicate POST is safe to acknowledge after
a lost response; differing duplicates remain conflicts.

Optional-field removal uses PATCH null; category/priority/alertBefore keep their
existing nullable values. Device alarm handles and restore scheduling intent
are never uploaded as usable schedules. Restored records persist local schedule
intent, then use the existing scheduler and recurrence reconciler. Local reads
retry pending scheduling without requiring a network response. Home and
Reminders subscribe to restore completion to refresh existing content; their
layout, status calculations and recurrence rules are unchanged.

Alarm identifiers are scoped by account at the JavaScript scheduling boundary.
Client IDs remain unchanged in item data and the backend. Notifications/native
Done for another account cannot complete the selected account's same-ID item.
Logout does not delete items, queues, onboarding state, or all alarms. Existing
legacy/other-account alarms may still ring, as requested. A pending native Done
from another account is retained; resolving multiple accounts' pending native
actions remains dependent on the existing native action queue.

## Remaining limits and validation

- Live MongoDB writes, actual airplane-mode/reconnect behavior, reinstall, and
  second-device restore still need manual validation.
- Server GET excludes tombstones. A deletion on another device is not inferred
  from absence, so this device retains its synced copy until a deletion-feed
  contract exists. Its own pending/synced tombstones never resurrect.
- Revision preflight detects observed conflicts, but is not an atomic server
  compare-and-swap. Concurrent changes between GET and PATCH require a future
  revision-precondition contract. A lost PATCH response can produce a conflict.
- Conflicts remain in local storage/queue for explicit future resolution. There
  is no new conflict-resolution UI or automatic destructive fallback.
- Sync runs while the app is active, not as a background job. Native alarms
  continue independently while the app is closed.

Manual tests: create/edit/complete/delete all four item types in airplane mode;
restart and confirm queued state and alarms; reconnect and verify owner-scoped
MongoDB records; switch A → logout → B → A; reinstall and restore future items;
confirm main/pre-alert/sound/vibration and recurring Done/Dismiss behavior;
repeat on web with preserved and cleared site storage.

Automated coverage is in `scripts/test-item-sync.cjs` and the existing backend,
auth/session, recurrence, native alarm, pre-alert and analytics regressions.
No commit or push is performed by this implementation.

## Same-minute conflicts and native runtime grouping (2026-10-08)

The existing create/edit screen checks the current account's authoritative local
items before scheduling or saving. Schedule conflict offers Change Time (keeps
form fields and opens the picker) or Keep Same Time (continues independent save).
No network request, permanent group record, or sync revision change is required.
Actual local date/minute occurrences determine conflicts and native groups.

The authoritative native plugin derives groups at delivery. One pre-alert card
uses the normal notification channel; one main foreground service/audio session
renders a solid-color grouped or solo card. Individual Done keeps the existing
durable completion action and completion-note bridge. Dismiss All stops ringing
without creating completion actions. Cancellation shrinks transient pre-alert
cards and active main groups. Generated Android sources match the plugin.

Validation: TypeScript, create/modal tests, native/pre-alert bridge tests,
Daily/Weekly/Weekdays JS and actual Kotlin regressions, 28 sync checks, 5 recurring
delete checks, 12 deletion-feed checks, and all 92 backend tests passed. Expo
prebuild and targeted app/debug instrumentation APK builds passed. The initial
broad instrumentation build failed only in an unrelated gesture-handler test
APK with duplicate fbjni.so; targeted app tasks succeeded.

Physical Vivo V2432 (10MF82FB1R0007D): conflict modal and Change Time picker;
Keep Same Time produced separate synced records and native schedules. Solo and
three-item grouped cards were inspected. Group instrumentation passed one
pre-alert, owner/date/minute isolation, cancellation, 3-to-2-to-solo transition,
one foreground card, individual durable Done, silence, and Dismiss All without
false completion. Existing native device checks passed settings/edit/repair and
reboot receiver restoration. Solo Volume Down kept the card open; Dismiss closed
it. Both temporary app items were deleted through the normal app UI; their
schedules disappeared and deletion tombstones synced. Native test identities
were cleaned. The full completion-note UI, a real phone reboot, and a second
physical device were not exercised in this validation.

No new implementation file, backend change, commit, or push was needed.

## Shared single/group actions and fixed group header (2026-10-09)

Single Done source of truth: AlarmActivity.done(id) -> AlarmService.done(id) ->
durable done:token request -> native pendingDone bridge/readPendingAlarmDone ->
NativeAlarmCompletion -> existing CompletionNoteModal -> toggleComplete -> local
commitLocalItems and sync queue. Group Done reuses this path with the selected
real item/occurrence ID. Dismiss reuses AlarmService.remove(id), leaves stored
items unresolved, and creates no note/completion. Dismiss All remains group-only.
Event/Birthday completion filtering stays in the existing app handler.

A physical trace found an older foreign-account request blocking the former
UUID-sorted pendingDone reader. The shared native bridge now selects the newest
active-account request, preserving other accounts' requests and the legacy API.
Native requests include requestedAt metadata, never a native completion flag.
The existing React Native handler prioritizes a new request over an older prompt,
keys the unchanged note modal by token to prevent cross-item drafts, and pauses
recovery during saving. The shared toggleComplete records completedAt for all
completed Reminder/Task items, alongside existing notes/status/storage/sync.

The group header/bell/date/time/count and Dismiss All stay outside the only
scrollable item list. Approved item cards and solo presentation remain unchanged.
No gradients or new implementation files. Authoritative plugin/generated alarm
sources match. App and instrumentation builds passed and were installed on Vivo
10MF82FB1R0007D.

Passed: TypeScript; shared note-modal tests for solo/group Reminder and Task;
new-request priority and note isolation; 30 sync checks including timestamp/note
payload, unchanged siblings and later Done status; native/pre-alert integration;
Daily/Weekly/Weekdays JS and actual Kotlin regressions; recurring-delete and 12
feed checks; all 92 backend tests. Physical account-checks passed newest owner
selection and preserved foreign requests. Legacy test-reminders.cjs fails before
assertions because its mock lacks NativeModules.NotivaAlarm; no legacy harness
rewrite was made.

Full physical note confirmation, final fixed-header scroll check and 3->2->1 UI
verification remain unverified: the phone locked and then ADB became unauthorized.
Five exact-name test records were soft-deleted through the authenticated API.
Local deletion-feed convergence/native cancellation must be verified after Notiva
resumes; the existing temporary validation marker is retained for that check.
No unrelated pending requests were removed. No Git commit/push.
