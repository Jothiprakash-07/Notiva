# Deletion propagation validation — 8 October 2026

Implemented and checked against Expo SDK 54 versioned reference. No UI/native
implementation changes or Git commit/push were performed.

- Backend syntax: 28 JavaScript files passed.
- Backend regression tests: 92 passed, zero failed (auth/profile/recovery,
  item API, retention cleanup and deletion feed).
- Frontend deletion-feed contract checks: 12 passed.
- Existing sync checks: 28 passed; existing offline/delete checks: 5 passed.
- Daily, Weekly and Weekdays recurrence scripts passed.
- Existing native alarm integration script passed.
- TypeScript `--noEmit` passed.
- Live isolated localhost MongoDB: owner isolation, active exclusion, soft
  feed, retention cleanup, archived evidence and strict-since boundary passed.

## Physical test

One authorized Android device: Vivo V2432, serial `10MF82FB1R0007D`.
Foreground package: `com.anonymous.Reminder54`. Existing account already logged
in. Metro process path verified as `D:\Reminder`; device developer menu showed
`http://192.168.43.159:8081`. Backend reached at the matching LAN address on 5000.

A controlled second authenticated API session created a clearly named
`Deletion Feed Validation TEST` reminder for the device's existing owner.
MongoDB confirmed its active record. Phone restored it as synced revision 1;
the device snapshot contained it and native SharedPreferences contained its
alarm schedule. The second session issued DELETE for only that test record;
MongoDB confirmed soft deletion and the owner feed returned its identity.

After explicitly reconnecting the dev client to Metro, the device snapshot
showed:

```json
{
  "testItemPresent": false,
  "testAlarmPresent": false,
  "testTombstoneSynced": true,
  "deletionCursorPersisted": true,
  "pendingAlarmCancellations": 0
}
```

The same state persisted through another force-stop and relaunch via the Metro
development-client link. UI hierarchy contained no validation reminder.
An initial check before reconnecting the updated bundle still showed the stale
item; successful results were recorded only after the correct app runtime ran.

No two-physical-device test was performed. This validates one physical device
plus a controlled second API session and isolated local-state account tests.
The test item remains soft-deleted under the normal retention lifecycle;
real non-test item/account records were not edited. No credentials or tokens
are written to this report.
