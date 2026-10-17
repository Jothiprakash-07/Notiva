import mongoose from "mongoose";
import { validNotivaId, NOTIVA_ID_COLLATION } from "../services/identity.js";

const otpSchema = new mongoose.Schema({
  hash: String, email: String, expiresAt: Date, sentAt: Date,
  attempts: { type: Number, default: 0 },
}, { _id: false });

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },

    mobileNumber: {
      type: String,
      required: true,
      trim: true,
    },

    notivaId: { type: String, trim: true, validate: validNotivaId },
    recoveryEmail: { type: String, lowercase: true, trim: true },
    recoveryEmailVerified: { type: Boolean, default: false },
    recoveryEmailVerifiedAt: Date,
    recoveryEmailOtp: otpSchema,
    passwordResetOtp: otpSchema,
    resetAuthorizationHash: String,
    resetAuthorizationExpiresAt: Date,
    resetAuthorizationPasswordHash: String,
    resetAuthorizationEmail: String,

    organizationCode: {
      type: String,
      default: "",
      trim: true,
    },

    department: {
      type: String,
      default: "",
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },
    sessionEnforced: { type: Boolean, default: false },
    tokenVersion: { type: Number, default: 0, min: 0 },

    role: {
      type: String,
      default: "user",
    },
  },
  {
    timestamps: true,
    autoIndex: false,
  }
);

userSchema.index({ notivaId: 1 }, { unique: true, sparse: true, name: "notivaId_case_insensitive", collation: NOTIVA_ID_COLLATION });

const User = mongoose.model("User", userSchema);

export default User;
