import mongoose from "mongoose";
export const occurrenceResultSchema = new mongoose.Schema({
  occurrenceKey: { type: String, required: true }, scheduledAt: { type: String, required: true },
  status: { type: String, enum: ["acknowledged", "completed"], required: true },
  acknowledgedAt: Date, completedAt: Date, completedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { _id: false });
export const occurrenceHistoryField = { type: [occurrenceResultSchema], default: [], validate: value => value.length <= 366 };
