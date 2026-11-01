import mongoose from "mongoose";
const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  requesterUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], required: true },
  requestedAt: { type: Date, required: true }, actedAt: Date,
  actedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  action: { type: String, enum: ["approved", "rejected", "cancelled"] },
  actionNote: { type: String, maxlength: 500 }, codeVersion: Number,
}, { timestamps: true, collection: "organization_join_requests" });
schema.index({ organizationId: 1, requesterUserId: 1 }, { unique: true, partialFilterExpression: { status: "pending" }, name: "one_pending_request" });
schema.index({ organizationId: 1, status: 1, requestedAt: -1 });
export default mongoose.model("OrganizationJoinRequest", schema);
