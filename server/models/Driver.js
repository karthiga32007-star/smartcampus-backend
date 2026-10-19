const mongoose = require("mongoose");

const DriverSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      sparse: true,
      index: true,
    },
    driverCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    licenseNumber: {
      type: String,
      required: true,
      trim: true,
    },
    licenseExpiry: {
      type: String,
      required: true,
    },
    experienceYears: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["Active", "Inactive", "On Leave"],
      default: "Active",
      index: true,
    },
    assignedBus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Driver", DriverSchema);
