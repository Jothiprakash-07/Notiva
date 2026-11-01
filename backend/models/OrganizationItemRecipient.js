import mongoose from "mongoose";
import { occurrenceHistoryField } from "./sharedOccurrenceFields.js";
const schema = new mongoose.Schema({
  organizationItemId: { type: mongoose.Schema.Types.ObjectId, ref: "OrganizationItem", required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "acknowledged", "completed", "cancelled"], default: "pending", required: true },
  accessStatus: { type: String, enum: ["active", "revoked"], default: "active", required: true },
  sourceTargetIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "OrganizationItemTarget" }],
  deliveredAt: Date, acknowledgedAt: Date, completedAt: Date, cancelledAt: Date,
  occurrenceHistory: occurrenceHistoryField,
  revokedAt: Date, revokedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  removalReason: { type: String, enum: ["target_change", "organization_access"] },
  eligibleFrom: Date,
  excludedOccurrenceKey: String,
  lastSeenRevision: { type: Number, default: 0 }, recipientRevision: { type: Number, default: 1 },
}, { timestamps: true, collection: "organization_item_recipients", strict: "throw" });
schema.index({ organizationItemId: 1, userId: 1 }, { unique: true });
schema.index({ organizationId: 1, userId: 1, accessStatus: 1, updatedAt: -1 });
schema.index({ organizationId: 1, organizationItemId: 1, accessStatus: 1, status: 1 });
export default mongoose.model("OrganizationItemRecipient", schema);
