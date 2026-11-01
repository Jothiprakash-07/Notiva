import mongoose from "mongoose";

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  name: { type: String, required: true, maxlength: 100 },
  normalizedName: { type: String, required: true, maxlength: 100 },
  description: { type: String, default: "", maxlength: 1000 },
  status: { type: String, enum: ["active", "archived"], default: "active", required: true },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  archivedAt: Date,
  archivedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { timestamps: true, collection: "teams" });
schema.index({ organizationId: 1, normalizedName: 1 }, {
  unique: true, partialFilterExpression: { status: "active" }, name: "unique_active_team_name",
});
schema.index({ organizationId: 1, status: 1, _id: 1 });
export default mongoose.model("Team", schema);
