const mongoose = require("mongoose");
const crypto = require("crypto");

const TransportPassSchema = new mongoose.Schema(
  {
    passNumber: {
      type: String,
      required: true,
      unique: true,
      index: true, // e.g. "NEC-PASS-2026-STU001"
    },
    verificationToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
      default: () => crypto.randomBytes(16).toString("hex"),
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    registration: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportRegistration",
      required: true,
      unique: true,
      index: true,
    },
    personId: {
      type: String,
      required: true,
    },
    holderName: {
      type: String,
      required: true,
    },
    holderType: {
      type: String,
      default: "Student",
    },
    department: {
      type: String,
      default: "",
    },
    routeName: {
      type: String,
      required: true,
    },
    pickupStopName: {
      type: String,
      required: true,
    },
    dropStopName: {
      type: String,
      required: true,
    },
    busNumber: {
      type: String,
      required: true,
    },
    seatNumber: {
      type: String,
      required: true,
    },
    academicYear: {
      type: String,
      default: "2026-2027",
    },
    validFrom: {
      type: String,
      default: "2026-07-01",
    },
    validUntil: {
      type: String,
      default: "2027-05-31",
    },
    status: {
      type: String,
      enum: ["ACTIVE", "EXPIRED", "SUSPENDED"],
      default: "ACTIVE",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("TransportPass", TransportPassSchema);
