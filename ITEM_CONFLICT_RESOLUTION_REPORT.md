# Item conflict resolution — 2026-10-21

Implemented; automated validation passed. No commit or push performed.

1. **Existing state:** Reuses `syncStatus: "conflict"`, the persisted blocked queue operation, and `ItemConflict { expectedRevision, serverRevision, detectedAt, serverItem }`. Delete snapshots remain in the existing queue payload and tombstone. No second persisted conflict store.
2. **Entry points:** A lavender “Sync conflict” button appears on affected Home/list cards. A compact account-scoped notice exposes queued conflicts, including deleted items whose cards are absent. Conflicts are reviewed one at a time; the notice points to the next remaining conflict after resolution.
3. **UI:** Protected “Resolve sync conflict” screen with local/server sections, readable type-specific fields, subtle changed-field highlighting, and explicit Keep Mine / Use Server Version buttons. No raw JSON or internal identifiers.
4. **Keep Mine:** Atomically preserves current local content, adopts the stored authoritative server revision as the operation's expected revision, renews the operation identity, clears its conflict/retry error and queues update/delete through normal sync. A further server change produces a normal new conflict.
5. **Use Server Version:** Atomically removes only that item's pending operation/tombstone, installs the reviewed server version with its revision and synced state, discards remote OS handles and persists reconciliation intent.
6. **Delete conflicts:** Explains that the item changed before deletion completed. Keep Mine retries deletion with the newer revision. Use Server Version restores the server item and cancels the pending deletion. Actual server deletions arrive through the existing deletion feed; it removes the conflict, cancels alarms and prevents a stale screen from resurrecting the item. Current backend 409 responses contain active server items, not deletion snapshots.
7. **Alarms:** Reuses existing durable cancellation and restore/recurrence reconcilers. Cancels old nonrecurring/series schedules before replacement, including recurrence/time changes. A failed cancellation delays replacement scheduling so subsequent cancellation retry cannot remove the replacement. Normal sync also respects pending cancellation intent.
8. **Queue:** Unrelated operations are preserved and continue syncing. Conflicts stay blocked until chosen. Resolution validates the reviewed operation identity; stale/double choices cannot resolve a changed operation. Missing authoritative evidence fails safely.
9. **Persistence:** Uses the existing authoritative account snapshot and backup machinery. Conflict and resolved pending state survive module restart and account logout/reselection.
10. **Offline:** Both choices use stored evidence without a network request. Keep Mine remains queued until transport succeeds; Use Server Version replaces locally and retries interrupted OS work through existing reads/reconciliation.
11. **Isolation:** Reads and mutation are scoped to the active account, mutation checks session generation, and UI immediately hides data after account changes. Authoritative serverItem is captured by the existing authenticated transport; no client-supplied owner is accepted.
12. **Validation:** Both new suites, sixteen existing regression scripts, TypeScript and diff whitespace checks pass. Targeted ESLint reports zero errors and two pre-existing unused-variable warnings in itemStorage. Concurrency is covered by sync, alarm, pre-alert and session suites; no standalone concurrency script exists.
13. **Files changed for this task:**
    - `app/screens/sync-conflict.tsx`
    - `components/common/ItemConflictNotice.tsx`
    - `utils/itemConflictComparison.ts`
    - `components/home/ReminderCard.tsx`
    - `app/(tabs)/reminders.tsx`
    - `app/screens/home/HomeScreen.tsx`
    - `app/_layout.tsx`
    - `services/itemStorage.ts`
    - `services/itemSyncQueue.ts`
    - `services/itemSyncService.ts`
    - `scripts/test-conflict-resolution.cjs`
    - `scripts/test-conflict-ui.cjs`
    - This report. Prior restore-task changes remain intact.
14. **Limitations:** Rendered React UI tests use DOM/native-component mocks; physical mobile layout, touch interaction and actual AlarmManager delivery have not been validated on a connected device. Backend is unchanged. If an older conflict lacks serverItem, choices are disabled rather than guessing a revision. No manual merge or conflict history was added.
15. **Native changed:** No.
16. **APK rebuild required:** No. Dev-client reload is sufficient.

## Tests run

```text
node scripts/test-conflict-resolution.cjs
node scripts/test-conflict-ui.cjs
node scripts/test-item-sync.cjs
node scripts/test-item-conflicts.cjs
node scripts/test-item-deletion-feed.cjs
node scripts/test-item-delete-sync.cjs
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
node_modules/.bin/tsc.cmd --noEmit
node_modules/.bin/eslint.cmd services/itemStorage.ts services/itemSyncQueue.ts services/itemSyncService.ts utils/itemConflictComparison.ts components/common/ItemConflictNotice.tsx app/screens/sync-conflict.tsx components/home/ReminderCard.tsx
git diff --check
```

New deterministic tests cover all four item types, both choices offline, newer-revision retry conflicts, queue preservation, stale resolution rejection, delete restore/retry, recurring master scheduling, recurrence/time changes, deletion-feed safety, interrupted cancellation recovery, rendered badge/navigation/comparison/actions and account isolation.
