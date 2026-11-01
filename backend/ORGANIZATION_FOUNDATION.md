# Organization and membership foundation

Implemented October 22, 2026. Backend only; no commit or push.

This report records the organization-foundation snapshot. The subsequent
[team foundation](TEAM_FOUNDATION.md) implements the previously deferred team module and
transactional membership cleanup, and records the current combined regression results.

The subsequent [shared-item foundation](SHARED_ITEM_FOUNDATION.md) adds employee-sharing
policy and transactional recipient revocation; its report contains the latest test results.

## Existing behavior and compatibility

Previously, Organization contained contact/GST details, organizationName and a unique
organizationCode, but no creator, Owner or membership. Organization registration was
public. Personal registration and joining wrote one organizationCode on User; leaving
cleared it. Profile resolved organization contact information by that code. This could
not represent multiple organizations or demonstrate who was authorized to own one.

Existing User.organizationCode, User.role, all Organization contact/GST fields, and
their existing indexes remain. Login/publicUser serialization retains its field names.
Neither legacy field grants normalized organization access. Personal items, sessions,
recovery, authentication and token formats are unchanged.

Compatibility decisions:

- New organizations have both joinCode and organizationCode set to the same current
  code; regeneration updates both atomically. The legacy field is never used to authorize.
- POST /api/auth/organization-register now authenticates and delegates to normalized
  creation; organizationName is accepted as an alias for name. GST-only creation without
  a name is no longer supported. Its response is the new organization/membership shape.
- POST /api/auth/join-organization accepts organizationCode but creates/returns a pending
  request. It never writes User.organizationCode or creates membership.
- Personal registration with a nonempty organizationCode returns 400
  JOIN_AFTER_REGISTRATION before creating an account. Register without the code, log in,
  then submit a join request. Empty/omitted codes retain personal registration behavior.
- GET /api/auth/profile preserves the user and legacy organization response shapes.
  Its organization is legacy metadata only; active normalized organizations must be read
  from /api/organizations. Active organization codes/contact data are not resolved through
  the deprecated user link.
- POST /api/auth/leave-organization with organizationId delegates to normalized leave,
  including the Owner restriction. Without that ID it only clears legacy profile metadata
  with the existing concurrency guard. This does not leave any normalized organization.
  New clients must always send organizationId or use the normalized leave endpoint.

### Migration/deprecation plan

No production migration was run. Existing organizations remain unclaimed: absent status
is not active, and the schema default for legacy records is legacy_unclaimed. Existing
codes and user links do not automatically become approved membership or confer ownership.

Before activating an existing organization, an operator must independently verify its
primary Owner's personal account. Never infer the Owner from knowledge of the join code,
email similarity, registration order, or the first user who requests access. During a
maintenance window with legacy writers disabled, use a MongoDB transaction to set its
name/normalizedName, verified ownerUserId and createdByUserId, a new unique joinCode and
organizationCode, joinCodeVersion and status=active; create the verified Owner membership
in that same transaction. Abort on conflicting membership/ownership; validate exactly
one active Owner matching ownerUserId before committing. This operator migration tool
and ownership verification workflow are deliberately not implemented as a public claim API.

Review existing user-code links as migration candidates only. Import them as pending
join requests after normalizing to organizationId, retaining the old code/version only
as needed for audit; require Owner/eligible Admin approval. Do not auto-approve them.
Pending requests in the normalized system survive later code regeneration.

Upgrade clients to approval states and organizationId-based APIs before enabling this
feature. Later remove legacy profile display/leave paths and User.organizationCode only
after client rollout and an audited migration. Do not drop old fields or indexes during
this rollout. Historical legacy codes in personal responses are metadata, not credentials
for any active organization.

## Models, indexes and transaction policy

- organizations: preserves the existing collection and fields; adds name, normalizedName,
  joinCode/version/regeneratedAt, ownerUserId, createdByUserId, status, revision,
  ownershipTransferredAt/ByUserId and deletedAt. New active records require name, code,
  creator and Owner. Unique partial joinCode index accommodates old records without a
  joinCode; existing unique organizationCode remains. Owner/status index supports lookup.
- organization_members: organizationId/userId unique pair, role, permissions, active/left/
  removed status, joined/left/removed times, remover, latest role/permission actor/time.
  Partial unique one_active_owner index prevents two active Owner memberships per org.
  User/status index supports the organization switcher's future listing needs.
- organization_join_requests: organizationId/requesterUserId, pending/approved/rejected/
  cancelled status, requestedAt, action, actedAt, actedByUserId, optional actionNote,
  codeVersion and timestamps. Partial unique pair for pending requests allows historical
  decisions. Organization/status/requestedAt index supports history listing.

Server startup explicitly creates indexes before listening, including with autoIndex
disabled. No index/data destruction or implicit user migration. MongoDB must support
transactions (replica set or sharded cluster); there is no partial-write standalone
fallback. Errors return a safe 503; duplicate conflicts retry boundedly then return 409.

Creation writes Organization and Owner membership in one transaction. All later mutations
first increment the organization's revision inside the transaction, then load current
membership and authorize. This shared write serializes competing approvals, revocation,
role changes, transfer, deletion and code regeneration. Authorization is never embedded
in JWT claims or cached. Existing authentication/session validation still runs first.
Ownership transfer demotes the previous Owner before promoting the target inside the
same transaction; rollback restores both memberships and ownerUserId on failure.

## API and behavior

All endpoints below are under /api/organizations and require the existing session auth.
IDs must be 24-character hexadecimal ObjectIds. List APIs accept limit (1–100, default
50) and offset (0–100000, default 0); clients must paginate.

| Method and path | Behavior / authorization |
| --- | --- |
| POST / | Body {name}; atomically create with caller as sole Owner |
| GET / | Only caller's active memberships in active organizations |
| GET /:organizationId | Active membership; safe summary and caller membership |
| POST /join-request | Body {joinCode}; pending request, existing pending state, or alreadyMember |
| GET /:organizationId/join-requests | Owner or approve_join_requests Admin; optional status filter |
| POST /:organizationId/join-requests/:requestId/approve | Owner or approve_join_requests Admin |
| POST /:organizationId/join-requests/:requestId/reject | Same; optional actionNote up to 500 characters |
| GET /:organizationId/members | Any active member; safe directory |
| PATCH /:organizationId/members/:userId/role | Owner only; {role: admin/member, permissions} |
| PATCH /:organizationId/members/:userId/permissions | Owner only; active Admin target; {permissions} |
| DELETE /:organizationId/members/:userId | Owner or manage_members Admin; Owner never removable; Admin cannot remove another Admin |
| POST /:organizationId/leave | Member/Admin leave; Owner gets OWNERSHIP_TRANSFER_REQUIRED |
| POST /:organizationId/transfer-ownership | Owner only; {targetUserId, previousOwnerRole?, permissions?} |
| POST /:organizationId/regenerate-join-code | Owner only; existing memberships/pending requests untouched |
| GET /:organizationId/join-code | Owner or view_join_code Admin |
| DELETE /:organizationId | Owner only; soft delete, revoke memberships, cancel pending requests |

Codes are ORG- plus 12 cryptographically random hexadecimal characters (48 random bits),
trimmed/case insensitive. Database uniqueness handles collisions. Regeneration guarantees
a different code, updates version/time, and invalidates the old code for new attempts.
Memberships, request IDs and all authorization use organizationId, never a code.

Approval creates/reactivates a Member with empty permissions and no teams. Reactivation
reuses the unique membership row and clears stale leave/removal fields. Existing active
members retain their role if an approval race finds membership already active. Same-action
decision retries return the original decision without changing actor/time or regranting
revoked access. Opposite-action retries return 409. Rejected users may submit a new request.

Request history includes request, action, actor user ID and timestamp. Owner and eligible
Admins see safe requester/actor profiles (fullName and Notiva ID), never recovery contacts.
Directory returns safe profile, role and joinedAt; permission/change management fields
are limited to Owner or manage_members Admin. Other Admins can inspect their own assigned
permissions via detail. Join codes appear in summaries only for authorized viewers.

Owner has implicit full permissions. Admin powers are exactly their allowlisted array:
view_members, manage_members, manage_teams, assign_team_members, create_shared_items,
edit_shared_items, view_reports, view_organization_settings, view_join_code,
approve_join_requests. Unknown strings are rejected. Promotion requires an explicit array;
demotion clears it. Team/shared-item/report permissions are reserved names only.

Removal and self-leave revoke membership access and clear Admin permissions; personal
account/items remain untouched. Team cleanup has a transaction integration comment but
no team implementation. Transfer requires an active member of the same organization.
Previous Owner defaults to Member; explicitly selecting Admin also requires an explicit
validated permissions array. Organization stores latest transfer actor/time. Code
regeneration stores its time. No full audit-log product was added.

Multi-org membership is independent per organization; global User.role is never read by
organization authorization. Organization deletion retains history and personal data.

## Verification and changed files

Run `npm test --prefix backend` (or `node --test backend/tests/*.test.js`). The organization
suite starts an isolated local single-node MongoDB replica set on a temporary port/data
directory, makes real authenticated HTTP requests and tears it down. It never loads
backend/.env. Set NOTIVA_TEST_MONGOD to a local mongod executable on other machines; the
Windows default is C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe.

Organization coverage includes all requested role/access/code/join/leave/transfer cases,
unique database constraints, concurrent joins/approvals, create/approval/transfer failure
rollback, safe actor history, multi-org isolation, immediate authorization changes using
the same token, legacy compatibility and personal-account/item preservation. Full auth,
session, recovery, profile, item and deletion/cleanup suites are also run.

Validation result: **131 tests passed, 0 failed, 0 skipped**, including 22 organization
suite tests (21 scenarios plus the parent test) against the isolated real replica set.
`git diff --check` passed. Frontend/TypeScript checks were not needed: no shared types or
frontend files were changed by this task. Pre-existing frontend/sync edits were preserved.

Changed existing files: models/Organization.js; controllers/authController.js and
profileController.js; routes/authRoutes.js; server.js; package.json; tests/profile.test.js
and recovery.test.js. Added: models/OrganizationMember.js and OrganizationJoinRequest.js;
controllers/organizationController.js; routes/organizationRoutes.js;
services/organizationPermissions.js, organizationAuthorization.js, organizations.js and
organizationIndexes.js; tests/organizations.test.js; this report.

Limitations: replica-set deployment is required; verified legacy activation/import tooling
and client approval UI remain future work. Lists use bounded offset pagination. Membership
rows retain the latest lifecycle/change fields, while join decisions retain separate
historical rows; there is no full append-only membership audit log. No teams, shared items,
organization switcher, frontend types or native changes were implemented.

Native changed: No. APK rebuild required for these backend changes: No. Existing clients
need a future frontend update to use the new approval/multi-org contracts.
