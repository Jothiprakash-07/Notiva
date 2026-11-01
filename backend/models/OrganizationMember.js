import mongoose from "mongoose";
import { ORGANIZATION_PERMISSIONS } from "../services/organizationPermissions.js";
const id = { type: mongoose.Schema.Types.ObjectId, ref: "User" };
const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  userId: { ...id, required: true },
  role: { type: String, enum: ["owner", "admin", "member"], required: true },
  permissions: [{ type: String, enum: ORGANIZATION_PERMISSIONS }],
  status: { type: String, enum: ["active", "left", "removed"], required: true },
  joinedAt: { type: Date, required: true }, leftAt: Date, removedAt: Date,
  removedByUserId: id, roleChangedAt: Date, roleChangedByUserId: id,
}, { timestamps: true, collection: "organization_members" });
schema.index({ organizationId: 1, userId: 1 }, { unique: true });
schema.index({ organizationId: 1 }, { unique: true, partialFilterExpression: { role: "owner", status: "active" }, name: "one_active_owner" });
schema.index({ userId: 1, status: 1 });
export default mongoose.model("OrganizationMember", schema);
