import mongoose from "mongoose";
import { itemFields, validClientItemId } from "../services/itemData.js";

const fields = Object.fromEntries(Object.entries(itemFields).map(([key, check]) => [key, {
  type: mongoose.Schema.Types.Mixed,
  validate: { validator: value => value === undefined || check(value), message: `Invalid ${key}.` },
  required: ["type", "title", "description", "repeat", "startAt", "notificationIds", "createdAt", "updatedAt"].includes(key),
}]));
// Empty description is a valid frontend value; Mixed required accepts it.
const schema = new mongoose.Schema({
  ...fields,
  ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, immutable: true },
  clientItemId: { type: String, required: true, immutable: true, validate: validClientItemId },
  revision: { type: Number, default: 1, required: true, validate: value => Number.isSafeInteger(value) && value >= 1 },
  deletedAt: { type: Date, default: null },
}, { collection: "items", autoIndex: false, strict: "throw", versionKey: false,
  timestamps: { createdAt: "serverCreatedAt", updatedAt: "serverUpdatedAt" } });
schema.index({ ownerUserId: 1, clientItemId: 1 }, { unique: true, name: "items_owner_client_unique" });
schema.index({ ownerUserId: 1, updatedAt: 1 }, { name: "items_owner_updated" });
schema.index({ ownerUserId: 1, serverUpdatedAt: 1 }, { name: "items_owner_server_updated" });
schema.index({ deletedAt: 1 }, { name: "items_deleted_at" });
schema.index({ ownerUserId: 1, deletedAt: 1 }, { name: "items_owner_deleted" });
export default mongoose.model("Item", schema);
