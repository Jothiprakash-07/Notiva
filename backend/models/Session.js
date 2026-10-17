import mongoose from "mongoose";

// One atomic slot per account: replacing the UUID invalidates all earlier JWTs.
const sessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  sessionId: { type: String, required: true },
  deviceId: String, deviceName: String, platform: String, appVersion: String,
  tokenVersion: Number, createdAt: Date, lastSeenAt: Date, expiresAt: Date,
  revokedAt: Date, revokeReason: String,
  refreshHash: String, previousRefreshHash: String, previousRefreshUntil: Date,
  challenges: [{ _id: false, hash: String, expiresAt: Date, tokenVersion: Number,
    deviceId: String, deviceName: String, platform: String, appVersion: String }],
}, { autoIndex: false });
export default mongoose.model("Session", sessionSchema);
