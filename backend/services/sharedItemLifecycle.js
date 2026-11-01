import SharedItem from "../models/OrganizationItem.js";
import Recipient from "../models/OrganizationItemRecipient.js";

export async function completeIndividualTask(item, session, actorUserId = null, incrementRevision = true) {
  if (item.recurrence?.repeat && item.recurrence.repeat !== "none") return;
  if (item.status !== "active" || item.type !== "task" || item.completionMode !== "individual") return;
  const filter = { organizationId: item.organizationId, organizationItemId: item._id, accessStatus: "active" };
  if (!await Recipient.exists(filter).session(session) || await Recipient.exists({ ...filter, status: { $ne: "completed" } }).session(session)) return;
  item.status = "completed"; item.completedAt = new Date(); if (incrementRevision) item.serverRevision += 1;
  item.completionReason = "all_active_recipients_completed";
  if (actorUserId) item.completedByUserId = actorUserId;
  await item.save({ session });
}

// Called under the existing organization transaction lock. Rejoining never
// reactivates a historical recipient; only a newly created snapshot grants access.
export async function revokeSharedRecipients(organizationId, actorUserId, session, userId = null) {
  const filter = { organizationId, accessStatus: "active", ...(userId ? { userId } : {}) };
  const itemIds = await Recipient.distinct("organizationItemId", filter).session(session);
  await Recipient.updateMany(filter, { $set: { accessStatus: "revoked", revokedAt: new Date(), revokedByUserId: actorUserId, removalReason: "organization_access" },
    $inc: { recipientRevision: 1 } }, { session });
  if (userId) {
    const items = await SharedItem.find({ _id: { $in: itemIds }, organizationId, status: "active", type: "task", completionMode: "individual" }).session(session);
    for (const item of items) await completeIndividualTask(item, session);
  } else {
    await SharedItem.updateMany({ organizationId, status: "active" }, { $set: { status: "cancelled", cancelledAt: new Date(), cancelledByUserId: actorUserId }, $inc: { serverRevision: 1 } }, { session });
    await Recipient.updateMany({ organizationId, status: { $in: ["pending", "acknowledged"] } }, {
      $set: { status: "cancelled", cancelledAt: new Date() }, $inc: { recipientRevision: 1 },
    }, { session });
  }
}
