import mongoose from "mongoose";
import { itemFields } from "../services/itemData.js";
import { occurrenceHistoryField } from "./sharedOccurrenceFields.js";
const schedule = new mongoose.Schema({
  startAt: { type: String, required: true, validate: itemFields.startAt },
  endAt: { type: String, validate: itemFields.endAt }, allDay: { type: Boolean, default: false },
  alertBefore: { type: mongoose.Schema.Types.Mixed, validate: itemFields.alertBefore },
}, { _id: false, strict: "throw" });
const schema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, immutable: true },
  type: { type: String, enum: ["reminder", "task", "event"], required: true, immutable: true },
  title: { type: String, required: true, maxlength: 200 }, description: { type: String, default: "", maxlength: 10000 },
  createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  status: { type: String, enum: ["active", "cancelled", "completed"], default: "active", required: true },
  completionMode: { type: String, enum: ["individual", "collective"], required: true },
  collectiveRule: { type: String, enum: ["any", "all", "quorum"] }, collectiveThreshold: Number,
  // Server-derived from immutable target rows; never accepted from API input.
  employeeOnlyTargets: { type: Boolean, default: false },
  schedule: { type: schedule, required: true },
  recurrence: {
    repeat: { type: String, enum: ["none", "daily", "weekly", "weekdays", "monthly", "yearly"], default: "none" },
    timeZone: String, weeklyDays: [Number], effectiveFrom: String,
  },
  occurrenceHistory: occurrenceHistoryField,
  serverRevision: { type: Number, default: 1, min: 1 }, scheduleRevision: { type: Number, default: 1, min: 1 },
  cancelledAt: Date, cancelledByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  completedAt: Date, completedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  completionReason: String,
  clientRequestId: String, creationHash: String,
}, { timestamps: true, collection: "organization_items", strict: "throw" });
schema.index({ organizationId: 1, status: 1, updatedAt: -1, _id: -1 });
schema.index({ organizationId: 1, createdByUserId: 1, updatedAt: -1, _id: -1 });
schema.index({ organizationId: 1, createdByUserId: 1, clientRequestId: 1 }, {
  unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } },
});
export default mongoose.model("OrganizationItem", schema);
