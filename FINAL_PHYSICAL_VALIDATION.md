# Final Vivo validation — incomplete / blocked

Date: 26 October 2026, Asia/Kolkata. Device: Vivo V2432, ADB serial 10MF82FB1R0007D. Package com.anonymous.Reminder54, version 1.0.0 (1), installed update timestamp 17:05:19. No commit or push.

## Physical results in requested order

| # | Flow | Result in this run |
|---|---|---|
| 1 | Login/session | Existing Jo session restored; Home, Profile and Team opened. Fresh login not exercised. |
| 2 | Organization create | FAILED on live API: HTTP 503 ORGANIZATION_UNAVAILABLE. No create control in current Team UI. |
| 3 | Join-code display/regeneration | Blocked physically; regression tests passed. |
| 4 | Join request | Blocked physically; regression tests passed. |
| 5 | Owner/Admin approval | Blocked physically; management UI absent; regression tests passed. |
| 6 | Admin restrictions | Not physically exercised; regression tests passed. |
| 7 | Team create | Blocked physically; management UI absent; regression tests passed. |
| 8 | One/multiple team assignment | Blocked physically; management UI absent; regression tests passed. |
| 9 | Shared Reminder | Blocked by organization creation. |
| 10 | Shared Task | Blocked by organization creation. |
| 11 | Shared Event | Blocked by organization creation. |
| 12 | Organization/team/multiple teams/employees targets | Not physically exercised; backend and frontend regressions passed. |
| 13 | Inbox | Team workspace empty-organization state rendered correctly. Populated inbox not exercised. |
| 14 | Created by Me | Not physically exercised; regressions passed. |
| 15 | Individual completion | Not physically exercised; regressions passed. |
| 16 | Collective ANY completion | Not physically exercised; regressions passed. |
| 17 | Shared edit | Not physically exercised; regressions passed. |
| 18 | Target edit | Not physically exercised; regressions passed. |
| 19 | Shared cancellation | Not physically exercised; regressions passed. |
| 20 | Daily/Weekly/Weekdays/Monthly/Yearly | Not physically exercised; backend/frontend/native regression tests passed. |
| 21 | Real alarm | Partial physical pass: built-in personal 45-second alarm scheduled; Home backgrounded app; Android audio history records alarm player start at 17:24:46.991 IST with USAGE_ALARM. Schedule removed after delivery. Alarm screen and audible sound not confirmed. This does not validate shared alarm delivery. |
| 22 | Pre-alert | Not physically exercised; simulated/native regressions passed. |
| 23 | Same-minute group | Not physically exercised; native regression passed. |
| 24 | Shared native re-arm without reopen | Not physically exercised; compiled production Kotlin regression passed. |
| 25 | Offline create/edit/reconnect | Not physically exercised; item-sync and shared offline/reconnect regressions passed. Shared target edits are read-only offline by design. |
| 26 | Logout/relogin | Not exercised; existing account credentials were not supplied. |
| 27 | Duplicate items | No physical shared data available; regression coverage passed. One new personal built-in alarm test item was observed. |
| 28 | Duplicate alarms | One persisted test schedule observed, then consumed. Repeated shared reconcile and native duplicate delivery covered by regressions only. |
| 29 | Personal items unaffected | Home initially showed zero items. Built-in test intentionally added one personal reminder. Shared/personal separation passed regressions; no populated personal baseline to compare physically. |
| 30 | Organization/account isolation | Not physically exercised; regression tests passed. |

## Reproduced blocker and root cause

The live authenticated organization-create endpoint returned 503. The validation helper reused the existing active device session through the server's token helper; it did not perform or prove a fresh login, replace credentials, or write membership records directly.

MongoDB hello returned isWritablePrimary=true with no setName. A read inside a transaction independently reproduced error code 20 / IllegalOperation: `Transaction numbers are only allowed on a replica set member or mongos`. organizations.js deliberately requires transactions and has no standalone fallback. MongoDB service config has replication commented out.

Smallest deployment correction: configure the existing local MongoDB as a single-node replica set, initialize it, wait for primary election, then retry organization creation. The attempted config update and service restart were both denied by Windows. Original config was verified unchanged. A backup is in `.build-tools/mongod-before-final-validation.cfg`. User confirmed administrator change is pending. No transaction guarantees were weakened.

Current Team workspace has no organization-create, join-code regeneration, approval, team-create or team-assignment management controls. Existing profile organization screens are legacy flows; they do not establish complete physical coverage of the normalized organization foundation. Adding those screens is separate implementation work, not a focused runtime patch.

## Setup changes and fixes

- Connected dev client to Metro via ADB reverse for 8081; also added reverse for 5000. Backend health and Metro status responded successfully. The app's configured API URL remains unchanged.
- Initial alarm test correctly rejected disabled notifications, then exact-alarm access. Notification permission was subsequently observed granted; exact-alarm settings were opened/toggled and the retry registered a real exact alarm.
- Temporarily enabled USB stay-awake during validation, then disabled it at the end.
- No product runtime code fix applied. Root deployment blocker remains pending administrator access.

## Regression evidence from this run

- Five organization/team/shared backend test files: 151 tests, 151 passed, zero failures/skips. They use isolated disposable real MongoDB replica sets, not the live standalone database.
- Shared service: 30 passed; rendered UI: 22 passed; target editing: 8 passed; recurrence frontend: 15 passed.
- Native alarm integration and pre-alert scripts passed.
- Item sync: 38 checks passed.
- Compiled native shared recurrence suite passed: 1,320 JS/Kotlin calendar parity cases plus production Kotlin fire/re-arm, pre-alert, duplicate delivery, groups, restore, edits and cancellation cases with Android boundaries doubled. These are not physical results.
- git diff --check passed (line-ending warnings only).

## Files / rebuild / continuation

Added this report and `backend/final-physical-fixture.mjs` as a continuation helper. Its first organization-create failed; no fixture organization or shared items were created. No native files changed by this validation. Existing native edits from earlier work were preserved. No APK rebuild is required for this run's changes; installed native shared behavior is not physically certified by this report.

Resume after administrator enables the MongoDB replica set. Re-run organization creation, then perform the remaining device flows. Full end-to-end validation is **not passed**.
