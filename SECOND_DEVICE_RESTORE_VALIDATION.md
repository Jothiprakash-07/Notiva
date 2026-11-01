# Second-device restore validation — 2026-10-21

Status: automated validation passed; physical and live-database validation remains pending.
No Git commit or push performed.

## Current restore flow (inspected before changes)

`AuthContext` reads the saved session without requiring network access and selects the item account. Login publishes the selected account only after session persistence. `app/_layout.tsx` starts the sync runtime for that account/token. The runtime reads local items, starts network/foreground listeners, and retries transport every 30 seconds while active.

`itemSyncQueue` loads an account-keyed authoritative snapshot containing items, outbox, tombstones, deletion cursor and pending cancellations. It can recover a valid backup; the item-array file is a repairable mirror. Unknown-owner legacy storage is not imported.

`syncItems` serializes transport, sends durable operations with their original revision bases, fetches server items, and merges under the storage mutation lock. Pending operations, local unsynced records, tombstones and equal/newer local revisions are protected. Server notification handles are discarded. Recurrence masters are reconstructed by the existing recurrence reconciler; future previews remain virtual. Nonrecurring restored items use a durable scheduling flag. Android scheduling uses deterministic account-qualified IDs with native pre-alerts; iOS uses Expo notification handles.

The deletion feed replays fully for a new session/runtime or missing remote IDs, then uses the account cursor. Remote deletion is final under the existing policy, including a pending edit for that deleted ID. Cancellation intent is persisted before OS cancellation; failed cancellation retains intent and does not advance the cursor. Session generations guard late responses against account changes. Revoked authentication blocks transport without deleting item storage.

## Requested results

| # | Area | Result and evidence |
|---|---|---|
| 1 | Device A | Independent Android integration harness with its own files, module cache and mocked native scheduler. Vivo unavailable: escalated `adb devices -l` returned no devices. |
| 2 | Device B | A separate clean Android harness; starts with zero files/alarms. Only mock server records transfer. Emulator binary is present but `-list-avds` returned no configured AVD. |
| 3 | Test data | Eleven disposable fixture items created through existing storage/queue APIs; one deleted after syncing. Details below. No real account data used. |
| 4 | Initial restore | Passed: all ten active server-backed records restored into the account namespace, with server revisions. |
| 5 | Counts | Mock server: ten active + one deleted; Device B: ten persisted items, zero pending operations, nine eligible alarm identities. After remote deletion: nine local records and eight alarms. Live MongoDB comparison pending. |
| 6 | Duplicates | Passed: three module restarts with concurrent sync triggers preserve ten unique client IDs and stable alarm IDs; Device B sends zero POSTs. Existing runtime suites cover startup, foreground and network reconnect. |
| 7 | Recurrence | Five masters restored: daily, weekly, weekdays, monthly and yearly. Each retains its own master ID; no future documents created. Existing recurrence suites validate next dates, virtual previews, completion history and 365 rollovers/reconnects. |
| 8 | Alarms | Mock scheduler has nine eligible Android alarm identities and no Expo duplicates. Completed/deleted records excluded; native pre-alert contract passes. iOS retry test leaves one main/pre-alert pair. Actual AlarmManager entries, audible delivery and same-minute physical grouping pending. |
| 9 | Restart/reload | Module restart idempotency passed; existing suites cover foreground/background and concurrent scheduling. Real close/reopen and dev-client reload pending. |
| 10 | Offline reopen | Passed in clean-device harness after first restore: all ten records remain available, namespace retained. |
| 11 | Reconnect | Passed: offline edit remains local, then syncs after reconnect with authoritative revision. Runtime listener regression passes. |
| 12 | Remote delete | Passed: local record and alarm removed, tombstone retained, cursor persisted. Deletion-feed suite also verifies archive replay, cancellation retry and no resurrection. |
| 13 | Pending local data | Stale fetch cannot overwrite pending edit. Existing suites cover pending create/delete, in-flight edits, conflicts and preserved revision bases. Authoritative remote deletion still wins, as required by existing deletion policy. |
| 14 | Account isolation | Passed: Account B starts empty; switching back recovers A records. Existing tests cover same IDs across accounts, alarm IDs, queues, cursors and late responses. Physical alarm-owner behavior pending. |
| 15 | Session takeover | Mock revoked-device transport blocks while retaining A data; backend session suite covers conflict challenge, proof-only takeover, old-token rejection and concurrent-transfer single winner. Actual takeover UI on two devices pending. |
| 16 | Database | Backend item/session/deletion tests pass using test doubles. No live MongoDB records created or queried for this validation. |
| 17 | Bug found | Newer equivalent remote revision cleared `restoreNeedsScheduling` after scheduling failed. On iOS this could permanently lose the restored alarm after notification permission recovery. Reproduced with a failing regression before fixing. |
| 18 | Files changed | `services/itemStorage.ts`: preserve existing retry flag when scheduling fields are unchanged. `scripts/test-device-restore.cjs`: deterministic two-device restore and retry regression. This report. |
| 19 | Tests | New restore suite, fifteen existing frontend scripts, TypeScript and 54 backend tests pass; commands below. |
| 20 | Limitations | No connected physical device, no configured AVD, no disposable live-account run, no physical clean/relogin cycle, no actual OS alarm dump/delivery, and no live DB comparison. Automated fixtures do not establish these physical outcomes. |
| 21 | Native changed? | No. |
| 22 | APK rebuild required? | No for this fix; use the existing compatible development build for remaining device checks. |

## Disposable fixture record inventory

Clock frozen at local 2026-10-21 09:00; initial starts at 10:00. Fixture account IDs are A/B only. All records initially sync at revision 1. Deleted fixture reaches revision 2 on deletion. Device B later edits task to revision 2 and receives reminder deletion at revision 2.

| clientItemId | Type | Recurrence | Completion |
|---|---|---|---|
| reminder | reminder | none | open |
| task | task | none | open |
| event | event | none | open |
| birthday | birthday | none | open |
| daily | reminder | daily master | open |
| weekly | reminder | weekly master, Wednesday | open |
| weekdays | reminder | weekdays master | open |
| monthly | reminder | monthly master | open |
| yearly | reminder | yearly master | open |
| completed | reminder | none | Done, completedAt retained |
| deleted | reminder | none | deleted after initial sync |

## Tests run

All passed:

```text
node scripts/test-device-restore.cjs
node scripts/test-item-sync.cjs
node scripts/test-item-deletion-feed.cjs
node scripts/test-item-delete-sync.cjs
node scripts/test-item-conflicts.cjs
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
node_modules/.bin/tsc.cmd --noEmit
node --test backend/tests/sessions.test.js backend/tests/items.test.js backend/tests/itemDeletions.test.js backend/tests/deletedItemCleanup.test.js
git diff --check
```

Concurrency coverage is included in item-sync, native alarm/pre-alert, profile/session, session-renewal and backend session tests; no standalone concurrency suite exists.

Expo's requested v54 documentation URLs redirected to latest. Before edits, SDK 54 documentation was read from Expo's versioned source:
- https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/notifications.mdx
- https://raw.githubusercontent.com/expo/expo/sdk-54/docs/pages/versions/v54.0.0/sdk/filesystem.mdx
