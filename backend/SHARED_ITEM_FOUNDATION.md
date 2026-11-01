# Shared organization items: backend foundation

Target editing now extends this foundation; see [target editing report](../SHARED_TARGET_EDITING_REPORT.md). Earlier target-edit deferrals describe the original foundation stage.

Recurrence support now extends this foundation; see [shared recurrence report](../SHARED_RECURRENCE_FOUNDATION.md). Earlier recurrence deferrals below describe the original foundation stage.

Implemented October 22, 2026. No Git commit or push.

## Existing architecture inspected

Personal Item uses ownerUserId/clientItemId, revision guards, soft deletion and a separate
deletion feed/archive. Frontend sync maps revision to serverRevision, preserves queued
edits/conflicts and reconciles alarms on restore/schedule changes. Personal recurrence uses
one dailySeries master/template, derived occurrences and bounded occurrenceHistory.

Those personal models, controllers, sync queues, recurrence/alarm logic and deletion paths
were not changed. Shared data uses a separate domain. Shared schedule validation reuses
canonical itemFields validators for startAt, endAt, allDay and alertBefore. Timestamps
remain strings with original offsets; shared input additionally requires explicit Z or
offset to avoid ambiguous cross-user wall-clock times. No server-timezone conversion.

## Data models, targets and recipients

- OrganizationItem / organization_items: organizationId, reminder/task/event type, title,
  description, creator, active/cancelled/completed status, completionMode, collectiveRule,
  schedule, non-recurring recurrence, serverRevision, scheduleRevision, timestamps and
  cancellation/global-completion actors/times. Content is stored once. Birthday is rejected.
  employeeOnlyTargets is derived by the server from immutable target rows. Optional
  clientRequestId and creationHash support safe creation retries.
- OrganizationItemTarget / organization_item_targets: item ID, organizationId, targetType
  (organization/team/user), targetId (null for organization) and timestamps. Multiple,
  overlapping target modes are supported; input duplicates/case variants are deduplicated.
  Original target definitions remain unchanged for audit.
- OrganizationItemRecipient / organization_item_recipients: item ID, organizationId, userId,
  pending/acknowledged/completed/cancelled status, active/revoked accessStatus, sourceTargetIds,
  acknowledgement/completion/cancellation times, revocation actor/time, lastSeenRevision,
  recipientRevision and timestamps. Actual completion actor is userId. deliveredAt is reserved
  for future delivery integration; reading data does not claim notification delivery.

Unique item/user prevents duplicate receipts across overlapping teams. Recipient rows do
not copy item content, and there are no shared personal Item documents or team roles.

## Permissions and Member sharing policy

Every route uses existing session auth and current organization membership. The existing
permission helpers and canonical allowlist remain authoritative.

| Caller | Create | Edit/cancel | Inspect recipient states |
| --- | --- | --- | --- |
| Owner | Any valid target | All org shared items | All |
| Admin | create_shared_items | edit_shared_items, including own creations | Own creations, or all with edit_shared_items |
| Member | Policy enabled; selected users only | Own selected-user items while policy enabled | Own creations |
| Recipient alone | No added power | Cannot edit/cancel content | Own status only |

employeeSharingEnabled defaults false, including existing organizations. Owner may change
it with PATCH /api/organizations/:organizationId/sharing-policy and
{employeeSharingEnabled: boolean}. No policy UI. Changes are transactional and immediate
with the same token. Disabling policy blocks Member create/edit/cancel but retains history
and recipients. Admin create permission does not imply edit permission. A demoted creator
cannot use Member policy to manage an old team/organization-targeted item. Owner/Admin
management remains available when the creator leaves.

## Snapshot and membership changes

Creation expands active organization/team/selected-user membership, intersecting team links
with current organization membership. Invalid/foreign/archived/inactive targets fail generically
before writes commit. Limits: 100 input targets and 5000 unique recipients. Empty expansions
are rejected. Team expansion groups in MongoDB before materializing bounded recipient rows.

Later team/org joiners do not receive old snapshots. Creation retries return the original
snapshot without re-expansion. Team removal does not rewrite historical receipts: while
still an active organization member, the recipient may view/acknowledge/complete old content.
Alarms require at least one currently valid original source. A team-only source requires
an active team and active team membership; organization/direct-user or another team source
can independently preserve eligibility. Team archive suppresses its source alarms. Rejoining
a source team can restore eligibility for an existing uncompleted snapshot, but never adds
a person who was absent from the original snapshot.

Organization leave/removal permanently revokes all of that person's historical receipts
in the same transaction as org/team cleanup. Rejoining the org does not restore them.
Organization deletion revokes all receipts, cancels active items and pending/acknowledged
recipient states, and retains completed history/targets. Other organizations, personal
accounts and personal items are untouched.

## APIs

All item paths below are relative to /api/organizations/:organizationId/shared-items.

| Method/path | Behavior |
| --- | --- |
| POST / | Transactionally create item, targets and deduplicated snapshot |
| GET /inbox | Current user's unrevoked receipts, including cancelled/completed items |
| GET /created-by-me | Active member's own creations |
| GET / | Owner or edit_shared_items Admin management list |
| GET /:itemId | Creator, recipient, Owner or authorized Admin; active org membership required |
| GET /:itemId/recipients | Creator/Owner/authorized Admin; safe paginated recipient states |
| PATCH /:itemId | Content edit with expectedRevision |
| POST /:itemId/cancel | Cancel with expectedRevision; cancelled retries are no-ops |
| POST /:itemId/acknowledge | Current recipient acknowledges own state |
| POST /:itemId/complete | Current recipient completes own task/reminder state |

List APIs accept status=active/completed/cancelled, limit 1–100 (default 50) and offset
0–100000 (default 0). Inbox is organization scoped. Responses use stable server ObjectIds,
not personal clientItemId. Creation returns {item, targets, recipientCount}. Detail includes
content, targets, own recipient state, effectiveStatus and alarm state. Managers receive
target definitions and grouped status/revocation counts; ordinary recipients get target
counts without other employees' IDs. Recipient inspection projects only fullName/Notiva ID,
never recovery contacts/mobile/password.

Example create body:

```json
{
  "clientRequestId": "create-task-001",
  "type": "task",
  "title": "Prepare launch notes",
  "description": "Confirm the checklist.",
  "schedule": {"startAt": "2030-11-01T09:00:00+05:30", "allDay": false},
  "recurrence": {"repeat": "none"},
  "completionMode": "collective",
  "collectiveRule": "any",
  "targets": [{"targetType": "team", "targetId": "<team ObjectId>"}]
}
```

Title is nonempty, max 200 characters; description max 10000. Schedule supports startAt,
optional endAt >= startAt, allDay and canonical alertBefore. Unknown/immutable fields are
rejected. Optional clientRequestId is 1–128 letters/digits/underscore/hyphen, unique per org
and creator. Same key and normalized creation content returns the same item; different
content returns 409 SHARED_REQUEST_REUSED. Reuse the key across create retries.

## Edit, cancellation and revisions

Only active items can be edited: title, description, whole schedule replacement, and the
non-recurring recurrence representation. Type, completion mode, creator, organization,
targets and recipient rows are immutable through PATCH. Target edits are explicitly blocked
and deferred. Content/schedule edits preserve prior recipient actions rather than silently
reopening completed work.

serverRevision starts at 1; edit/cancel requires positive integer expectedRevision. Stale
writes return 409 SHARED_ITEM_CONFLICT; refresh detail before retrying. Changed schedules
also increment scheduleRevision. Identical schedules/title-only edits preserve the alarm
key. Cancellation records actor/time, increments serverRevision and sets recipients cancelled,
retaining earlier acknowledgement/completion timestamps. An authorized manager can cancel
a completed item. Already-cancelled retries preserve the original actor/time/revision.

## Individual and collective completion

Individual tasks complete only the acting recipient. Others stay independent and alarm-
eligible. When every unrevoked recipient is completed and at least one remains, global
status becomes completed with completedAt and the last completing actor. Org leave/removal
reevaluates this condition too: if removing an incomplete recipient satisfies it,
completionReason=all_active_recipients_completed and completedByUserId is unset rather
than inventing an actor. Revocation rows retain the membership-change actor. Zero recipients
does not yield vacuous completion. Team-removed snapshot recipients still count while they
retain org access.

Collective tasks support ANY: the first valid completion records that user's action and
atomically completes the item with completedByUserId and completionReason=collective_any.
Other rows retain actual personal action history; effectiveStatus=completed and
alarm.eligible=false expose the global result. Simultaneous/replayed completions preserve
one global actor/time/revision transition. Schema reserves ALL/quorum and a threshold for
future rules, but the API accepts only ANY now.

Reminders are individual-only: acknowledge or complete affects that recipient and suppresses
their alarm, while global status stays active until cancellation. Events are acknowledgement-
only; completion returns EVENT_ACKNOWLEDGEMENT_ONLY. No attendance or scheduler-driven expiry
feature. Task acknowledgement alone does not complete work or suppress its alarm eligibility.

Recipient transitions are monotonic/idempotent. New actions require expectedRevision to
reject stale offline actions after content changes. Already acknowledged/completed replays,
or actions after global completion, return current state without repeated timestamps.
Cancelled items reject recipient actions. lastSeenRevision records the revision accepted
by a new action; recipientRevision independently tracks status/revocation changes.

## Security, transactions, indexes and recurrence

Every item lookup matches organizationId/item ID; all targets must belong to that org.
A recipient cannot supply userId to act for someone else. Inactive creators/recipients
fail current membership authorization. Role/permission authority is never cached in JWTs.

Creation, edits, cancellation, recipient actions, policy and membership cleanup reuse
organizationTransaction and the org revision lock. Target expansion serializes with team/
org membership changes. Transactions roll back item/target/recipient creation, completion,
cancellation and revocation together. Two edits at one revision yield one success/one 409;
collective races yield one transition. Creation racing member removal either rejects that
target or creates a receipt that removal revokes. Transaction-capable MongoDB is required;
there is no standalone partial-write fallback.

Indexes cover org/status/update order, org/creator/update order, unique partial org/creator/
clientRequestId, recipient org/user/access/update, recipient org/item/access/status, unique
item/user, unique item/targetType/targetId, and org target lookup. prepareOrganizationIndexes
initializes all before listening. Personal indexes remain unchanged.

Shared recurrence is deferred: only omitted recurrence or {repeat:"none"} is accepted.
No shared occurrences/future duplicate documents are generated. Later implementation must
keep one shared master and design per-recipient occurrence history first. Personal series
remain unchanged.

## Future offline/alarm contract and limitations

This is backend preparation: no native scheduler, push worker or frontend sync was added.
Clients must use separate shared storage/queues and account+org+item+recipient alarm identity.

1. Reconcile active organizations and every page of their inboxes, including cancelled/
   completed entries. Track both serverRevision and recipientRevision. Use stable creation
   request keys and expectedRevision for new writes/actions.
2. Alarm state exposes eligible, scheduleRevision and key
   shared:{organizationId}:{itemId}:{userId}:{scheduleRevision}. On changed key/schedule,
   cancel the old local alarm before scheduling its replacement. On ineligible/global
   completion/cancellation, cancel any prior alarm for that identity. Apply content edits
   when serverRevision changes even when schedule/key stays the same.
3. eligible means permission/outstanding-state eligibility; client derives trigger time
   from schedule/alertBefore and schedules suitable future times. Team changes may affect
   eligibility without changing item revision, so reevaluate on membership/team refresh.
4. A 401/403/org disappearance must cancel its local shared alarms. Receipts absent from
   a successfully completed full inbox reconciliation must also lose alarms. A failed
   request or partial page is not an authoritative empty inbox.

No delta/deletion feed, durable outbox or stable snapshot cursor is provided. Offset pages
can move during concurrent updates. Production offline clients need robust reconciliation/
lease behavior before enabling unattended alarms. The backend cannot remotely cancel an
already scheduled alarm on a disconnected device: actual native cancellation/rescheduling
is future integration. Shared cancellation never enters the personal deletion feed.

## Tests, changed files and deferred work

`npm test --prefix backend`: **215 passed, 0 failed, 0 skipped**, including all org/team,
auth/session, recovery/profile, personal-item and deletion/cleanup regressions plus
**46 shared suite tests** (45 scenarios and parent). Tests use real HTTP and a disposable
MongoDB replica set through teamFixture, never .env or existing databases. They cover all
40 requested cases, safe profiles, policy/revocation/demotion/transfer, concurrent edit and
completion, unique constraints, retry snapshots, rollback injections, team archive, create/
removal races, and byte-equivalent preservation of a real personal Item/User profile.
`git diff --check` passed. No frontend types changed; TypeScript/frontend checks not needed.

Added: models/OrganizationItem.js, OrganizationItemTarget.js, OrganizationItemRecipient.js;
services/sharedItems.js, sharedItemLifecycle.js; controllers/sharedItemController.js;
tests/sharedItems.test.js; this report.

Updated: models/Organization.js (policy); services/organizations.js (policy/revocation);
services/organizationIndexes.js; routes/organizationRoutes.js; organization/team reports
(follow-up links). Existing unrelated work was preserved.

Deferred: shared recurrence/occurrence state, target editing, ALL/quorum rules, delivery/
outbox/native alarm integration, durable delta sync, full audit-event UI, attendance,
inbox/creation/status screens and org switcher. No Birthday sharing or frontend UI.

Backend restart required: **Yes**. Native changed: **No**. APK rebuild required: **No**.
No Git commit or push was performed.
