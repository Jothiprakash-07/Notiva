import recurrence from "../../shared/recurrence.cjs";
import Recipient from "../models/OrganizationItemRecipient.js";
import { fail } from "./organizationPermissions.js";
export const sharedClock = { now: () => new Date() };
export const isRecurringShared = item => Boolean(item.recurrence?.repeat && item.recurrence.repeat !== "none");
const plain = value => value?.toObject ? value.toObject() : value;
export function validateSharedRecurrence(value, schedule) {
  try {
    if (value && Object.hasOwn(value, "effectiveFrom")) throw Error("effectiveFrom is server controlled.");
    return recurrence.normalizeRecurrence(value, schedule);
  } catch (error) { fail(400, "INVALID_SHARED_RECURRENCE", error.message); }
}
export function sharedOccurrenceView(item, recipient, now = sharedClock.now()) {
  const due = recurrence.currentOccurrence(item, now, recipient), history = plain(recipient)?.occurrenceHistory ?? [];
  const own = history.find(row => row.occurrenceKey === due?.key), global = (plain(item).occurrenceHistory ?? []).find(row => row.occurrenceKey === due?.key);
  const projected = recipient ? { ...plain(recipient), status: own?.status ?? "pending", acknowledgedAt: own?.acknowledgedAt, completedAt: own?.completedAt } : null;
  const status = recurrence.occurrenceStatus(item, due, own, global, now);
  return { occurrence: due ? { ...due, status, completedByUserId: global?.completedByUserId, completedAt: global?.completedAt } : null,
    recipient: projected, effectiveStatus: status };
}
export async function recurringRecipientSummary(item, session = null, now = sharedClock.now()) {
  const due = recurrence.currentOccurrence(item, now);
  if (!due) return [];
  const rows = await Recipient.aggregate([
    { $match: { organizationId: item.organizationId, organizationItemId: item._id, ...eligibleAt(due) } },
    { $project: { accessStatus: 1, result: { $arrayElemAt: [{ $filter: { input: { $ifNull: ["$occurrenceHistory", []] }, as: "row", cond: { $eq: ["$$row.occurrenceKey", due?.key ?? ""] } } }, 0] } } },
    { $group: { _id: { accessStatus: "$accessStatus", status: { $ifNull: ["$result.status", "pending"] } }, count: { $sum: 1 } } },
  ]).session(session);
  return rows.map(row => ({ ...row._id, count: row.count }));
}
export async function actOnRecurringRecipient(item, recipient, actorUserId, action, input, session) {
  if (typeof input.occurrenceKey !== "string" || input.occurrenceKey.length > 100) fail(400, "OCCURRENCE_KEY_REQUIRED", "Provide the occurrenceKey being acted on.");
  const prior = recipient.occurrenceHistory.find(row => row.occurrenceKey === input.occurrenceKey);
  if (prior?.status === "completed" || (action === "acknowledge" && prior?.status === "acknowledged")) return;
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) fail(400, "EXPECTED_REVISION_REQUIRED", "Provide expectedRevision.");
  if (input.expectedRevision !== item.serverRevision) fail(409, "SHARED_ITEM_CONFLICT", "Shared series changed. Refresh before retrying.");
  const day = input.occurrenceKey.match(/^\d+\|(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}$/)?.[1];
  const now = sharedClock.now(), due = day ? recurrence.dueOn(item, day) : null;
  const today = recurrence.wallDateKey(now, item.recurrence.timeZone), oldest = new Date(today + "T00:00:00Z"); oldest.setUTCDate(oldest.getUTCDate() - 366);
  if (!due || due.key !== input.occurrenceKey || due.key === recipient.excludedOccurrenceKey || (recipient.eligibleFrom && Date.parse(due.startAt) < +recipient.eligibleFrom) || day > today || day < oldest.toISOString().slice(0, 10)) fail(409, "OCCURRENCE_NOT_ACTIONABLE", "This occurrence is future, before recipient access, outside the replay window, invalid or belongs to a replaced rule.");
  const global = item.occurrenceHistory.find(row => row.occurrenceKey === due.key);
  if (global?.status === "completed") return;
  const row = { occurrenceKey: due.key, scheduledAt: due.startAt, status: action === "complete" ? "completed" : "acknowledged",
    ...(prior?.acknowledgedAt ? { acknowledgedAt: prior.acknowledgedAt } : {}),
    ...(action === "complete" ? { completedAt: now, completedByUserId: actorUserId } : { acknowledgedAt: now }) };
  recipient.occurrenceHistory = recurrence.mergeHistory(recipient.occurrenceHistory.map(plain), row);
  recipient.recipientRevision += 1; recipient.lastSeenRevision = item.serverRevision;
  await recipient.save({ session });
  if (item.type === "task" && action === "complete") {
    const summary = await recurringRecipientSummaryForKey(item, due, session);
    const allDone = summary.total > 0 && summary.total === summary.done;
    if (item.completionMode === "collective" || allDone) {
      item.occurrenceHistory = recurrence.mergeHistory(item.occurrenceHistory.map(plain), { ...row, status: "completed" });
      await item.save({ session }); // Master remains active; content revision unchanged.
    }
  }
}
function eligibleAt(due) {
  return { $or: [{ eligibleFrom: null }, { eligibleFrom: { $lte: new Date(due.startAt) } }], excludedOccurrenceKey: { $ne: due.key } };
}
async function recurringRecipientSummaryForKey(item, due, session) {
  const filter = { organizationId: item.organizationId, organizationItemId: item._id, accessStatus: "active", ...eligibleAt(due) };
  return { total: await Recipient.countDocuments(filter).session(session), done: await Recipient.countDocuments({ ...filter, occurrenceHistory: { $elemMatch: { occurrenceKey: due.key, status: "completed" } } }).session(session) };
}
export function recurringAlarmState(item, recipient, now = sharedClock.now()) {
  const after = new Date(Math.max(+now, recipient?.eligibleFrom ? +new Date(recipient.eligibleFrom) - 1 : 0));
  const next = recipient?.accessStatus === "active" ? recurrence.nextOccurrence(item, after, plain(recipient).occurrenceHistory ?? [], plain(item).occurrenceHistory ?? []) : null;
  return { eligible: !!next, scheduleRevision: item.scheduleRevision,
    key: next ? `shared:${item.organizationId}:${item._id}:${recipient.userId}:${next.key}` : null,
    occurrenceKey: next?.key, startAt: next?.startAt, endAt: next?.endAt };
}
