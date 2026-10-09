import mongoose from "mongoose";

// Deliberately omit titles and all item content.
const schema = new mongoose.Schema({
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, required: true },
  clientItemId: { type: String, required: true },
  type: { type: String, required: true },
  deletedAt: { type: Date, required: true },
  hardDeletedAt: { type: Date, required: true },
  reason: { type: String, enum: ["user_deleted"], required: true },
}, { collection: "deleted_items", autoIndex: false, strict: "throw", versionKey: false });
schema.index({ ownerUserId: 1, clientItemId: 1, deletedAt: 1 },
  { unique: true, name: "deleted_items_deletion_unique" });
schema.index({ ownerUserId: 1, deletedAt: 1 }, { name: "deleted_items_owner_deleted" });
export default mongoose.model("DeletedItem", schema);
