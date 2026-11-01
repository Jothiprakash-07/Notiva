# Team foundation

Implemented October 22, 2026. Backend only. No Git commit or push.

This report records the team-foundation snapshot. The subsequent
[shared-item foundation](SHARED_ITEM_FOUNDATION.md) defines snapshot recipients and
current-team alarm eligibility, and records the latest combined test results.

## Models and indexes

`Team` uses the `teams` collection: organizationId, name, normalizedName, description,
active/archived status, createdByUserId, timestamps, archivedAt and archivedByUserId.
The partial unique (organizationId, normalizedName) index applies to active teams only.
An organization/status/ID index supports scoped pagination. The same name is allowed in
different organizations and can be reused after a team is archived.

`TeamMember` uses `team_members`: organizationId, teamId, userId, active/removed status,
assignedByUserId/assignedAt, removedByUserId/removedAt and timestamps. Unique (teamId,
userId) prevents duplicate membership rows across all lifecycle states. Additional indexes
cover organization/user/status/team and organization/team/status/ID queries. Members are
not embedded in Team, and no team-level roles are introduced.

Both models' indexes are explicitly created by prepareOrganizationIndexes before server
startup, including when autoIndex is disabled. No dependency or database migration is
needed for existing organizations; they start without teams.

## Authorization

All routes use the existing session authentication. The existing organizationAccess,
requireOrganizationPermission and organizationTransaction helpers remain authoritative.
The canonical permission allowlist already contained manage_teams and assign_team_members;
it was not replaced or duplicated.

- Owner implicitly has team management and assignment authority.
- Admin needs manage_teams to create/edit/archive teams.
- Admin separately needs assign_team_members to assign/remove team members.
- Active organization members may list teams, view team details and the safe directory.
- Members may view their own team list; Owner/Admin may query another active member's
  list. Admin role is sufficient for this read-only management lookup.
- Ordinary members cannot self-select teams or remove themselves from individual teams.
  Owner/authorized Admin may assign themselves using their organization authority.

Every mutation loads current permissions inside its transaction; loss of permission or
Admin demotion applies with the same token on the next request. Every team lookup matches
both teamId and organizationId. Invalid combinations return TEAM_NOT_FOUND without team or
membership details. Targets must be active members of that same organization, including
for bulk assignment. Other-org, left, removed and unknown targets receive the same generic
ACTIVE_ORGANIZATION_MEMBER_REQUIRED response.

## APIs

All paths below have the prefix `/api/organizations/:organizationId`.

| Method and path | Input / result |
| --- | --- |
| POST /teams | {name, description?}; creates active team, returns {team}, HTTP 201 |
| GET /teams | Active teams by default; optional status=archived; memberCount included |
| GET /teams/:teamId | Safe team summary with current memberCount; archived details remain readable |
| PATCH /teams/:teamId | {name?, description?}; at least one field; active teams only |
| DELETE /teams/:teamId | Soft archive, atomically deactivate active team-member links |
| POST /teams/:teamId/members | {userId}; create/reactivate or return existing active membership |
| POST /teams/:teamId/members/bulk | {userIds}; 1–100 input IDs, all validated before any writes |
| DELETE /teams/:teamId/members/:userId | Soft remove; idempotent {success: true} |
| GET /teams/:teamId/members | Safe active directory with userId, fullName, notivaId, org role, assignedAt |
| GET /members/:userId/teams | Active teams for an active organization member; access policy above |

List APIs support limit 1–100 (default 50) and offset 0–100000 (default 0). Team lists
batch member counts using an indexed aggregation for the page's IDs. Directory/count
queries also require current active organization membership. User lookup projects only
fullName/Notiva ID, never recovery email, mobile number, password or organization permissions.

Team summaries expose ID, organizationId, name, description, status, creator and timestamps.
They omit normalizedName and internal database fields. Assignment responses contain the
membership IDs and current assignment/removal audit fields. Archived team directories
return no active members. No restore/unarchive endpoint is provided.

## Validation and lifecycle behavior

Names use Unicode NFKC normalization, collapsed whitespace, trim and lowercase duplicate
keys. Names must contain visible letters, numbers, punctuation or symbols, be at most
100 UTF-16 code units, and contain no control/default-ignorable characters or braille blank.
Empty, whitespace-only, invisible-only and combining-mark-only names are rejected.
Descriptions are optional strings up to 1000 code units. Unknown create/edit fields are
rejected: clients cannot move a team to another organization or choose its status/creator.
Duplicate active names return 409 TEAM_NAME_TAKEN.

Assignment is idempotent: an already active link retains its original assignedBy/assignedAt.
Reassignment reuses the row, records the new assignment actor/time, and clears stale removal
fields. Bulk input duplicates are deduplicated after ID normalization. All targets must
validate and all writes must commit together; an invalid target or a write failure rolls
the whole operation back. No automatic team assignment occurs during organization join.

A user can simultaneously belong to Sales, Design and Development. Removing Sales changes
only that link; organization membership and the other teams remain active. Team removal
records removedBy/removedAt and retains the row. Retrying removal preserves those fields.
Archive retains the team and membership records, records archive actor/time, removes its
active links and prevents edits/new assignments. It does not remove organization members.

Audit fields retain the current/latest lifecycle on each membership row; past join/remove
cycles are not stored as an append-only event log. Archived/removed records are retained,
with assignment and removal actors/times available in the database. A full audit UI or
event-history collection is outside scope.

## Organization integration and concurrency

Organization member removal and Member/Admin self-leave now call revokeTeamMemberships in
the same transaction, scoped by organizationId and userId. This includes the legacy leave
alias when organizationId is supplied. The old alias without organizationId still only
clears legacy profile metadata; it does not revoke normalized organization access.

Organization deletion also archives its active teams and revokes all its active team
links in the deletion transaction. Failure of cleanup rolls back the organization/team
change. Other organizations and personal account/items remain untouched.

Rejoining an organization never restores old teams: approval only reactivates organization
membership. A new explicit authorized team assignment is required. Ownership transfer
changes organization authority without writing TeamMember rows, preserving both the old
and new Owner's existing team links.

Team writes reuse the existing organization revision lock. Assignment, team removal,
archive, org-member removal/leave, permission change and ownership transfer serialize on
that same document. MongoDB transaction retries and the unique membership index produce
one logical membership under simultaneous assignment. An assign/remove race follows
commit order: the last committed operation determines active/removed status, with audit
fields consistent with that outcome. A completed organization removal cannot leave an
active link from a racing assignment. No arbitrary fixed winner is promised for requests
that arrive simultaneously.

MongoDB must support transactions (replica set or sharded cluster), as required by the
organization foundation. There is no partial-write fallback for standalone MongoDB.

## Verification

`npm test --prefix backend`: **169 passed, 0 failed, 0 skipped**. This includes the existing
organization, auth/session, recovery/profile, personal-item and deletion/cleanup suites,
plus **38 team tests** (37 scenarios and their parent test).

The team tests start their own real disposable MongoDB replica set, then use authenticated
HTTP APIs. They do not load backend/.env or touch existing databases. Set NOTIVA_TEST_MONGOD
to a local mongod executable if the Windows default is unavailable. To run only team tests:
`node --test backend/tests/teams.test.js`.

Coverage includes all 30 requested cases, plus Unicode validation, database uniqueness,
safe directory projections, bulk all-or-nothing validation and injected-failure rollback,
archive/leave rollback, legacy leave integration, assignment/removal races, stale token
permission changes, rejoin behavior and organization deletion cleanup. `git diff --check`
passed. Frontend/TypeScript checks were not needed because no frontend types changed.

## Files changed in this task

Added:

- models/Team.js
- models/TeamMember.js
- services/teams.js
- services/teamMemberships.js
- controllers/teamController.js
- tests/teamFixture.js
- tests/teams.test.js
- TEAM_FOUNDATION.md

Updated:

- routes/organizationRoutes.js — authenticated team endpoints.
- services/organizationIndexes.js — team index initialization.
- services/organizations.js — transactional removal/leave/deletion cleanup.
- ORGANIZATION_FOUNDATION.md — points to this follow-up report.

Existing organization-foundation changes and unrelated frontend/sync work were preserved.

## Deferred work and deployment

Shared reminders/tasks/events, recipient completion, organization-wide targeting, team
delivery, organization switcher UI, team-level roles, unarchive, and a full audit-log UI
are not implemented. Bulk assignment is implemented, capped at 100 input IDs per request.
The organization-wide write lock favors correctness; very large organizations may later
need a different concurrency strategy backed by equivalent invariant tests.

Backend restart required: **Yes**, to load the routes/models and initialize indexes.
Native Android/Kotlin changed: **No**. APK rebuild required: **No**.
No Git commit or push was performed.
