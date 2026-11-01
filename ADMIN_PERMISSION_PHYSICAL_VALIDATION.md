# Admin promotion and permission validation

Date: 2026-10-30, Asia/Calcutta.
Device: Vivo 10MF82FB1R0007D as existing Owner. Second identity: permitted authenticated API fallback using the approved Member's active session. One unchanged bearer token was used across Admin checks, permission removal and demotion; token hash was asserted unchanged.

## Result

Passed promotion, explicit permission save, allowed actions, denied actions, immediate permission revocation and demotion. Final role is Member; permissions are empty; original organization membership row is preserved. Owner remains Owner. Personal account/item hashes are unchanged. Team membership rows are unchanged by demotion.

## Focused UI gap and fix

Members previously had no Owner role controls. Added Owner-only Manage member navigation and a member-role screen with Promote to Admin, canonical permission checkboxes, Edit Admin permissions and Demote to Member. The screen verifies Owner role from the server before showing controls. Member/Admin callers see an Owner-only message and no role-changing controls. API mutations retain existing backend Owner checks.

Added authenticated GET /api/organizations/permission-options returning the existing ORGANIZATION_PERMISSIONS constant, so all ten current canonical permission identifiers are selectable without a second hardcoded UI list. Added session-aware API wrappers for role/permission mutations and optional directory permissions type. No backend role/permission authorization logic needed a fix.

The physical scrolling interaction initially saved a different limited selection (assign_team_members and create_shared_items). It was corrected in the Owner UI before any authorization probes; no shared item was created under that selection. The four-permission saved set below was verified against the database/API before positive and negative testing.

## Permission set tested

- view_members
- manage_teams
- assign_team_members
- approve_join_requests

No other permissions were granted during authorization validation. In particular create_shared_items, edit_shared_items, manage_members and view_join_code were absent.

## Allowed actions through second identity

- Open organization: HTTP 200, role Admin, exact four saved permissions.
- View member directory: HTTP 200.
- Create test team: HTTP 201.
- Edit test team: HTTP 200.
- Assign the test Admin to that team: HTTP 200.
- Approve a new probe user's join request: HTTP 200; approved request's actedByUserId equals the Admin, and actedAt was recorded.

A dedicated test team, its assignment, and one approved probe Member were created only to validate the explicitly requested permissions. Those records remain; no production/test organization was deleted.

## Denied actions with UI bypassed

Returned HTTP 403 OWNER_REQUIRED: promote another user to Admin, edit own Admin permissions, transfer ownership, regenerate join code, delete organization, change employee sharing policy.

Returned HTTP 403 PERMISSION_REQUIRED: view join code, remove an organization member, list shared items for management, create a shared item. The denied shared creation produced no item. Join code remained unchanged; Owner and organization remained intact.

Read-only baseline member features remain subject to the application's existing access design. No reports/settings endpoint was invented solely to test unused permission names.

## Immediate permission update

Owner physically removed manage_teams and saved on Vivo. Without login or token replacement, the same API bearer immediately received HTTP 403 PERMISSION_REQUIRED for team create and team edit. Member viewing still returned HTTP 200. Other selected permissions remained saved.

## Demotion

Owner physically tapped Demote to Member. Vivo displayed "Demoted to Member. Admin permissions cleared.", Current role Member, Admin permissions None.

Database checks confirmed the same membership ID and exactly one organization membership for the test user, active Member, empty permissions. Personal user and item snapshots matched. Existing team links matched their pre-demotion snapshots. The same bearer now returned Member on detail, and team create, assignment and join-request management returned HTTP 403.

## Evidence/result

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
  "rejoinRequired": false,
  "tokenHash": "7bfcd4162373732a8fe5a100f058e3efdffd44674858d95639e3e8273b273ea6",
  "beforePersonal": {
    "user": "954077f9f3c64d8f32e977ca45cb8b1b46254716714c38721d0accdfa418d3ab",
    "items": "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945"
  },
  "membershipId": "6ae48ba30fbeb45bb61a6e0e",
  "selectedPermissions": [
    "view_members",
    "manage_teams",
    "assign_team_members",
    "approve_join_requests"
  ],
  "checks": [
    {
      "method": "GET",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0",
      "status": 200
    },
    {
      "method": "GET",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/members",
      "status": 200
    },
    {
      "method": "POST",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/teams",
      "status": 201
    },
    {
      "method": "PATCH",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/teams/6ae48ebafa0951ef078b0a2a",
      "status": 200
    },
    {
      "method": "POST",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/teams/6ae48ebafa0951ef078b0a2a/members",
      "status": 200
    },
    {
      "method": "POST",
      "path": "/api/auth/register",
      "status": 201
    },
    {
      "method": "POST",
      "path": "/api/auth/login",
      "status": 200
    },
    {
      "method": "POST",
      "path": "/api/organizations/join-request",
      "status": 200
    },
    {
      "method": "POST",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/join-requests/6ae48ebbfa0951ef078b0a2e/approve",
      "status": 200
    },
    {
      "method": "PATCH",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/members/6ae48ebbfa0951ef078b0a2c/role",
      "status": 403,
      "code": "OWNER_REQUIRED"
    },
    {
      "method": "PATCH",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/members/6ae48b400fbeb45bb61a6e0b/permissions",
      "status": 403,
      "code": "OWNER_REQUIRED"
    },
    {
      "method": "POST",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/transfer-ownership",
      "status": 403,
      "code": "OWNER_REQUIRED"
    },
    {
      "method": "POST",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/regenerate-join-code",
      "status": 403,
      "code": "OWNER_REQUIRED"
    },
    {
      "method": "DELETE",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0",
      "status": 403,
      "code": "OWNER_REQUIRED"
    },
    {
      "method": "GET",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/join-code",
      "status": 403,
      "code": "PERMISSION_REQUIRED"
    },
    {
      "method": "DELETE",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/members/6ae48ebbfa0951ef078b0a2c",
      "status": 403,
      "code": "PERMISSION_REQUIRED"
    },
    {
      "method": "PATCH",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/sharing-policy",
      "status": 403,
      "code": "OWNER_REQUIRED"
    },
    {
      "method": "GET",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/shared-items",
      "status": 403,
      "code": "PERMISSION_REQUIRED"
    },
    {
      "method": "POST",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/shared-items",
      "status": 403,
      "code": "PERMISSION_REQUIRED"
    },
    {
      "method": "GET",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0",
      "status": 200
    },
    {
      "method": "POST",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/teams",
      "status": 403,
      "code": "PERMISSION_REQUIRED"
    },
    {
      "method": "PATCH",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/teams/6ae48ebafa0951ef078b0a2a",
      "status": 403,
      "code": "PERMISSION_REQUIRED"
    },
    {
      "method": "GET",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/members",
      "status": 200
    },
    {
      "method": "GET",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0",
      "status": 200
    },
    {
      "method": "POST",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/teams",
      "status": 403,
      "code": "PERMISSION_REQUIRED"
    },
    {
      "method": "POST",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/teams/6ae48ebafa0951ef078b0a2a/members",
      "status": 403,
      "code": "PERMISSION_REQUIRED"
    },
    {
      "method": "GET",
      "path": "/api/organizations/6ae489400c5c35d54687c7e0/join-requests",
      "status": 403,
      "code": "PERMISSION_REQUIRED"
    }
  ],
  "originalJoinCode": "ORG-6DF9974053F4",
  "teamId": "6ae48ebafa0951ef078b0a2a",
  "thirdUserId": "6ae48ebbfa0951ef078b0a2c",
  "adminApproval": {
    "requestId": "6ae48ebbfa0951ef078b0a2e",
    "actedByUserId": "6ae48b400fbeb45bb61a6e0b",
    "actedAt": "2026-10-30T12:34:03.170Z"
  },
  "teamsBeforeDemotion": "3c302b9fa0ae5052e419191dceabb869571e2f1746ce3309bb3500c9b035662b",
  "immediateRevocation": true,
  "finalRole": "member",
  "finalPermissions": [],
  "memberPreserved": true,
  "personalDataUnchanged": true,
  "teamMembershipUnchangedOnDemotion": true,
  "ownerPreserved": true
}

Screenshots: .build-tools/admin-limited.png and .build-tools/admin-demoted.png. Temporary bearer-token state was removed after verification. No passwords/tokens appear in this report.

## Tests

- Organization role/permission and approval suite: 23 tests passed, including canonical options auth/list assertions.
- Team suite: 38 reported tests passed, including create/assign permission separation, same-token revocation/demotion, and membership preservation.
- Session backend suite: 10 tests passed. Combined run: 71 passed.
- New Admin frontend test: passed Owner-only controls, all ten canonical choices, limited explicit promotion payload, permission edit and demotion clearing permissions; Member/Admin cannot see mutation controls.
- Existing join/approval frontend test: passed.
- Session renewal and AuthContext regression scripts: passed.
- TypeScript --noEmit: passed.
- Expo lint: zero errors; five warnings in unchanged files.

Low-space disposable MongoDB tests used a small oplog and test-only index reserve override NOTIVA_TEST_INDEX_DISK_MB=50. Production MongoDB configuration was not changed.

## Files changed in this task

- app/screens/shared/member-role.tsx
- app/screens/shared/organization.tsx
- services/sharedApi.ts
- types/shared.ts
- backend/controllers/organizationController.js
- backend/routes/organizationRoutes.js
- backend/tests/organizations.test.js
- backend/tests/teamFixture.js
- backend/admin-permission-physical.mjs
- scripts/test-admin-permissions-ui.cjs
- ADMIN_PERMISSION_PHYSICAL_VALIDATION.md

Native changed: No.
APK rebuild required: No for the connected development client. Distributed APKs need their normal JS update/rebuild to receive the UI changes.

No app-data clearing, reminder deletion, organization deletion, Git commit or push. Owner remains logged in on Vivo. API fallback was used for the second identity; allowed/denied Admin actions were not performed on a second physical device.
