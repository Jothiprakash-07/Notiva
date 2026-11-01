# Session login race fix — 28 October 2026

## Finding and fix

A deterministic AuthProvider regression reproduced a race: `signIn` advances the session generation, then waits for SecureStore persistence while `liveSession` still holds the previous token. A late invalidation of that previous token calls `signOut`, advances the generation again, queues credential deletion, and prevents the new login from being published. The regression failed before the fix with the fresh session absent.

AuthContext now tracks the generation of a pending sign-in and ignores transport invalidation while that sign-in is being persisted. The guard is released in `finally`, including storage failure. Explicit logout still cancels pending login. Once persistence finishes, the existing token equality guard rejects old-token invalidation; current-token expiry still clears authentication normally.

The manual login request uses plain fetch with no Authorization header. Refresh uses an explicit session ID and refresh secret. Bootstrap, refresh replacement, targeted logout and single-device slot enforcement already have session/generation guards. No backend or native implementation changes were needed.

The originally reported expiry message was **not reproduced physically before this change**: the connected Vivo was already signed in as Jo. The race above is confirmed by a failing-then-passing regression; attributing the original physical incident specifically to it remains unproven.

## Files changed in this task

- `contexts/AuthContext.tsx`: pending-login generation guard.
- `scripts/test-profile-session.cjs`: actual transport binding callback exercised during delayed login persistence, stale/current invalidation, failed writes and explicit logout.
- This report.

Existing unrelated workspace changes were retained. No commit or push.

## Local data preservation

Only the existing auth key `notiva.auth.session.v1` is cleared by logout/session expiry. The fix adds no reminder, sync, conflict, organization-cache or alarm deletion paths. The sync regression verifies a pending reminder and queue entry remain after revocation and resume for the correct account.

On Vivo, all three inspected account files had identical SHA-256 values before logout and after fresh login:

| File | SHA-256 |
| --- | --- |
| Account sync queue | `784ea7f4c9c8688d30905503849c122652c59b6c8b6ea592f0e326179a80ace6` |
| Account personal items | `ab3f103035517b1aeb42313c2ad2c46b78f2b513f0f9743f964b151b4f3f875f` |
| Account shared/organization cache | `bfdeccc89347ab7c22bb25f8f11e7a187e748b08588e3ad02f827385ab74289f` |

The inspected physical queue contained one item, zero pending changes and zero conflicts; physical preservation of populated pending/conflict states was therefore not exercised. No app data was cleared or app uninstalled.

## Physical Vivo result

- Device V2432 connected through ADB.
- Normal logout opened Login; MongoDB then showed one session slot, zero active sessions.
- Fresh manual login as `jo-07` with user-supplied credentials opened Home without an expiry error.
- MongoDB showed one slot and exactly one active session with a different session ID.
- Background/foreground returned to the app successfully.
- App process restart loaded the patched Metro bundle (pending-sign-in guard verified in the device's cached JavaScript), restored Jo's Home, and showed the same Total 02 / Done 02 counters.
- No infinite login/expiry loop observed. Password omitted from this report.

## Validation

- `node --test backend/tests/sessions.test.js backend/tests/profile.test.js backend/tests/recovery.test.js`: 65 tests passed, zero failures/skips.
- `node scripts/test-profile-session.cjs`: passed, including the new race regression and failed-write/logout cases.
- `node scripts/test-session-renewal.cjs`: passed, including refresh coalescing, revoked credentials, account isolation and pending-data preservation.
- `node scripts/test-recovery-auth.cjs`: passed.
- `npx tsc --noEmit`: passed.
- Focused `git diff --check`: passed.

Native changed by this task: **No**. APK rebuild required for this fix in the tested development client: **No**; load updated JavaScript from Metro. A separately distributed build with an embedded bundle must receive the updated JavaScript through its normal release/update mechanism.
