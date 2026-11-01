# Organization Join and Approval Validation

Date: 2026-10-30, Asia/Calcutta.

## Scope and method

Only one physical device was connected: Vivo 10MF82FB1R0007D. The existing Owner session was preserved. Per the permitted fallback, a dedicated API test client represented the second identity. Join submission, pending status, duplicate-request checks and approved second-user access were validated through that identity's real authenticated HTTP session. Owner pending review, approval, actor history, Members list, join-code visibility and repaired Join UI were checked physically on Vivo.

No Team creation or assignment was performed. No join code was regenerated. No organization was deleted. No commit or push.

## Precheck

Backend responded successfully; Metro reported running; MongoDB reported rs0 and writable primary. The current organization existed and its Owner session was active. Vivo physically displayed Owner and join code ORG-6DF9974053F4 for VivoOrgVerified20261030.

## Findings and focused fixes

- Team workspace had no Join Organization entry point. Added one, plus Open Organization for details, Members and request review.
- Legacy JoinOrganizationScreen accepted only six characters after ORG-, rejecting the current 12-character codes. Validation now matches backend's 6–32 character code range and input length.
- Legacy join assumed immediate membership and a user/profile response, attempted updateUser, and described replacing the user's organization. Backend correctly returns a pending request. Join UI now uses the session-aware organization API, displays Pending or already-member result, deduplicates request rows and never rewrites personal profile metadata.
- Pending requests, approval controls, actor history and member directory had no UI. Added a focused organization screen using existing APIs and backend permissions. Owner/authorized Admin can review and decide requests. Active members can see the safe directory. Member approval controls remain hidden and backend authorization remains authoritative.
- Added authenticated GET /api/organizations/join-requests/mine, scoped to requesterUserId from authentication, for status persistence across visits. It exposes organization/name, request status and timestamps only.

No backend error occurred during valid live join/approval requests. Existing backend join/approval transactions, unique indexes and membership behavior required no changes. Initial defects were frontend integration gaps identified in source and navigation; the obsolete validator's source message was "Enter the organization code, for example ORG-ABC123."

## Live validation

1. Vivo repaired Join UI showed Join Code input and Join button. Submitting the current Owner's existing organization code displayed "You are already a member of this organization." No duplicate membership was created.
2. Second API identity registered/logged in independently without replacing the Owner session. Two concurrent POST join submissions returned the same request ID. Database: one Pending request, zero membership before approval. Its organization list was empty; own-request endpoint returned Pending.
3. Owner physically opened Join Requests on Vivo. Pending user display name, Notiva ID, request timestamp, Approve and Reject appeared. No recovery email/mobile was visible. API projection was checked to contain only _id, fullName and notivaId for requester/actor.
4. Owner physically tapped Approve. Request changed to Approved. Acted-by matched Owner and actedAt was recorded. UI history displayed Owner name and 30 October 2026, 5:50:51 PM IST.
5. Members list physically displayed the approved user once, with display name, Notiva ID, Member role and joined date. Database: exactly one active OrganizationMember for that second user. Zero TeamMember rows were assigned.
6. Second API identity's organization list and organizationId detail endpoint returned access with Member role without submitting any join code. Own request returned Approved and zero Pending requests. No rejoin required. Membership references organizationId; join code was unchanged.

{
  "organizationId": "6ae489400c5c35d54687c7e0",
  "joinCode": "ORG-6DF9974053F4",
  "ownerUserId": "6ae487760edd352ea30d0897",
  "secondUserId": "6ae48b400fbeb45bb61a6e0b",
  "secondNotivaId": "join_vivo_62752367",
  "requestId": "6ae48b400fbeb45bb61a6e0d",
  "pendingCount": 1,
  "membersBeforeApproval": 0,
  "status": "approved",
  "actedByUserId": "6ae487760edd352ea30d0897",
  "actedAt": "2026-10-30T12:20:51.880Z",
  "memberCount": 1,
  "memberRole": "member",
  "automaticTeamAssignments": 0,
  "secondUserListAccess": true,
  "secondUserDetailAccess": true,
  "remainingPendingRequests": 0,
  "joinCodeUnchanged": true,
  "safeRequestAndMemberDetails": true,
  "rejoinRequired": false
}

## Validation

- Organization backend suite: 23 tests passed, covering join request concurrency, membership uniqueness, pending isolation, approval/rejection, Owner and authorized Admin actor history, privacy, cross-user access and the new own-status endpoint (including authentication).
- Auth/session backend suite: 10 tests passed.
- Session renewal and AuthContext regression scripts: passed.
- Focused frontend join/approval test: passed validation, Pending display/deduplication, approval history, directory fields and Member restriction.
- TypeScript --noEmit: passed.
- Expo lint: zero errors; five warnings remain in unchanged files.

The isolated backend test fixture uses a small oplog and test-only disk reserve override NOTIVA_TEST_INDEX_DISK_MB=50 due to low local disk space. No live MongoDB configuration changed.

## Files changed

- app/screens/profile/JoinOrganizationScreen.tsx
- app/screens/shared/organization.tsx
- components/shared/SharedWorkspace.tsx
- services/sharedApi.ts
- types/shared.ts
- backend/controllers/organizationController.js
- backend/routes/organizationRoutes.js
- backend/tests/organizations.test.js
- scripts/test-organization-join-ui.cjs
- ORGANIZATION_JOIN_APPROVAL_VALIDATION.md

Evidence: .build-tools/org-join-pending.png, org-join-approved.png, org-join-members.png and org-join-result.json. Temporary second-identity bearer token file was removed after verification.

Native changed: No.
APK rebuild required: No for the connected development client (Metro JS update). A distributed APK needs its normal JS update or rebuild to receive these UI changes.

## Boundaries

Second-user pending/join/access checks used the explicitly permitted API fallback, not a second physical device. Owner approval was physical; Admin actor/history support was verified in automated backend tests. No real Admin account was created/promoted for physical testing. Regenerated-code behavior was not exercised against the live organization.
