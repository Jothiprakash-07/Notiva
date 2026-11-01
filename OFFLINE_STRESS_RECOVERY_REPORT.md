# Offline stress / recovery validation — 2026-10-21

Result: deterministic stress, regression and isolated real-MongoDB validation passed. Physical validation remains for the final device pass. No commit or push performed.

## Architecture reviewed before changes

Items, pending operations, conflicts, tombstones, deletion cursor and cancellation intent share an account-scoped authoritative snapshot. Mutations serialize, save a previous valid backup, then write the snapshot and a repairable item mirror. Pending edits compact by client item ID. Local unsynced changes and tombstones are protected from server fetches.

The foreground runtime owns one network subscription and retry/midnight timers per mounted runtime. Reconnect and foreground events invoke the serialized sync worker; concurrent triggers coalesce. Retry deadlines and attempt counts persist. Authentication failures stop transport for that session generation; the bound session transport invalidates revoked authentication without clearing item data. Permanent conflicts remain blocked until an explicit choice. Deletion-feed replay/cursors and recurrence reconstruction reuse their existing account-scoped systems. Auth bootstrap reads saved local authentication without requiring network. API configuration is unchanged.

## Requested results

| # | Area | Result |
|---|---|---|
| 1 | Offline create | Passed: five reminders, five tasks, three events, two birthdays, two recurring reminders; 17 unique local items/operations and alarm identities. Three module restarts preserve all pending creates. Reconnect sends one create per item in the successful baseline; all become revision 1 and queue empties. |
| 2 | Offline edit | Passed: 25 title/description/time edits plus recurrence change compact to one operation with original expectedRevision. Final server state matches latest edit, revision advances to 2, old alarm is replaced without increasing alarm count. A separate real-DB test verifies ten edits compact to revision 2. |
| 3 | Offline delete | Passed: multiple synced deletes, edit then delete, and never-sent create then delete. Pending deletes survive restart; alarms cancel immediately. Never-sent item has no server record. Reconnect preserves tombstones and prevents stale-fetch recreation. |
| 4 | Restart persistence | Pending create/update/delete and conflict metadata survive module-cache reset over retained independent file storage. Existing tests also cover missing item mirror and interrupted primary snapshot recovery from backup. |
| 5 | Network flapping | Passed: 12 offline/online cycles with create/edit/delete, foreground transitions and concurrent sync calls. Eight surviving records/alarms, empty queue, one network listener throughout. Disposal removes the listener and later events send no requests. |
| 6 | Partial failure | Passed after fix: item-specific 500, network rejection and simulated AbortError preserve failed operation/backoff while unrelated item syncs in the same pass. No retry before deadline. Ten repeated failures verify exponential delay capped at five minutes, then successful recovery. |
| 7 | Conflicts | Passed: both copies and metadata persist through restart; conflict never automatically retries; unrelated items progress. Keep Mine and Use Server Version pass online and offline. Existing conflict-resolution tests cover repeat conflicts, stale UI actions and alarm reconciliation. |
| 8 | Remote deletion | Passed: remote deletion wins a stale offline edit, removes local item/queue, cancels alarm and persists deletion cursor. Existing deletion-feed tests cover archived evidence and cancellation retry. |
| 9 | Offline recurrence | Daily, weekly, weekdays, monthly and yearly retain one master each, bounded history and no future persisted duplicates. Existing master suite validates completion history, next-date rules and 365 offline rollovers/reconnects. |
| 10 | Date boundaries | Fake clocks cover 23:59 through midnight, January month-end, December year-end and entry into leap day in 2028. Five master records and their pending operations remain intact; reconnect produces exactly five server masters and alarm identities. Existing clock tests also cover leap day and DST dates. |
| 11 | Account isolation | Passed: A pending data survives switch to B, identical IDs remain independent, B uploads under B token only, and A resumes after return. Existing tests also cover in-flight account switches. |
| 12 | Revoked session | Passed using the real frontend session-transport binding: unauthorized upload triggers local sign-out, preserves pending data, creates no server record, and later legitimate login resumes safely. Existing suites cover refresh/takeover and stale revisions. |
| 13 | MongoDB | Passed with a new disposable local MongoDB process/database and real Express routes, JWT authentication, Mongoose models, indexes and validators. Initial 17 unique documents at revision 1. After ten edits and three deletes: 14 active DB/local items, three deleted documents, two recurring masters, 14 mock OS alarm identities, matching titles/revisions. Concurrent reconnect creates no duplicates. Additional uncertain-create/delete scenario ends with a fourth deleted document and still 14 active records. No existing DB, credentials or account used. Temporary process/database removed in finally cleanup. |
| 14 | Bugs found | Two reproduced failures and focused fixes, detailed below. |
| 15 | Files changed | `services/itemSyncService.ts`, `services/itemSyncQueue.ts`, `scripts/test-item-sync.cjs`, new `scripts/test-offline-stress.cjs`, new `scripts/test-offline-mongo.cjs`, this report. Earlier restore/UI changes remain intact. |
| 16 | Tests | Two new suites, 18 existing regression scripts, 42 backend integration tests, TypeScript, targeted ESLint and diff checks passed. |
| 17 | Limitations | OS scheduling is mocked; actual audible alarm delivery, force-stop, JS/dev-client reload and mobile UI behavior await physical validation. Test AbortError simulates the timeout failure path rather than waiting for a real 15-second socket timeout. Module resets retain completed disk writes; they do not model every instruction-level process kill. Legacy unknown-base deletes without original create evidence remain blocked deliberately. |
| 18 | Native changed? | No. |
| 19 | APK rebuild required? | No. Dev-client reload is sufficient. |

## Reproduced bugs and fixes

**Transient failure starved later queue items.** The worker stopped its queue loop after any retryable item failure. An injected 500 on the first of two queued creates reproduced the failure: the second item was not sent. The worker now continues its bounded queue snapshot. Per-item backoff remains durable; authentication failure still stops transport immediately.

**Delete after an uncertain first create could remain blocked forever.** A create reached the server, its acknowledgement was lost, and the user edited/deleted locally before acknowledgement. The pending delete lacked an authoritative revision, so normal unknown-base protection blocked it even though the original record had been created. The new test reproduced the stranded operation.

The queue now retains the original attempted POST payload as device-only evidence across later edits/deletes. An unknown-base delete with this evidence retries the original create through the existing POST/client-ID uniqueness mechanism, then accepts only an exact matching revision-1 server record before conditional deletion. A changed payload or any newer revision produces the existing conflict flow. Deletes without evidence still cannot borrow a server revision. Replaying POST also prevents a delayed first create from arriving after a simple absence check and leaving an orphan. Real MongoDB/HTTP validation confirms the recovery path. This may create then immediately delete a record if the original request never reached the server; it is restricted to an already-attempted, uncertain create.

## Commands run

```text
node scripts/test-offline-stress.cjs
node scripts/test-offline-mongo.cjs
node scripts/test-item-sync.cjs
node scripts/test-item-conflicts.cjs
node scripts/test-conflict-resolution.cjs
node scripts/test-conflict-ui.cjs
node scripts/test-item-delete-sync.cjs
node scripts/test-item-deletion-feed.cjs
node scripts/test-master-recurrence.cjs
node scripts/test-master-sync.cjs
node scripts/test-weekly-recurrence.cjs
node scripts/test-weekdays-recurrence.cjs
node scripts/test-recurrence-preview-ui.cjs
node scripts/test-native-alarms.cjs
node scripts/test-pre-alerts.cjs
node scripts/test-login.cjs
node scripts/test-profile-session.cjs
node scripts/test-session-renewal.cjs
node scripts/test-recovery-auth.cjs
node scripts/test-device-restore.cjs
node --test backend/tests/items.test.js backend/tests/itemDeletions.test.js backend/tests/sessions.test.js
node_modules/.bin/tsc.cmd --noEmit
node_modules/.bin/eslint.cmd services/itemSyncQueue.ts services/itemSyncService.ts scripts/test-offline-stress.cjs scripts/test-offline-mongo.cjs
git diff --check
```

No standalone concurrency script exists; the worker, alarm, session and backend race tests provide that coverage. A separate lint run including the existing harness reported two pre-existing unused-symbol warnings; final targeted production/new-test lint has no errors or warnings.

To repeat real MongoDB validation, install a local mongod executable at the script's default Windows path or set `NOTIVA_TEST_MONGOD`. The test selects random loopback ports, creates its own temporary database directory, and never reads `backend/.env`.
