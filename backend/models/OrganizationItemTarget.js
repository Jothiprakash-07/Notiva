import mongoose from "mongoose";
const schema = new mongoose.Schema({
  organizationItemId: { type: mongoose.Schema.Types.ObjectId, ref: "OrganizationItem", required: true },
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  targetType: { type: String, enum: ["organization", "team", "user"], required: true },
  targetId: { type: mongoose.Schema.Types.ObjectId, default: null },
  active: { type: Boolean, default: true },
  removedAt: Date, removedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true, collection: "organization_item_targets", strict: "throw" });
schema.index({ organizationItemId: 1, targetType: 1, targetId: 1 }, { unique: true });
schema.index({ organizationId: 1, targetType: 1, targetId: 1 });
export default mongoose.model("OrganizationItemTarget", schema);
