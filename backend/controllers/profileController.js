import bcrypt from "bcryptjs";
import { Buffer } from "node:buffer";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Organization from "../models/Organization.js";

export const publicUser = user => ({
  id: String(user._id), fullName: user.fullName, email: user.email,
  mobileNumber: user.mobileNumber, department: user.department,
  organizationCode: user.organizationCode, role: user.role,
});
const publicOrganization = org => org ? ({
  organizationName: org.organizationName, organizationCode: org.organizationCode,
  email: org.email, mobileNumber: org.mobileNumber, address: org.address,
}) : null;

export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  let payload;
  try { payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] }); }
  catch { return res.status(401).json({ message: "Your session has expired. Please sign in again." }); }
  if (!payload || typeof payload === "string" || !/^[a-f0-9]{24}$/i.test(payload.userId)) {
    return res.status(401).json({ message: "Invalid session." });
  }
  try {
    req.user = await User.findById(payload.userId);
    if (!req.user) return res.status(401).json({ message: "Account no longer available." });
    next();
  } catch { res.status(503).json({ message: "Account service unavailable. Try again." }); }
}

export async function getProfile(req, res) {
  try {
    const org = req.user.organizationCode
      ? await Organization.findOne({ organizationCode: req.user.organizationCode }) : null;
    res.json({ user: publicUser(req.user), organization: publicOrganization(org) });
  } catch { res.status(503).json({ message: "Could not load profile." }); }
}

export async function updateProfile(req, res) {
  const fields = ["fullName", "email", "mobileNumber", "department"];
  if (Object.keys(req.body || {}).some(key => !fields.includes(key))) {
    return res.status(400).json({ message: "Only personal information can be edited here." });
  }
  const values = Object.fromEntries(fields.map(key => [key, typeof req.body?.[key] === "string" ? req.body[key].trim() : ""]));
  values.email = values.email.toLowerCase();
  const errors = {};
  if (!values.fullName || values.fullName.length > 100) errors.fullName = "Enter a name of 1–100 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 254) errors.email = "Enter a valid email address.";
  if (!/^\+?[\d ()-]{7,25}$/.test(values.mobileNumber) || values.mobileNumber.replace(/\D/g, "").length < 7) errors.mobileNumber = "Enter a valid mobile number (7–15 digits).";
  if (values.mobileNumber.replace(/\D/g, "").length > 15) errors.mobileNumber = "Use at most 15 digits.";
  if (values.department.length > 100) errors.department = "Use at most 100 characters.";
  if (Object.keys(errors).length) return res.status(400).json({ message: "Check your details.", errors });
  try {
    if (await User.findOne({ email: values.email, _id: { $ne: req.user._id } })) {
      return res.status(409).json({ message: "Email already in use.", errors: { email: "This email is already registered." } });
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: values }, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: "Account no longer available." });
    res.json({ user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "Email already in use.", errors: { email: "This email is already registered." } });
    res.status(503).json({ message: "Could not save profile. Try again." });
  }
}

export async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" || newPassword.length < 6 || Buffer.byteLength(newPassword) > 72) {
    return res.status(400).json({ message: "Check your password.", errors: { newPassword: "Use at least 6 characters and at most 72 bytes." } });
  }
  try {
    if (!(await bcrypt.compare(currentPassword, req.user.password))) {
      return res.status(400).json({ message: "Incorrect current password.", errors: { currentPassword: "Current password is incorrect." } });
    }
    const password = await bcrypt.hash(newPassword, 10);
    // Avoid overwriting a concurrent password change.
    const result = await User.updateOne({ _id: req.user._id, password: req.user.password }, { $set: { password } });
    if (!result.modifiedCount) return res.status(409).json({ message: "Password changed elsewhere. Try again." });
    // Existing JWT sessions remain valid under the existing seven-day token policy.
    res.json({ message: "Password updated." });
  } catch { res.status(503).json({ message: "Could not change password." }); }
}

export async function joinOrganization(req, res) {
  const code = typeof req.body?.organizationCode === "string" ? req.body.organizationCode.trim().toUpperCase() : "";
  if (!/^ORG-[A-Z0-9]{6}$/.test(code)) return res.status(400).json({ message: "Enter a valid organization code.", errors: { organizationCode: "Use the code provided by your organization." } });
  try {
    const org = await Organization.findOne({ organizationCode: code });
    if (!org) return res.status(404).json({ message: "Organization not found.", errors: { organizationCode: "No organization matches this code." } });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: { organizationCode: org.organizationCode } }, { new: true });
    if (!user) return res.status(404).json({ message: "Account no longer available." });
    res.json({ user: publicUser(user), organization: publicOrganization(org) });
  } catch { res.status(503).json({ message: "Could not join organization. Try again." }); }
}
