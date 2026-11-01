import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 100, required() { return this.status === "active"; } },
    normalizedName: { type: String, trim: true },
    joinCode: { type: String, uppercase: true, trim: true, required() { return this.status === "active"; } },
    joinCodeVersion: { type: Number, default: 1 },
    joinCodeRegeneratedAt: Date,
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required() { return this.status === "active"; } },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required() { return this.status === "active"; } },
    // Old records have no verified creator; never infer ownership from a code.
    status: { type: String, enum: ["legacy_unclaimed", "active", "deleted"], default: "legacy_unclaimed" },
    revision: { type: Number, default: 0 },
    employeeSharingEnabled: { type: Boolean, default: false },
    ownershipTransferredAt: Date,
    ownershipTransferredByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    deletedAt: Date,
    // Retained legacy registration/contact metadata. New creation requires a name.
    // Required condition is handled in controller.
    organizationName: {
      type: String,
      trim: true,
      default: "",
    },

    // Organization contact metadata.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    mobileNumber: {
      type: String,
      trim: true,
      default: "",
    },

    address: {
      type: String,
      trim: true,
      default: "",
    },

    // Compatibility mirror only. New joins resolve joinCode and require approval.
    organizationCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    role: {
      type: String,
      default: "organization",
    },
  },
  {
    timestamps: true,
  }
);

organizationSchema.index({ joinCode: 1 }, { unique: true, partialFilterExpression: { joinCode: { $type: "string" } } });
organizationSchema.index({ ownerUserId: 1, status: 1 });

const Organization = mongoose.model("Organization", organizationSchema);

export default Organization;
