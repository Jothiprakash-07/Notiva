# Shared-item frontend foundation

Target editing now extends this foundation; see [target editing report](SHARED_TARGET_EDITING_REPORT.md). Earlier target-edit deferrals describe the original foundation stage.

Recurrence support now extends this foundation; see [shared recurrence report](SHARED_RECURRENCE_FOUNDATION.md). Earlier recurrence deferrals below describe the original foundation stage.

Implemented October 22, 2026. No commit or push. Backend contracts unchanged.

## Organization context and switcher

OrganizationProvider lives under the existing AuthProvider. It reads current normalized
memberships through the existing authenticatedFetch/session-renewal transport. The selected
organization is persisted per account under notiva.shared.account.v1.<account>. If the
selection disappears, the first available active organization becomes current. Empty
membership lists show a join/approval message. The old User.organizationCode does not
authorize this workspace.

The existing Team tab now hosts a minimal organization selector, role label and shared
workspace. No global tab redesign. Selecting an organization remounts org-scoped screen
state; it does not cancel another active organization's alerts. Account/session changes
reset context, ignore old responses and clean up old-account shared alarms. Token renewal
within the same session does not restart the workspace.

## Inbox, Created by Me and detail

Inbox uses the organization's recipient inbox API. Created by Me uses the creator list;
Owner and edit_shared_items Admins also receive a Manage list. Active/Completed/Cancelled
filters preserve history. Inbox status reflects the current recipient plus global result;
creator/management filters use global item status so one creator's individual completion
does not hide outstanding work for other recipients.

Cards use the existing purple/dark/lavender design, green completion and red destructive
actions, with no gradients. Shared type labels distinguish them from personal cards.
Cards show title, description summary, local schedule, creator name when available, task
mode and status. Created/management cards are enriched with safe detail summaries to show
recipient counts and individual/collective progress. Online display limits: latest 200
inbox items and latest 50 creator/management items. Alarm reconciliation processes the full
paginated inbox independently of that display limit.

Shared detail shows content, schedule/end time, creator, own response, effective/global
status and task semantics. Creator/Owner/authorized Admin can inspect target definitions,
safe recipient names/Notiva IDs and aggregate/per-recipient status. Team targets resolve
safe team names where available. No recovery email/mobile is displayed.

Known permission failures replace detail content with an error and evict the item cache
and alarm. An organization access failure removes the organization and its cached data.
Offline saved details are explicitly marked read-only. UI state is keyed by account/org/
item, and late responses cannot repopulate an organization cache after detected revocation.

## Create flow and target picker

One shared create form supports Reminder, Task and Event. Fields: title, description,
start date/time, event end date/time, pre-alert, task completion mode and targets. It uses
the existing native date/time-picker package and existing date formatting; web has a
validated local YYYY-MM-DD HH:mm input. Schedules are submitted as ISO timestamps with Z.
Title/description lengths, future start and event end ordering are checked before submit.

Owner can choose Entire Organization, Teams or Selected Employees. Admin requires
create_shared_items. Member requires employeeSharingEnabled and sees only Selected
Employees. Permission helpers are centralized in sharedPermissions.ts; server authorization
remains authoritative. Broad-target historical items do not become editable through Member
sharing policy after creator demotion.

The target picker supports independent team/employee multi-select. Teams show member counts;
employees show safe names/Notiva IDs and search by either. Backend deduplication handles
overlapping teams. Entire Organization says “Current members will receive this item.” All
modes explain that later joiners do not automatically receive historical items. There is
no self-selected team membership, organization/team management UI or policy editor here.

Task options are Individual (“Each recipient completes this task separately.”) and Complete
for everyone (“When any one recipient completes it, the task is completed for everyone.”).
The latter submits collective + collectiveRule=any. Reminder/Event remain individual.
No recurrence, target editing, ALL/quorum or manual recipient editing controls exist.

## Recipient actions, edits and cancellation

- Reminder: Acknowledge and/or Complete according to current state.
- Task: Complete; individual updates own response, collective ANY exposes global completion.
- Event: Acknowledge only.
- Completed/cancelled effective states disable further recipient actions.

Actions wait for server evidence rather than showing uncommitted optimistic completion.
Detail and all organizations' inbox/alarm eligibility refresh after success. Collective
completion shows “Completed by <safe name>” when that name is available. Actual per-user
action history is not replaced with fictitious completions.

Authorized edit supports title, description and schedule/pre-alert only. Type, targets,
completion mode and recurrence are absent from the edit form. Requests use expectedRevision.
On 409, authoritative detail is refreshed and edit fields are replaced with current server
content; the user sees a conflict message and can review before retrying. Personal conflict
storage/UI is not reused.

Cancel requires explicit in-screen confirmation: “Cancel this shared item?” and “Recipients
will no longer receive future alerts.” Cancellation preserves the card/detail in history;
it does not delete local or backend item records. A successful action's returned state is
persisted and its obsolete alarm is cancelled even if the subsequent refresh goes offline.

## Service layer and local cache

sharedApi.ts groups organization/team/member and shared list/create/detail/edit/cancel/
acknowledge/complete/recipient operations. It reuses API_BASE_URL, authenticatedFetch and
the current session, including existing session renewal. Lists fetch all bounded backend
pages and deduplicate moving pages by stable item identity and newest revision.

Separate account+organization keys are notiva.shared.v1.<account>.<organization>. Native
storage uses the same SDK 54 File/Paths pattern already used in the app; web uses localStorage.
Each cache holds recent lists (up to 200), up to 100 details, recipient state/revisions,
refresh metadata and an optional unresolved create request. It never reads/writes personal
item arrays, sync queues, tombstones or recurrence state. Known revoked organizations are
purged; unknown network failures retain read-only snapshots.

Creation persists one clientRequestId and payload before POST. A lost response keeps that
exact request available for manual retry, including relaunch; it does not generate a new
key or silently resend in the background. The form is frozen while confirmation is pending.
Definite validation/permission failures clear the pending request so the user can correct
it. This is safe create retry preparation, not a full offline write queue.

## Alarm integration, pre-alerts and relaunch

Shared scheduling converts an authoritative received item into a temporary ReminderItem
only at the existing scheduleItemNotifications boundary. It never saves that object to
personal item storage. Existing notification settings, permissions, pre-alerts, Android
native bridge and iOS Expo scheduler are reused. No separate notification implementation.

Logical ID: notiva-shared[<organization>]::<item>. The existing accountAlarmId wrapper adds
recipient account identity. Android native IDs retain native-alarm: around that account/
shared identity. Backend alarm key/scheduleRevision plus content/schedule fingerprint drive
replacement. Old alarms are cancelled before updated alarms are scheduled. Dismissal does
not mutate shared server state.

A separate durable shared alarm registry journals identity before scheduling. Android
hasSchedule and iOS scheduled-request inspection detect existing alarms on relaunch. Native
PendingIntent identity is stable; iOS orphan requests from interrupted scheduling are found
by their account/shared item payload. Reconciliation is serialized; repeated refreshes and
relaunches do not create duplicate logical alert pairs. Cancellation failures leave registry
evidence for retry, including removal of alarms for no-longer-active organizations.

Eligibility changes cancel alarms on own completion, collective global completion, item
cancellation, detected org/recipient revocation and schedule replacement. No scheduling is
done from unverified cached items, and past non-recurring starts are not rescheduled. Other
organizations retain their alarms when the visible organization changes.

Workspace refresh runs at startup, foreground resume, workspace focus, explicit refresh,
after mutations and every 30 seconds while foregrounded. Full inbox pagination is required
before reconciliation. Missing cached/scheduled receipts are verified by detail before
being treated as revoked, to avoid cancelling alerts due to moving offset pages.

Notification taps route to shared detail instead of personal-item lookup. Native Done
dismisses the local alarm and opens shared detail with an explanation; the user confirms
Complete/Acknowledge there against current server access/revision. It does not silently
complete a collective task or send an offline write. Shared notifications are kept out of
the legacy global personal notification-history collection; their history lives in the
scoped inbox. Personal notification routing/history behavior is otherwise preserved.

## Loading/error/permission states and limitations

Screens include loading, empty inbox/created list, no organizations, no teams/members,
employee-search empty results, permission denial, organization unavailable, retry errors
and marked offline read-only snapshots. Permission errors do not fall back to cached detail.

Remote cancellation/team/membership changes are detected on foreground refresh; this task
adds no background push/delivery worker. A disconnected/background device cannot immediately
learn a server change, so already scheduled alarms can persist until the next successful
refresh. Physical delivery/audio/full-screen behavior, cold native launches and device
permission prompts still need the requested later physical-device validation. Web export
compilation is checked; native alarms are not scheduled on web.

Backend contracts unchanged, so this task did not rerun backend suites. Backend must already
run the organization/team/shared-item foundation. Legacy onboarding organization registration
and profile organization screens were left outside this UI scope; the Team workspace uses
normalized membership APIs exclusively.

## Verification

- node scripts/test-shared-items.cjs: **30 service/alarm checks passed**.
- node scripts/test-shared-ui.cjs: **16 rendered UI checks passed** using React/DOM mocks.
- npx tsc --noEmit: passed after regenerating Expo Router declarations with installed tooling.
- npm run lint: passed, **0 errors, 5 pre-existing warnings** in profile/session hooks and
  duplicate notificationService imports in root layout. No new shared-file lint warnings.
- Offline Expo web export: passed to .build-tools/shared-web-validation.
- git diff --check: passed.

All 16 regression scripts passed: test-login, test-profile-session, test-session-renewal,
test-recovery-auth, test-item-sync, test-conflict-resolution, test-conflict-ui,
test-item-conflicts, test-master-recurrence, test-master-sync, test-daily-recurrence,
test-weekly-recurrence, test-weekdays-recurrence, test-pre-alerts, test-native-alarms,
test-recurrence-preview-ui (all .cjs under scripts).

The new checks cover all 27 requested cases across runtime/services and rendered controls,
plus lost POST responses, authoritative action evidence followed by offline refresh,
late-response revocation protection, moving-page deduplication, and Android/iOS simulated
relaunch/schedule replacement. These are automated simulations, not physical-device claims.

## Files changed in this task

Added: contexts/OrganizationContext.tsx; types/shared.ts; services/sharedApi.ts, sharedCache.ts,
sharedWorkspace.ts, sharedAlarms.ts; utils/sharedPermissions.ts, sharedDraft.ts;
components/shared/SharedUI.tsx, SharedWorkspace.tsx, SharedTargetPicker.tsx, SharedDateTime.tsx;
app/screens/shared/item.tsx and create.tsx; scripts/test-shared-items.cjs, test-shared-ui.cjs;
this report.

Updated: app/(tabs)/team.tsx (replaces placeholder); app/_layout.tsx (provider, screens,
shared notification routing); components/common/NativeAlarmCompletion.tsx (shared Done
routing); scripts/test-native-alarms.cjs (provides interval globals to reused test harness).
Existing personal-item/offline/conflict and backend changes were preserved.

Deferred: shared recurrence, target/recipient editing after creation, analytics, ALL/quorum,
offline write queue, background push synchronization, advanced organization/team management
screens and physical-device validation.

Native/Kotlin/Manifest/plugins/resources changed: **No**. APK rebuild required: **No**.
Use a dev-client reload for these TS/TSX/JS changes. No Git commit or push performed.
