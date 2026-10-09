import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { createAccessToken } from "../services/accessToken.js";
import User from "../models/user.js";
import Organization from "../models/Organization.js";
import { normalize, validNotivaId, notivaIdFormat, notivaIdTaken, validEmail, validPassword, validMobile } from "../services/identity.js";
import { findNotivaId, suggestNotivaId, isNotivaDuplicate } from "../services/notivaIdentity.js";
import { publicUser } from "./profileController.js";
import { reconcileLegacyEmail } from "../services/identityMigration.js";

const createOrganizationCode = () => {
  return `ORG-${randomBytes(3).toString("hex").toUpperCase()}`;
};

const getUniqueOrganizationCode = async () => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const organizationCode = createOrganizationCode();
    const existingOrganization = await Organization.findOne({
      organizationCode,
    });

    if (!existingOrganization) {
      return organizationCode;
    }
  }

  throw new Error("Unable to generate a unique organization code.");
};

// Register personal accounts with an independent login ID and recovery address.
export const registerUser = async (req, res) => {
  const body = req.body || {};
  const { fullName, mobileNumber, password, confirmPassword } = body;
  const recoveryEmail = normalize(body.recoveryEmail);
  const notivaId = typeof body.notivaId === "string" ? body.notivaId.trim() : "";
  if (!validNotivaId(notivaId)) return res.status(400).json({ message: notivaIdFormat });
  if (!validEmail(recoveryEmail)) return res.status(400).json({ message: "Enter a valid recovery email." });
  if (typeof fullName !== "string" || !fullName.trim() || fullName.trim().length > 100 || !validMobile(mobileNumber)) return res.status(400).json({ message: "Enter a valid name and mobile number." });
  if (!validPassword(password)) return res.status(400).json({ message: "Use at least 6 characters and at most 72 bytes for your password." });
  if (password !== confirmPassword) return res.status(400).json({ message: "Passwords do not match." });
  try {
    const organizationCode = typeof body.organizationCode === "string" ? body.organizationCode.trim().toUpperCase() : "";
    if (organizationCode && !(await Organization.findOne({ organizationCode }))) return res.status(400).json({ message: "Organization code was not found." });
    if (await findNotivaId(notivaId)) return res.status(409).json({ message: notivaIdTaken });
    const user = await User.create({ fullName: fullName.trim(), notivaId, recoveryEmail, recoveryEmailVerified: false,
      mobileNumber: mobileNumber.trim(), password: await bcrypt.hash(password, 10),
      organizationCode, department: typeof body.department === "string" ? body.department.trim() : "", role: "user" });
    return res.status(201).json({ success: true, message: "Account created.", token: createAccessToken(user), user: publicUser(user) });
  } catch (error) {
    if (isNotivaDuplicate(error)) return res.status(409).json({ message: notivaIdTaken });
    return res.status(503).json({ message: "Unable to create your account right now. Please try again." });
  }
};

export async function notivaIdSuggestion(req, res) {
  const name = typeof req.body?.fullName === "string" ? req.body.fullName.trim() : "";
  if (name.length > 100) return res.status(400).json({ message: "Use at most 100 characters for your name." });
  try { res.json({ suggestedNotivaId: await suggestNotivaId(name) }); }
  catch { res.status(503).json({ message: "Unable to generate a Notiva ID right now. Please try again." }); }
}

// Retain legacy email login; new accounts do not populate the legacy email field.
export const loginUser = async (req, res) => {
  const body = req.body || {};
  const identifier = normalize(body.identifier ?? body.notivaId ?? body.email);
  const invalid = () => res.status(401).json({ message: "Invalid Notiva ID or password." });
  if (!identifier || typeof body.password !== "string") return invalid();
  try {
    let user = await findNotivaId(identifier);
    if (!user && validEmail(identifier)) user = await User.findOne({ email: identifier });
    // Comparable bcrypt work for unknown identifiers; no account-existence errors.
    const hash = user?.password || "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
    if (!(await bcrypt.compare(body.password, hash)) || !user) return invalid();
    user = await reconcileLegacyEmail(user);
    if (!user) return invalid();
    const token = createAccessToken(user);
    return res.json({ success: true, message: "Login successful.", token, user: publicUser(user) });
  } catch {
    return res.status(503).json({ message: "Unable to log in right now. Please try again." });
  }
};
// Register organization
export const registerOrganization = async (req, res) => {
  try {
    const {
      gstNumber,
      organizationName,
      email,
      mobileNumber,
      address,
    } = req.body;

    const trimmedGstNumber = gstNumber?.trim() || "";
    const trimmedOrganizationName = organizationName?.trim() || "";
    const trimmedEmail = email?.trim() || "";
    const trimmedMobileNumber = mobileNumber?.trim() || "";
    const trimmedAddress = address?.trim() || "";

    if (!trimmedGstNumber) {
      if (
        !trimmedOrganizationName ||
        !trimmedEmail ||
        !trimmedMobileNumber ||
        !trimmedAddress
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Organization name, email, mobile number and address are required when GST is not provided.",
        });
      }
    }

    const organizationCode = await getUniqueOrganizationCode();

    const organization = await Organization.create({
      gstNumber: trimmedGstNumber,
      organizationName: trimmedOrganizationName,
      email: trimmedEmail.toLowerCase(),
      mobileNumber: trimmedMobileNumber,
      address: trimmedAddress,
      organizationCode,
      role: "organization",
    });

    return res.status(201).json({
      success: true,
      message: "Organization registered successfully.",
      organization: {
        id: organization._id,
        gstNumber: organization.gstNumber,
        organizationName: organization.organizationName,
        email: organization.email,
        mobileNumber: organization.mobileNumber,
        address: organization.address,
        organizationCode: organization.organizationCode,
        role: organization.role,
      },
    });
  } catch (error) {
    console.error("Organization register error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while registering organization.",
      error: error.message,
    });
  }
};
