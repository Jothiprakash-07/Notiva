import mongoose from "mongoose";

const organizationSchema = new mongoose.Schema(
  {
    // GST is optional.
    // User can register organization using GST only OR full details.
    gstNumber: {
      type: String,
      trim: true,
      default: "",
    },

    // Required condition is handled in controller.
    organizationName: {
      type: String,
      trim: true,
      default: "",
    },

    // Email is optional when GST is provided.
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    // Mobile number is optional when GST is provided.
    mobileNumber: {
      type: String,
      trim: true,
      default: "",
    },

    // Address is optional when GST is provided.
    address: {
      type: String,
      trim: true,
      default: "",
    },

    // Team members will join using this organization code.
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

const Organization = mongoose.model("Organization", organizationSchema);

export default Organization;