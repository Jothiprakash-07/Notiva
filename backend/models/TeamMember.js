import mongoose from "mongoose";

const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["active", "removed"], required: true },
  assignedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assignedAt: { type: Date, required: true },
  removedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  removedAt: Date,
}, { timestamps: true, collection: "team_members" });
schema.index({ teamId: 1, userId: 1 }, { unique: true });
schema.index({ organizationId: 1, userId: 1, status: 1, teamId: 1 });
schema.index({ organizationId: 1, teamId: 1, status: 1, _id: 1 });
export default mongoose.model("TeamMember", schema);
