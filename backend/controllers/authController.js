import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/user.js";
import Organization from "../models/Organization.js";

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

// Register user
export const registerUser = async (req, res) => {
  try {
    const {
      fullName,
      email,
      mobileNumber,
      organizationCode,
      department,
      password,
    } = req.body;

    if (!fullName || !email || !mobileNumber || !password) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, mobile number and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists with this email.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const verifiedCode = typeof organizationCode === "string" ? organizationCode.trim().toUpperCase() : "";
    if (verifiedCode && !(await Organization.findOne({ organizationCode: verifiedCode }))) {
      return res.status(400).json({ success: false, message: "Organization code was not found." });
    }

    const user = await User.create({
      fullName: fullName.trim(),
      email: normalizedEmail,
      mobileNumber: mobileNumber.trim(),
      organizationCode: verifiedCode,
      department: department?.trim() || "",
      password: hashedPassword,
      role: "user",
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully.",
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        mobileNumber: user.mobileNumber,
        organizationCode: user.organizationCode,
        department: user.department,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while registering user.",
      error: error.message,
    });
  }
};

// Login user
export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password.",
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      token,
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        mobileNumber: user.mobileNumber,
        organizationCode: user.organizationCode,
        department: user.department,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while logging in.",
      error: error.message,
    });
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
