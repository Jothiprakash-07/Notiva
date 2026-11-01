import { createHash } from "node:crypto";
import mongoose from "mongoose";
import SharedItem from "../models/OrganizationItem.js";
import Target from "../models/OrganizationItemTarget.js";
import Recipient from "../models/OrganizationItemRecipient.js";
import Member from "../models/OrganizationMember.js";
import Team from "../models/Team.js";
import TeamMember from "../models/TeamMember.js";
import { organizationAccess, requireOrganizationPermission } from "./organizationAuthorization.js";
import { fail, hasPermission } from "./organizationPermissions.js";
import { organizationTransaction, validId } from "./organizations.js";
import { itemFields } from "./itemData.js";
import calendar from "../../shared/recurrence.cjs";
import { completeIndividualTask } from "./sharedItemLifecycle.js";
import { isRecurringShared, validateSharedRecurrence, sharedClock, sharedOccurrenceView, recurringAlarmState, actOnRecurringRecipient } from "./sharedRecurrence.js";

export function sharedFields(input, allowed) {
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) fail(400, "INVALID_SHARED_FIELDS", "Unsupported shared-item fields.");
}
function text(value, max, required = false) {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) fail(400, "INVALID_SHARED_CONTENT", `Use ${required ? "nonempty " : ""}text of at most ${max} characters.`);
  return value.trim();
}
export function sharedSchedule(value) {
  sharedFields(value, ["startAt", "endAt", "allDay", "alertBefore"]);
  const result = {};
  for (const key of ["startAt", "endAt", "allDay", "alertBefore"]) {
    if (value[key] !== undefined) {
      if (!itemFields[key](value[key])) fail(400, "INVALID_SHARED_SCHEDULE", `Invalid ${key}.`);
      if (["startAt", "endAt"].includes(key) && !/(Z|[+-]\d{2}:\d{2})$/i.test(value[key])) fail(400, "INVALID_SHARED_SCHEDULE", "Shared timestamps require an explicit timezone offset or Z.");
      result[key] = value[key];
    }
  }
  if (!result.startAt || (result.endAt && Date.parse(result.endAt) < Date.parse(result.startAt))) fail(400, "INVALID_SHARED_SCHEDULE", "Provide startAt and an endAt no earlier than startAt.");
  result.allDay ??= false;
  return { startAt: result.startAt, ...(result.endAt !== undefined ? { endAt: result.endAt } : {}), allDay: result.allDay,
    ...(result.alertBefore !== undefined ? { alertBefore: result.alertBefore } : {}) };
}
const targetKey = row => `${row.targetType}:${row.targetId ?? ""}`;
function targetDefinitions(value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) fail(400, "INVALID_SHARED_TARGETS", "Provide 1–100 targets.");
  const byKey = new Map();
  for (const row of value) {
    sharedFields(row, ["targetType", "targetId"]);
    if (!["organization", "team", "user"].includes(row.targetType)) fail(400, "INVALID_SHARED_TARGETS", "Invalid target type.");
    const targetId = row.targetType === "organization" ? null : validId(row.targetId).toLowerCase();
    if (row.targetType === "organization" && row.targetId != null) fail(400, "INVALID_SHARED_TARGETS", "Organization targetId must be omitted or null.");
    const normalized = { targetType: row.targetType, targetId };
    byKey.set(targetKey(normalized), normalized);
  }
  return [...byKey.values()].sort((a, b) => targetKey(a).localeCompare(targetKey(b)));
}
export function canManageSharedItem(item, organization, membership) {
  if (hasPermission(membership, "edit_shared_items")) return true;
  return membership.role === "member" && organization.employeeSharingEnabled && item.employeeOnlyTargets && String(item.createdByUserId) === String(membership.userId);
}
export function canInspectSharedItem(item, membership) {
  return String(item.createdByUserId) === String(membership.userId) || hasPermission(membership, "edit_shared_items");
}
export const publicSharedItem = item => ({ id: String(item._id), organizationId: String(item.organizationId), type: item.type,
  title: item.title, description: item.description, createdByUserId: String(item.createdByUserId), status: item.status,
  completionMode: item.completionMode, collectiveRule: item.collectiveRule, schedule: item.schedule,
  recurrence: item.recurrence?.toObject ? item.recurrence.toObject() : item.recurrence ?? { repeat: "none" },
  occurrenceHistory: item.occurrenceHistory ?? [], serverRevision: item.serverRevision, scheduleRevision: item.scheduleRevision,
  createdAt: item.createdAt, updatedAt: item.updatedAt, cancelledAt: item.cancelledAt, cancelledByUserId: item.cancelledByUserId,
  completedAt: item.completedAt, completedByUserId: item.completedByUserId, completionReason: item.completionReason });
export const publicRecipient = row => row ? ({ userId: String(row.userId), status: row.status,
  accessStatus: row.accessStatus, acknowledgedAt: row.acknowledgedAt, completedAt: row.completedAt,
  eligibleFrom: row.eligibleFrom, excludedOccurrenceKey: row.excludedOccurrenceKey, revokedAt: row.revokedAt, removalReason: row.removalReason,
  cancelledAt: row.cancelledAt, occurrenceHistory: row.occurrenceHistory ?? [], lastSeenRevision: row.lastSeenRevision, recipientRevision: row.recipientRevision }) : null;

async function expandTargets(organizationId, definitions, session) {
  const teamIds = definitions.filter(t => t.targetType === "team").map(t => t.targetId);
  const userIds = definitions.filter(t => t.targetType === "user").map(t => t.targetId);
  const teams = await Team.find({ organizationId, _id: { $in: teamIds }, status: "active" }).session(session);
  if (teams.length !== teamIds.length) fail(400, "INVALID_SHARED_TARGETS", "Every target must be active and belong to this organization.");
  const selected = await Member.find({ organizationId, userId: { $in: userIds }, status: "active" }).session(session);
  if (selected.length !== userIds.length) fail(400, "INVALID_SHARED_TARGETS", "Every target must be active and belong to this organization.");
  const candidates = new Map();
  const add = (userId, key) => {
    const id = String(userId), sources = candidates.get(id) ?? new Set(); sources.add(key); candidates.set(id, sources);
    if (candidates.size > 5000) fail(400, "SHARED_RECIPIENT_LIMIT", "A snapshot may contain at most 5000 recipients.");
  };
  for (const row of selected) add(row.userId, `user:${row.userId}`);
  if (definitions.some(t => t.targetType === "organization")) {
    const members = await Member.find({ organizationId, status: "active" }).limit(5001).session(session);
    for (const row of members) add(row.userId, "organization:");
  }
  if (teamIds.length) {
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const links = await TeamMember.aggregate([
      { $match: { organizationId: orgId, teamId: { $in: teams.map(t => t._id) }, status: "active" } },
      { $lookup: { from: Member.collection.name, let: { userId: "$userId" }, pipeline: [
        { $match: { organizationId: orgId, status: "active", $expr: { $eq: ["$userId", "$$userId"] } } },
        { $project: { _id: 1 } },
      ], as: "activeMembership" } }, { $unwind: "$activeMembership" },
      { $group: { _id: "$userId", teamIds: { $addToSet: "$teamId" } } }, { $limit: 5001 },
    ]).session(session);
    for (const row of links) for (const teamId of row.teamIds) add(row._id, `team:${teamId}`);
  }
  if (!candidates.size) fail(400, "NO_SHARED_RECIPIENTS", "Targets must resolve to at least one active recipient.");
  return candidates;
}

export async function createSharedItem(organizationId, actorUserId, input) {
  validId(organizationId);
  sharedFields(input, ["type", "title", "description", "schedule", "recurrence", "completionMode", "collectiveRule", "targets", "clientRequestId"]);
  if (!["reminder", "task", "event"].includes(input.type)) fail(400, "INVALID_SHARED_TYPE", "Shared type must be reminder, task or event.");
  const definitions = targetDefinitions(input.targets), completionMode = input.completionMode ?? "individual";
  if (!["individual", "collective"].includes(completionMode) || (completionMode === "collective" && input.type !== "task")) fail(400, "INVALID_COMPLETION_MODE", "Collective mode is only supported for tasks.");
  const collectiveRule = completionMode === "collective" ? input.collectiveRule ?? "any" : undefined;
  if ((collectiveRule && collectiveRule !== "any") || (completionMode === "individual" && input.collectiveRule !== undefined)) fail(400, "INVALID_COLLECTIVE_RULE", "Only collective ANY is supported.");
  if (input.clientRequestId !== undefined && (typeof input.clientRequestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(input.clientRequestId))) fail(400, "INVALID_REQUEST_ID", "Use a stable clientRequestId of 1–128 letters, digits, underscores or hyphens.");
  const content = { type: input.type, title: text(input.title, 200, true), description: input.description === undefined ? "" : text(input.description, 10000),
    schedule: sharedSchedule(input.schedule), recurrence: validateSharedRecurrence(input.recurrence, input.schedule), completionMode, collectiveRule };
  if (content.recurrence.repeat !== "none") content.recurrence.effectiveFrom = content.schedule.startAt;
  const hash = createHash("sha256").update(JSON.stringify({ ...content, targets: definitions })).digest("hex");
  return organizationTransaction(async session => {
    const { organization, membership } = await organizationAccess(organizationId, actorUserId, session, true);
    if (membership.role === "member") {
      if (!organization.employeeSharingEnabled) fail(403, "EMPLOYEE_SHARING_DISABLED", "Employee sharing is disabled by organization policy.");
      if (definitions.some(t => t.targetType !== "user")) fail(403, "EMPLOYEE_TARGETS_ONLY", "Members may share with selected employees only.");
    } else requireOrganizationPermission(membership, "create_shared_items");
    let item = input.clientRequestId === undefined ? null : await SharedItem.findOne({ organizationId, createdByUserId: actorUserId, clientRequestId: input.clientRequestId }).session(session);
    if (item && item.creationHash !== hash) fail(409, "SHARED_REQUEST_REUSED", "clientRequestId was already used with different content.");
    if (!item) {
      const candidates = await expandTargets(organizationId, definitions, session);
      [item] = await SharedItem.create([{ organizationId, createdByUserId: actorUserId, ...content,
        employeeOnlyTargets: definitions.every(row => row.targetType === "user"),
        clientRequestId: input.clientRequestId, creationHash: hash }], { session });
      const targets = await Target.insertMany(definitions.map(row => ({ organizationId, organizationItemId: item._id, ...row })), { session });
      const byKey = new Map(targets.map(row => [targetKey(row), row._id]));
      await Recipient.insertMany([...candidates].map(([userId, sources]) => ({ organizationId, organizationItemId: item._id, userId,
        sourceTargetIds: [...sources].map(key => byKey.get(key)), status: "pending", accessStatus: "active" })), { session });
    }
    const targets = await Target.find({ organizationId, organizationItemId: item._id, active: { $ne: false } }).session(session);
    const recipientCount = await Recipient.countDocuments({ organizationId, organizationItemId: item._id, accessStatus: "active" }).session(session);
    return { item: publicSharedItem(item), targets: targets.map(t => ({ targetType: t.targetType, targetId: t.targetId })), recipientCount };
  });
}

export async function findSharedItem(organizationId, itemId, session = null) {
  validId(itemId);
  const item = await SharedItem.findOne({ _id: itemId, organizationId }).session(session);
  if (!item) fail(404, "SHARED_ITEM_NOT_FOUND", "Shared item is not available in this organization.");
  return item;
}
export function expectedSharedRevision(value, item, code = "SHARED_ITEM_CONFLICT") {
  if (!Number.isSafeInteger(value) || value < 1) fail(400, "EXPECTED_REVISION_REQUIRED", "A positive integer expectedRevision is required.");
  if (value !== item.serverRevision) fail(409, code, "Shared item changed. Refresh before retrying.");
}
function grantStart(item, now) {
  if (!isRecurringShared(item)) return {};
  const due = calendar.currentOccurrence(item, now);
  const completed = item.occurrenceHistory.some(row => row.occurrenceKey === due?.key && row.status === "completed");
  const ongoingEvent = due && item.type === "event" && Date.parse(due.startAt) <= +now && Date.parse(due.endAt ?? due.startAt) >= +now;
  const skipCurrent = due && (completed || !ongoingEvent && Date.parse(due.startAt) <= +now);
  return { eligibleFrom: ongoingEvent ? new Date(due.startAt) : now, excludedOccurrenceKey: skipCurrent ? due.key : undefined };
}
async function reconcileTargets(item, actor, definitions, session) {
  // Validate/expand the entire proposed audience before any target or receipt write.
  const candidates = await expandTargets(item.organizationId, definitions, session);
  const filter = { organizationId: item.organizationId, organizationItemId: item._id };
  const oldTargets = await Target.find(filter).session(session), oldRecipients = await Recipient.find(filter).session(session);
  const wanted = new Set(definitions.map(targetKey)), targetIds = new Map(), now = sharedClock.now();
  for (const target of oldTargets) if (!wanted.has(targetKey(target)) && target.active !== false) {
    target.active = false; target.removedAt = now; target.removedByUserId = actor; await target.save({ session });
  }
  for (const definition of definitions) {
    let target = oldTargets.find(row => targetKey(row) === targetKey(definition));
    if (target) { target.active = true; target.removedAt = undefined; target.removedByUserId = undefined; await target.save({ session }); }
    else [target] = await Target.create([{ ...filter, ...definition }], { session });
    targetIds.set(targetKey(definition), target._id);
  }
  const byUser = new Map(oldRecipients.map(row => [String(row.userId), row])), diff = { added: 0, reactivated: 0, removed: 0, unchanged: 0 };
  const grant = grantStart(item, now);
  for (const [userId, sources] of candidates) {
    let recipient = byUser.get(userId);
    const sourceTargetIds = [...sources].map(key => targetIds.get(key));
    if (!recipient) {
      await Recipient.create([{ ...filter, userId, sourceTargetIds, ...grant, lastSeenRevision: item.serverRevision + 1 }], { session }); diff.added++;
    } else {
      const reactivated = recipient.accessStatus !== "active";
      if (reactivated) {
        recipient.accessStatus = "active"; recipient.eligibleFrom = grant.eligibleFrom; recipient.excludedOccurrenceKey = grant.excludedOccurrenceKey;
        recipient.revokedAt = undefined; recipient.revokedByUserId = undefined; recipient.removalReason = undefined; diff.reactivated++;
      } else diff.unchanged++;
      const changed = reactivated || recipient.sourceTargetIds.map(String).sort().join() !== sourceTargetIds.map(String).sort().join();
      if (changed) { recipient.sourceTargetIds = sourceTargetIds; recipient.recipientRevision++; await recipient.save({ session }); }
    }
  }
  for (const recipient of oldRecipients) if (recipient.accessStatus === "active" && !candidates.has(String(recipient.userId))) {
    recipient.accessStatus = "revoked"; recipient.revokedAt = now; recipient.revokedByUserId = actor; recipient.removalReason = "target_change";
    recipient.recipientRevision++; await recipient.save({ session }); diff.removed++;
  }
  item.employeeOnlyTargets = definitions.every(row => row.targetType === "user");
  return { targetDiff: diff, targets: definitions, recipientCount: candidates.size };
}
export async function mutateSharedItem(organizationId, actorUserId, itemId, action, input) {
  validId(organizationId);
  return organizationTransaction(async session => {
    const { organization, membership } = await organizationAccess(organizationId, actorUserId, session, true);
    const item = await findSharedItem(organizationId, itemId, session);
    if (!canManageSharedItem(item, organization, membership)) fail(403, "SHARED_MANAGEMENT_REQUIRED", "Shared-item editing is not permitted.");
    sharedFields(input, action === "cancel" ? ["expectedRevision"] : ["title", "description", "schedule", "recurrence", "targets", "expectedRevision"]);
    if (action === "cancel" && item.status === "cancelled") return { item: publicSharedItem(item) };
    expectedSharedRevision(input.expectedRevision, item, input.targets !== undefined ? "ITEM_REVISION_CONFLICT" : "SHARED_ITEM_CONFLICT");
    let audience;
    if (action === "cancel") {
      item.status = "cancelled"; item.cancelledAt = new Date(); item.cancelledByUserId = actorUserId;
      // Keep completion/acknowledgment evidence while making cancellation explicit.
      await Recipient.updateMany({ organizationId, organizationItemId: itemId, status: { $ne: "cancelled" } }, {
        $set: { status: "cancelled", cancelledAt: item.cancelledAt }, $inc: { recipientRevision: 1 },
      }, { session });
    } else {
      if (item.status !== "active") fail(409, "SHARED_ITEM_INACTIVE", "Only active shared items can be edited.");
      if (!Object.keys(input).some(key => key !== "expectedRevision")) fail(400, "INVALID_SHARED_FIELDS", "Provide content to update.");
      if (input.title !== undefined) item.title = text(input.title, 200, true);
      if (input.description !== undefined) item.description = text(input.description, 10000);
      const beforeSchedule = JSON.stringify(sharedSchedule(item.schedule.toObject()));
      const beforeRule = JSON.stringify({ repeat: item.recurrence.repeat, ...(item.recurrence.repeat !== "none" ? { timeZone: item.recurrence.timeZone,
        ...(item.recurrence.repeat === "weekly" ? { weeklyDays: [...item.recurrence.weeklyDays] } : {}) } : {}) });
      if (input.schedule !== undefined) {
        const next = sharedSchedule(input.schedule);
        item.schedule = next;
      }
      const nextRule = input.recurrence === undefined ? JSON.parse(beforeRule) : validateSharedRecurrence(input.recurrence, item.schedule);
      const changed = beforeSchedule !== JSON.stringify(sharedSchedule(item.schedule.toObject())) || beforeRule !== JSON.stringify(nextRule);
      if (changed) {
        item.scheduleRevision += 1;
        item.recurrence = { ...nextRule, ...(nextRule.repeat !== "none" ? { effectiveFrom: new Date(Math.max(+sharedClock.now(), Date.parse(item.schedule.startAt))).toISOString() } : {}) };
      }
      if (input.targets !== undefined) {
        const definitions = targetDefinitions(input.targets);
        if (membership.role === "member" && definitions.some(row => row.targetType !== "user")) fail(403, "EMPLOYEE_TARGETS_ONLY", "Members may share with selected employees only.");
        audience = await reconcileTargets(item, actorUserId, definitions, session);
        await completeIndividualTask(item, session, null, false);
      }
    }
    item.serverRevision += 1; await item.save({ session });
    if (audience) {
      const recipient = await Recipient.findOne({ organizationId, organizationItemId: itemId, userId: actorUserId, accessStatus: "active" }).session(session);
      const view = isRecurringShared(item) ? sharedOccurrenceView(item, recipient) : {};
      return { item: publicSharedItem(item), ...audience, ...view, recipient: publicRecipient(view.recipient ?? recipient), alarm: await sharedAlarmState(item, recipient, session) };
    }
    return { item: publicSharedItem(item) };
  });
}

// Snapshot grants history visibility; current team membership gates alarms for
// team-only sources. Organization/user sources remain eligible independently.
export async function sharedAlarmState(item, recipient, session = null) {
  if (isRecurringShared(item)) return recurringAlarmState(item, recipient);
  let eligible = Boolean(recipient?.accessStatus === "active" && item.status === "active" && !["completed", "cancelled"].includes(recipient.status));
  if (eligible && item.type !== "task" && recipient.status === "acknowledged") eligible = false;
  if (eligible) {
    const sources = await Target.find({ organizationId: item.organizationId, organizationItemId: item._id, _id: { $in: recipient.sourceTargetIds } }).session(session);
    if (!sources.some(t => t.targetType === "organization" || t.targetType === "user")) {
      const teamIds = sources.filter(t => t.targetType === "team").map(t => t.targetId);
      const activeTeams = await Team.find({ organizationId: item.organizationId, _id: { $in: teamIds }, status: "active" }).session(session);
      eligible = Boolean(await TeamMember.exists({ organizationId: item.organizationId, teamId: { $in: activeTeams.map(t => t._id) }, userId: recipient.userId, status: "active" }).session(session));
    }
  }
  return { eligible, scheduleRevision: item.scheduleRevision,
    key: recipient ? `shared:${item.organizationId}:${item._id}:${recipient.userId}:${item.scheduleRevision}` : null };
}

export async function actOnSharedRecipient(organizationId, actorUserId, itemId, action, input) {
  validId(organizationId); sharedFields(input, ["expectedRevision", "occurrenceKey"]);
  return organizationTransaction(async session => {
    await organizationAccess(organizationId, actorUserId, session, true);
    const item = await findSharedItem(organizationId, itemId, session);
    const recipient = await Recipient.findOne({ organizationId, organizationItemId: itemId, userId: actorUserId, accessStatus: "active" }).session(session);
    if (!recipient) fail(403, "SHARED_RECIPIENT_REQUIRED", "An active snapshot recipient is required.");
    if (item.status === "cancelled") fail(409, "SHARED_ITEM_CANCELLED", "Shared item was cancelled.");
    if (action === "complete" && item.type === "event") fail(400, "EVENT_ACKNOWLEDGEMENT_ONLY", "Events support acknowledgement, not attendance completion.");
    if (isRecurringShared(item)) {
      await actOnRecurringRecipient(item, recipient, actorUserId, action, input, session);
      const view = sharedOccurrenceView(item, recipient);
      return { item: publicSharedItem(item), ...view, recipient: publicRecipient(view.recipient), alarm: await sharedAlarmState(item, recipient, session) };
    }
    const replay = recipient.status === "completed" || (action === "acknowledge" && recipient.status === "acknowledged") || item.status === "completed";
    if (!replay) {
      expectedSharedRevision(input.expectedRevision, item);
      recipient.lastSeenRevision = item.serverRevision; recipient.recipientRevision += 1;
      if (action === "acknowledge") { recipient.status = "acknowledged"; recipient.acknowledgedAt = new Date(); }
      else {
        recipient.status = "completed"; recipient.completedAt = new Date();
        if (item.type === "task" && item.completionMode === "collective") {
          item.status = "completed"; item.completedAt = recipient.completedAt; item.completedByUserId = actorUserId;
          item.completionReason = "collective_any"; item.serverRevision += 1; await item.save({ session });
        }
      }
      await recipient.save({ session });
      if (action === "complete") await completeIndividualTask(item, session, actorUserId);
    }
    return { item: publicSharedItem(item), recipient: publicRecipient(recipient),
      effectiveStatus: item.status === "active" ? recipient.status : item.status,
      alarm: await sharedAlarmState(item, recipient, session) };
  });
}
