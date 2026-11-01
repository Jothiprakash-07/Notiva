# Organization creation cleanup and session fix

Date: 2026-10-30 (Asia/Calcutta)
Device: connected Vivo, serial 10MF82FB1R0007D.

## Result

GST UI, state, payload, API summary/type support, schema field, validation and GST-specific assertions were removed. No migration deleted existing records. Organization Registration now shows Organization Details and four required fields: Organization Name, Email Address, Mobile Number, Address, followed by Create organization.

Both the Team creation route and legacy registration entry point render the same form. Signed-out creation is disabled and offers Sign In. Success displays Owner and the generated code, uses joinCode from the actual backend response, and blocks duplicate submissions.

## Session root cause

The legacy OrganizationRegisterScreen used raw fetch to POST /api/auth/organization-register with only Content-Type and no Authorization header. It did not read AuthContext or use authenticatedFetch. Backend authenticate correctly rejected the absent bearer token with 401 and the message "Your session has expired. Please sign in again." This was a missing authentication integration, not an identified stale-token race.

Creation now calls organizationApi.create using the current AuthContext account ID. sharedRequest reads the live item-account session when invoked, uses authenticatedFetch with its bearer token, and rejects responses after account/session replacement. Existing AuthContext publishes that session during sign-in and renewal. Existing sessionTransport renews expired access, retries eligible 401s and guards invalidation. Those architectures were reused without modifying global auth behavior.

## Physical verification

A dedicated validation account was provisioned and freshly logged in through the Vivo UI. Opened Team → Create Organization → Organization Registration. Confirmed the four fields and absence of every GST section/helper/divider. Submitted the four values below. Success screen displayed Owner and the code. Expanded the organization list and verified the final organization appeared as owner.

No session-expired or 503 message occurred. The normal fresh-session API integration test verifies one bearer-authenticated POST returning 201 with no 401; expired access is proactively renewed before POST. The physical success and active session were verified separately.

{
  "organizationId": "6ae489400c5c35d54687c7e0",
  "name": "VivoOrgVerified20261030",
  "email": "office@example.com",
  "mobileNumber": "9999999999",
  "address": "VivoOfficeValidation",
  "userId": "6ae487760edd352ea30d0897",
  "ownerUserId": "6ae487760edd352ea30d0897",
  "membershipCount": 1,
  "ownerCount": 1,
  "joinCode": "ORG-6DF9974053F4",
  "uniqueJoinCode": true,
  "listStatus": 200,
  "listMatches": 1,
  "activeSession": true,
  "noTaxMetadata": true
}

Database verification: exactly one final-name document; correct contact metadata; no GST metadata; creator equals ownerUserId; exactly one total membership, active Owner, matching creator; join code matches exactly one document; authenticated list returns HTTP 200 and includes the final organization exactly once.

Two earlier, distinctly named physical test organizations were created while an older backend process still held port 5000. Their contact fields were empty. The initial PowerShell process stop failed; taskkill terminated that identified stale process and the updated backend was started. Final verification above ran against the updated backend. Earlier test documents were preserved, and none is a duplicate of the final test organization.

## Validation

- Organization create UI test: passed required fields, no GST UI, exact contact payload, success Owner/code, duplicate submit prevention.
- Organization create/session integration: passed fresh bearer, proactive renewal before exactly one create POST, and account mismatch blocking.
- Backend creation test: passed (2 reported tests).
- Organization foundation backend suite: passed (22 reported tests).
- Backend auth/session/profile tests: passed (35 tests); profile suite rerun after removing its GST assertion: 25 passed.
- Session renewal script and AuthContext profile/session regression script: passed.
- TypeScript --noEmit: passed.
- Expo lint: zero errors, five warnings in unchanged profile.tsx, _layout.tsx, OrganizationScreen.tsx and SessionsScreen.tsx.

Initial isolated MongoDB runs hit low free disk. The creation test now uses a small isolated oplog and accepts a test-only lower index disk reserve; the successful creation run used NOTIVA_TEST_INDEX_DISK_MB=50. Production database configuration was not changed. Foundation suite passed serially with its existing 100 MB test reserve.

## Files changed for this cleanup

- app/screens/login/OrganizationRegisterScreen.tsx
- app/screens/shared/create-organization.tsx
- services/sharedApi.ts
- types/shared.ts
- backend/models/Organization.js
- backend/services/organizations.js
- backend/tests/organizationCreation.test.js
- backend/tests/profile.test.js
- scripts/test-organization-create-ui.cjs
- scripts/test-organization-create-session.cjs
- ORGANIZATION_CREATE_CLEANUP_VALIDATION.md (this report)

Physical evidence: .build-tools/org-cleanup-form.png, .build-tools/org-cleanup-success.png, .build-tools/org-cleanup-physical-result.json. Temporary test-account credentials were removed after verification.

Native changed: No.
APK rebuild required for the connected development client: No (Metro serves the changed JavaScript). A release APK with bundled JavaScript needs a JS update or rebuilt APK to receive the changes.

No app data, reminders, sync queue or organization cache was manually cleared/deleted. No reinstall, Git commit or push. No other organization feature was physically tested; broader backend suites ran as requested.
