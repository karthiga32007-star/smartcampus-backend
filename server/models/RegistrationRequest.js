const mongoose = require("mongoose");

const RegistrationRequestSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      sparse: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    profileImage: {
      type: String,
      default: null,
    },
    requestedRole: {
      type: String,
      enum: ["STUDENT", "FACULTY", "PARENT"],
      required: [true, "Requested role is required"],
      default: "STUDENT",
      index: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
    // Student specific fields
    registerNumber: {
      type: String,
      trim: true,
      default: "",
    },
    department: {
      type: String,
      trim: true,
      default: "",
    },
    year: {
      type: String,
      trim: true,
      default: "",
    },
    section: {
      type: String,
      trim: true,
      default: "",
    },
    // Faculty specific fields
    employeeId: {
      type: String,
      trim: true,
      default: "",
    },
    designation: {
      type: String,
      trim: true,
      default: "",
    },
    // Parent specific fields
    studentIds: [
      {
        type: String,
        trim: true,
      },
    ],
    // Shared
    emergencyContact: {
      type: String,
      trim: true,
      default: "",
    },
    address: {
      type: String,
      trim: true,
      default: "",
    },
    notes: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("RegistrationRequest", RegistrationRequestSchema);
