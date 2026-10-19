const mongoose = require("mongoose");

const BusSchema = new mongoose.Schema(
  {
    busNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true, // e.g. "NEC-01"
    },
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true, // e.g. "TN 72 AX 1201"
    },
    capacity: {
      type: Number,
      required: true,
      default: 50,
      min: 10,
      max: 90,
    },
    busType: {
      type: String,
      enum: ["Standard", "Deluxe", "Mini"],
      default: "Standard",
    },
    status: {
      type: String,
      enum: ["Active", "In Maintenance", "Out of Service", "Breakdown", "Emergency"],
      default: "Active",
      index: true,
    },
    assignedRoute: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      default: null,
      index: true,
    },
    assignedDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
      index: true,
    },
    insuranceExpiry: {
      type: String,
      default: "2027-04-15",
    },
    pollutionCertificateExpiry: {
      type: String,
      default: "2027-02-10",
    },
    fitnessExpiry: {
      type: String,
      default: "2027-08-20",
    },
    lastServiceDate: {
      type: String,
      default: "2026-08-01",
    },
    nextServiceDate: {
      type: String,
      default: "2026-11-01",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Bus", BusSchema);
