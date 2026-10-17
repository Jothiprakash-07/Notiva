import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import Session from "../models/Session.js";
import User from "../models/user.js";
import { createAccessToken, tokenVersion } from "./accessToken.js";

export const SESSION_IDLE_MS = 30 * 24 * 60 * 60 * 1000;
export const digest = value => createHash("sha256").update(value).digest("hex");
export const secret = () => randomBytes(32).toString("hex");
export const validSecret = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function deviceMetadata(body) {
  if (typeof body?.deviceId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.deviceId)) return null;
  const clean = (value, fallback, limit) => typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, "").trim().slice(0, limit) || fallback : fallback;
  return { deviceId: body.deviceId.toLowerCase(), deviceName: clean(body.deviceName, "Notiva device", 80),
    platform: ["android", "ios", "web"].includes(body.platform) ? body.platform : "unknown", appVersion: clean(body.appVersion, "", 32) };
}
export const safeSession = row => ({ sessionId: row.sessionId, deviceName: row.deviceName,
  platform: row.platform, appVersion: row.appVersion, createdAt: row.createdAt, lastSeenAt: row.lastSeenAt,
  expiresAt: row.expiresAt, active: !row.revokedAt && +new Date(row.expiresAt) > Date.now() });
export async function prepareSessionIndexes() {
  await Session.collection.createIndex({ userId: 1 }, { unique: true, name: "one_session_slot_per_user" });
  await Session.collection.createIndex({ sessionId: 1 }, { unique: true, name: "unique_session_id" });
  await Session.collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expired_session_cleanup" });
}
export function freshSession(user, device) {
  const refreshToken = secret(), now = new Date();
  return { refreshToken, row: { userId: user._id, sessionId: randomUUID(), ...device,
    tokenVersion: tokenVersion(user), createdAt: now, lastSeenAt: now,
    expiresAt: new Date(+now + SESSION_IDLE_MS), revokedAt: null, revokeReason: "",
    refreshHash: digest(refreshToken), previousRefreshHash: "", previousRefreshUntil: null, challenges: [] } };
}
export const credentials = (user, row, refreshToken) => ({ token: createAccessToken(user, row.sessionId),
  sessionId: row.sessionId, refreshToken, accessExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString() });
export async function loginSession(user, device) {
  // Persist enforcement before issuing anything; old unbound JWTs can no longer bypass the slot.
  const currentUser = await User.findOneAndUpdate({ _id: user._id, password: user.password,
    tokenVersion: tokenVersion(user) === 0 ? { $in: [0, null] } : tokenVersion(user) }, { $set: { sessionEnforced: true } }, { returnDocument: "after" });
  if (!currentUser) return { stale: true };
  for (let attempt = 0; attempt < 3; attempt++) {
    const existing = await Session.findOne({ userId: user._id });
    if (existing && existing.tokenVersion > tokenVersion(user)) return { stale: true };
    const active = existing && !existing.revokedAt && +new Date(existing.expiresAt) > Date.now() && existing.tokenVersion === tokenVersion(user);
    if (active && existing.deviceId !== device.deviceId) {
      const transferToken = secret();
      const result = await Session.findOneAndUpdate({ userId: user._id, sessionId: existing.sessionId, revokedAt: null, expiresAt: { $gt: new Date() }, tokenVersion: tokenVersion(user) },
        { $push: { challenges: { $each: [{ hash: digest(transferToken), expiresAt: new Date(Date.now() + 5 * 60 * 1000), tokenVersion: tokenVersion(user), ...device }], $slice: -5 } } }, { returnDocument: "after" });
      if (result) return { conflict: true, transferToken, userId: String(user._id), activeSession: safeSession(existing) };
      continue;
    }
    const fresh = freshSession(user, device);
    if (!existing) {
      try { await Session.create(fresh.row); return credentials(user, fresh.row, fresh.refreshToken); }
      catch (error) { if (error.code === 11000) continue; throw error; }
    }
    const updated = await Session.findOneAndUpdate({ userId: user._id, sessionId: existing.sessionId }, { $set: fresh.row }, { returnDocument: "after" });
    if (updated) return credentials(user, updated, fresh.refreshToken);
  }
  return { stale: true };
}
export async function replaceSession(user, transferToken, deviceId) {
  const row = await Session.findOne({ userId: user._id });
  const challenge = row?.challenges.find(c => c.hash === digest(transferToken) && c.deviceId === deviceId && +new Date(c.expiresAt) > Date.now() && c.tokenVersion === tokenVersion(user));
  if (!challenge || row.revokedAt || +new Date(row.expiresAt) <= Date.now()) return null;
  const fresh = freshSession(user, deviceMetadata(challenge));
  const updated = await Session.findOneAndUpdate({ userId: user._id, sessionId: row.sessionId, revokedAt: null, expiresAt: { $gt: new Date() },
    challenges: { $elemMatch: { hash: digest(transferToken), deviceId, tokenVersion: tokenVersion(user), expiresAt: { $gt: new Date() } } } },
    { $set: fresh.row }, { returnDocument: "after" });
  return updated ? credentials(user, updated, fresh.refreshToken) : null;
}
export async function refreshSession(user, sessionId, refreshToken) {
  const now = new Date(), hash = digest(refreshToken);
  const next = createHmac("sha256", process.env.JWT_SECRET).update(`refresh:${sessionId}:${refreshToken}`).digest("hex");
  const row = await Session.findOneAndUpdate({ userId: user._id, sessionId, revokedAt: null,
    tokenVersion: tokenVersion(user), expiresAt: { $gt: now }, refreshHash: hash },
    { $set: { refreshHash: digest(next), previousRefreshHash: hash, previousRefreshUntil: new Date(+now + 60000),
      lastSeenAt: now, expiresAt: new Date(+now + SESSION_IDLE_MS) } }, { returnDocument: "after" });
  if (row) return credentials(user, row, next);
  // One-minute retry window tolerates a lost response without storing plaintext secrets.
  const retry = await Session.findOne({ userId: user._id, sessionId, revokedAt: null, tokenVersion: tokenVersion(user),
    expiresAt: { $gt: now }, previousRefreshHash: hash, previousRefreshUntil: { $gt: now }, refreshHash: digest(next) });
  return retry ? credentials(user, retry, next) : null;
}
export const revokeSessions = (userId, reason, version) => Session.updateOne({ userId, revokedAt: null, ...(version === undefined ? {} : { tokenVersion: { $lt: version } }) },
  { $set: { revokedAt: new Date(), revokeReason: reason, refreshHash: "", previousRefreshHash: "", challenges: [] } });
