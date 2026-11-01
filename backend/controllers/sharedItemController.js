import mongoose from "mongoose";
import SharedItem from "../models/OrganizationItem.js";
import Target from "../models/OrganizationItemTarget.js";
import Recipient from "../models/OrganizationItemRecipient.js";
import User from "../models/user.js";
import { organizationEndpoint } from "./organizationController.js";
import { organizationAccess, requireOrganizationPermission } from "../services/organizationAuthorization.js";
import { fail } from "../services/organizationPermissions.js";
import { validId } from "../services/organizations.js";
import { isRecurringShared, sharedOccurrenceView, recurringRecipientSummary } from "../services/sharedRecurrence.js";
import { createSharedItem, mutateSharedItem, actOnSharedRecipient, findSharedItem, publicSharedItem,
  publicRecipient, canInspectSharedItem, sharedAlarmState } from "../services/sharedItems.js";

function paging(req) {
  const limit = Number(req.query?.limit ?? 50), offset = Number(req.query?.offset ?? 0), status = req.query?.status;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) fail(400, "INVALID_PAGE", "Use limit 1–100 and offset 0–100000.");
  if (status !== undefined && !["active", "completed", "cancelled"].includes(status)) fail(400, "INVALID_SHARED_STATUS", "Invalid shared-item status.");
  return { limit, offset, status };
}
const access = req => organizationAccess(validId(req.params.organizationId), req.user._id);
export const createShared = organizationEndpoint(async (req, res) => res.status(201).json(await createSharedItem(req.params.organizationId, req.user._id, req.body || {})));
export const sharedMutation = action => organizationEndpoint(async (req, res) => res.json(await mutateSharedItem(req.params.organizationId, req.user._id, req.params.itemId, action, req.body || {})));
export const recipientAction = action => organizationEndpoint(async (req, res) => res.json(await actOnSharedRecipient(req.params.organizationId, req.user._id, req.params.itemId, action, req.body || {})));

export const listShared = mode => organizationEndpoint(async (req, res) => {
  const { membership } = await access(req);
  const { limit, offset, status } = paging(req), organizationId = req.params.organizationId;
  if (mode === "management") requireOrganizationPermission(membership, "edit_shared_items");
  let items, recipients = [];
  if (mode === "inbox") {
    const rows = await Recipient.aggregate([
      { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), userId: req.user._id, accessStatus: "active" } },
      { $lookup: { from: SharedItem.collection.name, localField: "organizationItemId", foreignField: "_id", pipeline: [
        { $match: { organizationId: new mongoose.Types.ObjectId(organizationId), ...(status ? { status } : {}) } },
      ], as: "item" } }, { $unwind: "$item" },
      { $sort: { "item.updatedAt": -1, "item._id": -1 } }, { $skip: offset }, { $limit: limit },
    ]);
    items = rows.map(row => row.item); recipients = rows;
  } else {
    items = await SharedItem.find({ organizationId, ...(mode === "created" ? { createdByUserId: req.user._id } : {}), ...(status ? { status } : {}) })
      .sort({ updatedAt: -1, _id: -1 }).skip(offset).limit(limit);
  }
  const entries = [];
  for (let i = 0; i < items.length; i++) {
    const recurring = isRecurringShared(items[i]), view = recurring ? sharedOccurrenceView(items[i], recipients[i]) : {};
    entries.push({ item: publicSharedItem(items[i]), ...view, ...(mode === "inbox" ? {
      recipient: publicRecipient(recurring ? view.recipient : recipients[i]),
      effectiveStatus: recurring ? view.effectiveStatus : items[i].status === "active" ? recipients[i].status : items[i].status,
      alarm: await sharedAlarmState(items[i], recipients[i]),
    } : {}) });
  }
  res.json({ items: entries, limit, offset });
});

export async function sharedReadAccess(req) {
  const { organization, membership } = await access(req);
  const item = await findSharedItem(req.params.organizationId, req.params.itemId);
  const recipient = await Recipient.findOne({ organizationId: req.params.organizationId, organizationItemId: item._id, userId: req.user._id, accessStatus: "active" });
  const management = canInspectSharedItem(item, membership);
  if (!recipient && !management) fail(403, "SHARED_ITEM_ACCESS_DENIED", "Shared item access is not permitted.");
  return { organization, membership, item, recipient, management };
}
export const sharedDetail = organizationEndpoint(async (req, res) => {
  const { item, recipient, management } = await sharedReadAccess(req);
  const targets = await Target.find({ organizationId: item.organizationId, organizationItemId: item._id, active: { $ne: false } });
  // Recipients receive target counts, not other selected employees' IDs/profiles.
  const summary = targets.reduce((result, row) => { result[row.targetType] = (result[row.targetType] ?? 0) + 1; return result; }, {});
  let recipientSummary, recipientCount;
  if (management) {
    const counts = await Recipient.aggregate([
      { $match: { organizationId: item.organizationId, organizationItemId: item._id } },
      { $group: { _id: { status: "$status", accessStatus: "$accessStatus" }, count: { $sum: 1 } } },
    ]);
    recipientSummary = isRecurringShared(item) ? await recurringRecipientSummary(item) : counts.map(row => ({ ...row._id, count: row.count }));
    recipientCount = counts.filter(row => row._id.accessStatus === "active").reduce((sum, row) => sum + row.count, 0);
  }
  const view = isRecurringShared(item) ? sharedOccurrenceView(item, recipient) : null;
  res.json({ item: publicSharedItem(item), targets: management ? targets.map(row => ({ targetType: row.targetType, targetId: row.targetId })) : summary,
    ...(view ?? {}), recipient: publicRecipient(view ? view.recipient : recipient), ...(recipient && !view ? { effectiveStatus: item.status === "active" ? recipient.status : item.status } : {}),
    alarm: await sharedAlarmState(item, recipient), ...(management ? { recipientSummary, recipientCount } : {}) });
});
export const sharedRecipients = organizationEndpoint(async (req, res) => {
  const { item, management } = await sharedReadAccess(req);
  if (!management) fail(403, "SHARED_MANAGEMENT_REQUIRED", "Recipient summaries are restricted to creator, Owner and authorized Admin.");
  const { limit, offset } = paging(req);
  const rows = await Recipient.find({ organizationId: item.organizationId, organizationItemId: item._id }).sort({ _id: 1 }).skip(offset).limit(limit).lean();
  const users = await User.find({ _id: { $in: rows.map(row => row.userId) } }).select("fullName notivaId").lean();
  const byUser = new Map(users.map(row => [String(row._id), { fullName: row.fullName, notivaId: row.notivaId }]));
  res.json({ recipients: rows.map(row => {
    const view = isRecurringShared(item) ? sharedOccurrenceView(item, row) : null;
    return { ...publicRecipient(view ? view.recipient : row), profile: byUser.get(String(row.userId)) ?? null,
      effectiveStatus: view ? view.effectiveStatus : item.status === "active" ? row.status : item.status };
  }), limit, offset });
});
export const sharedHistory = organizationEndpoint(async (req, res) => {
  const { item, recipient, management } = await sharedReadAccess(req);
  res.json({ history: management ? item.occurrenceHistory ?? [] : recipient?.occurrenceHistory ?? [],
    ownHistory: recipient?.occurrenceHistory ?? [], limit: 366 });
});
