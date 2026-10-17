import User from "../models/user.js";
import Session from "../models/Session.js";
import { publicUser } from "./profileController.js";
import { digest, validSecret, replaceSession, refreshSession, safeSession } from "../services/sessions.js";

const denied = res => res.status(401).json({ code: "SESSION_REVOKED", message: "Your session ended. Please sign in again." });
const validUserId = value => typeof value === "string" && /^[a-f0-9]{24}$/i.test(value);
export async function transfer(req, res) {
  const { userId, transferToken, deviceId } = req.body || {};
  if (!validUserId(userId) || !validSecret(transferToken) || typeof deviceId !== "string") return denied(res);
  try {
    const user = await User.findById(userId);
    const result = user && await replaceSession(user, transferToken, deviceId);
    if (!result) return denied(res);
    res.json({ ...result, user: publicUser(user) });
  } catch { res.status(503).json({ message: "Unable to transfer session. Try again." }); }
}
export async function refresh(req, res) {
  const { userId, sessionId, refreshToken } = req.body || {};
  if (!validUserId(userId) || !validSecret(refreshToken) || typeof sessionId !== "string" || sessionId.length > 64) return denied(res);
  try {
    const user = await User.findById(userId);
    const result = user && await refreshSession(user, sessionId, refreshToken);
    if (!result) return denied(res);
    res.json({ ...result, user: publicUser(user) });
  } catch { res.status(503).json({ message: "Unable to renew session. Try again." }); }
}
export async function listSessions(req, res) {
  res.json({ sessions: req.authSession ? [{ ...safeSession(req.authSession), current: true }] : [] });
}
export async function logout(req, res) {
  try {
    const sessionId = req.params?.sessionId || req.authSession?.sessionId;
    if (!sessionId || sessionId !== req.authSession?.sessionId) return res.status(404).json({ message: "Session not found." });
    await Session.updateOne({ userId: req.user._id, sessionId, revokedAt: null }, { $set: {
      revokedAt: new Date(), revokeReason: "logout", refreshHash: "", previousRefreshHash: "", challenges: [] } });
    res.json({ success: true });
  } catch { res.status(503).json({ message: "Unable to sign out on the server." }); }
}

export async function logoutWithRefresh(req, res, next) {
  const { userId, sessionId, refreshToken } = req.body || {};
  if (!validUserId(userId) || !validSecret(refreshToken) || typeof sessionId !== "string") return next();
  try {
    const result = await Session.updateOne({ userId, sessionId, revokedAt: null,
      $or: [{ refreshHash: digest(refreshToken) }, { previousRefreshHash: digest(refreshToken), previousRefreshUntil: { $gt: new Date() } }] },
      { $set: { revokedAt: new Date(), revokeReason: "logout", refreshHash: "", previousRefreshHash: "", challenges: [] } });
    if (!result.modifiedCount) return next();
    res.json({ success: true });
  } catch { res.status(503).json({ message: "Unable to sign out on the server." }); }
}
