import { createHash, createHmac, randomInt, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import User from "../models/user.js";
import { publicUser } from "./profileController.js";
import { normalize, validNotivaId, validPassword, validEmail, maskEmail, notivaIdTaken, notivaIdFormat } from "../services/identity.js";
import { reconcileLegacyEmail } from "../services/identityMigration.js";
import { findNotivaId } from "../services/notivaIdentity.js";
import { mailer } from "../services/mailer.js";

export const recoveryMessage = "If the account is eligible for recovery, a verification code has been sent.";
const invalidOtp = "The verification code is invalid or has expired.";
const ttl = 10 * 60 * 1000;
const cooldown = 60 * 1000;
const resetFields = { passwordResetOtp: 1, resetAuthorizationHash: 1, resetAuthorizationExpiresAt: 1, resetAuthorizationPasswordHash: 1, resetAuthorizationEmail: 1 };
const digestToken = token => createHash("sha256").update(token).digest("hex");
const digestOtp = (user, purpose, otp) => createHmac("sha256", process.env.JWT_SECRET)
  .update(`${user._id}:${purpose}:${user.recoveryEmail}:${purpose === "passwordResetOtp" ? user.password : ""}:${otp}`).digest("hex");

// Bounded per-process IP protection supplements persisted per-account limits.
const buckets = new Map();
export function recoveryRateLimit(req, res, next) {
  const now = Date.now();
  const key = `${req.ip || req.socket?.remoteAddress || "unknown"}:${req.path}`;
  for (const [entry, value] of buckets) if (value.until <= now) buckets.delete(entry);
  if (buckets.size >= 10000 && !buckets.has(key)) return res.status(429).json({ message: "Please wait before trying again." });
  const value = buckets.get(key) || { count: 0, until: now + 60000 };
  value.count++; buckets.set(key, value);
  if (value.count > 10) return res.status(429).json({ message: "Please wait before trying again." });
  next();
}

async function issueOtp(user, purpose) {
  let otp;
  do { otp = String(randomInt(0, 1000000)).padStart(6, "0"); }
  while (digestOtp(user, purpose, otp) === user[purpose]?.hash);
  const state = { hash: digestOtp(user, purpose, otp), email: user.recoveryEmail,
    expiresAt: new Date(Date.now() + ttl), sentAt: new Date(), attempts: 0 };
  const query = { _id: user._id, recoveryEmail: user.recoveryEmail,
    $or: [{ [`${purpose}.sentAt`]: { $exists: false } }, { [`${purpose}.sentAt`]: { $lte: new Date(Date.now() - cooldown) } }] };
  if (purpose === "passwordResetOtp") query.password = user.password;
  const update = { $set: { [purpose]: state } };
  if (purpose === "passwordResetOtp") update.$unset = { resetAuthorizationHash: 1, resetAuthorizationExpiresAt: 1, resetAuthorizationPasswordHash: 1, resetAuthorizationEmail: 1 };
  const saved = await User.findOneAndUpdate(query, update, { returnDocument: "after" });
  if (!saved) return null;
  const reset = purpose === "passwordResetOtp";
  const send = () => mailer.send({ to: user.recoveryEmail,
    subject: reset ? "Your Notiva password reset code" : "Verify your Notiva recovery email",
    text: `Notiva\n\nYour verification code is ${otp}. It expires in 10 minutes.\n\n${reset ? "If you did not request this password reset, you can ignore this email." : "If you did not request this verification, you can ignore this email."}`,
  }).catch(async () => {
    // Keep resend cooldown, but invalidate the undelivered code only if still current.
    await User.updateOne({ _id: user._id, [`${purpose}.hash`]: state.hash }, { $unset: { [`${purpose}.hash`]: 1 } }).catch(() => {});
    throw new Error("Mail unavailable");
  });
  return send;
}

async function consumeOtp(user, purpose, otp, set, unset) {
  if (!user || typeof otp !== "string" || !/^\d{6}$/.test(otp)) return null;
  const state = user[purpose];
  if (!state?.hash || !state.expiresAt || state.expiresAt <= new Date() || state.attempts >= 5 || state.email !== user.recoveryEmail) return null;
  const query = { _id: user._id, recoveryEmail: user.recoveryEmail,
    [`${purpose}.hash`]: state.hash, [`${purpose}.expiresAt`]: { $gt: new Date() }, [`${purpose}.attempts`]: { $lt: 5 } };
  if (purpose === "passwordResetOtp") query.password = user.password;
  const attempt = await User.updateOne(query, { $inc: { [`${purpose}.attempts`]: 1 } });
  if (!attempt.modifiedCount) return null;
  const expected = Buffer.from(digestOtp(user, purpose, otp), "hex");
  const actual = Buffer.from(state.hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  // Atomic consume prevents concurrent verification/replay and races with resend.
  query[`${purpose}.attempts`] = { $lte: 5 };
  return User.findOneAndUpdate(query, { $set: set, $unset: { [purpose]: 1, ...unset } }, { returnDocument: "after" });
}

export async function setNotivaId(req, res) {
  const display = typeof req.body?.notivaId === "string" ? req.body.notivaId.trim() : "";
  if (!validNotivaId(display)) return res.status(400).json({ message: notivaIdFormat });
  try {
    if (await findNotivaId(display, req.user._id)) return res.status(409).json({ message: notivaIdTaken });
    const user = await User.findOneAndUpdate({ _id: req.user._id },
      { $set: { notivaId: display } }, { returnDocument: "after", runValidators: true });
    if (!user) return res.status(404).json({ message: "Account no longer available." });
    res.json({ user: publicUser(user) });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 503).json({ message: error.code === 11000 ? notivaIdTaken : "Unable to update your account. Please try again." });
  }
}

export async function notivaIdAvailability(req, res) {
  const value = typeof req.query?.value === "string" ? req.query.value.trim() : "";
  if (!validNotivaId(value)) return res.status(400).json({ message: notivaIdFormat });
  try { res.json({ available: !(await findNotivaId(value, req.user?._id)) }); }
  catch { res.status(503).json({ message: "Unable to check availability. Please try again." }); }
}

export async function sendRecoveryEmailOtp(req, res) {
  try {
    const user = await reconcileLegacyEmail(req.user);
    if (!user || !validEmail(user.recoveryEmail)) return res.status(400).json({ message: "Add a valid recovery email first." });
    if (user.recoveryEmailVerified) return res.json({ message: "Your recovery email is already verified.", user: publicUser(user) });
    const send = await issueOtp(user, "recoveryEmailOtp");
    if (!send) return res.status(429).json({ message: "Please wait 60 seconds before requesting another code." });
    await send();
    res.json({ message: "Verification code sent.", maskedEmail: maskEmail(user.recoveryEmail), retryAfter: 60 });
  } catch { res.status(503).json({ message: "Unable to send a verification code right now. Please try again." }); }
}

export async function verifyRecoveryEmail(req, res) {
  try {
    const user = await consumeOtp(req.user, "recoveryEmailOtp", req.body?.otp,
      { recoveryEmailVerified: true, recoveryEmailVerifiedAt: new Date() });
    if (!user) return res.status(400).json({ message: invalidOtp });
    res.json({ message: "Recovery email verified.", user: publicUser(user) });
  } catch { res.status(503).json({ message: "Unable to verify the code right now. Please try again." }); }
}

export async function forgotPassword(req, res) {
  try {
    const notivaId = normalize(req.body?.notivaId ?? req.body?.identifier);
    if (validNotivaId(notivaId)) {
      const found = await findNotivaId(notivaId);
      const user = found ? await reconcileLegacyEmail(found) : null;
      if (user && validEmail(user.recoveryEmail)) {
        const send = await issueOtp(user, "passwordResetOtp");
        // SMTP latency/failures must not distinguish eligible accounts in public responses.
        if (send) void send().catch(() => {});
      }
    }
  } catch { /* Public initiation deliberately has the same response on failure. */ }
  res.json({ success: true, message: recoveryMessage, retryAfter: 60 });
}

export async function verifyResetOtp(req, res) {
  try {
    const notivaId = normalize(req.body?.notivaId ?? req.body?.identifier);
    const user = validNotivaId(notivaId) ? await findNotivaId(notivaId) : null;
    const resetToken = randomBytes(32).toString("hex");
    const saved = await consumeOtp(user, "passwordResetOtp", req.body?.otp, {
      resetAuthorizationHash: digestToken(resetToken), resetAuthorizationExpiresAt: new Date(Date.now() + ttl),
      resetAuthorizationPasswordHash: user?.password, resetAuthorizationEmail: user?.recoveryEmail,
    });
    if (!saved) return res.status(400).json({ message: invalidOtp });
    res.json({ resetToken });
  } catch { res.status(503).json({ message: "Unable to verify the code right now. Please try again." }); }
}

export async function resetPassword(req, res) {
  const { resetToken, newPassword, confirmPassword } = req.body || {};
  if (!validPassword(newPassword) || newPassword !== confirmPassword) return res.status(400).json({ message: "Use matching passwords of at least 6 characters and at most 72 bytes." });
  if (typeof resetToken !== "string" || !/^[a-f0-9]{64}$/.test(resetToken)) return res.status(400).json({ message: "The password reset authorization is invalid or has expired." });
  try {
    const user = await User.findOneAndUpdate({ resetAuthorizationHash: digestToken(resetToken),
      resetAuthorizationExpiresAt: { $gt: new Date() },
      $expr: { $and: [{ $eq: ["$password", "$resetAuthorizationPasswordHash"] }, { $eq: ["$recoveryEmail", "$resetAuthorizationEmail"] }] },
    }, { $set: { password: await bcrypt.hash(newPassword, 10) }, $inc: { tokenVersion: 1 }, $unset: resetFields }, { returnDocument: "after" });
    if (!user) return res.status(400).json({ message: "The password reset authorization is invalid or has expired." });
    res.json({ success: true, message: "Password reset successful." });
  } catch { res.status(503).json({ message: "Unable to reset your password right now. Please try again." }); }
}
