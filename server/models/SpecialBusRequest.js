const mongoose = require("mongoose");

const SpecialBusRequestSchema = new mongoose.Schema(
  {
    requestCode: {
      type: String,
      unique: true,
      index: true, // e.g. "SBR-101"
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requestedBy: {
      type: String,
      required: true,
    },
    eventName: {
      type: String,
      required: true,
    },
    tripDate: {
      type: String,
      required: true, // YYYY-MM-DD
    },
    departureTime: {
      type: String,
      default: "09:00",
    },
    returnTime: {
      type: String,
      default: "17:00",
    },
    pickupLocation: {
      type: String,
      default: "NEC Campus, Kovilpatti",
    },
    destination: {
      type: String,
      required: true,
    },
    passengerCount: {
      type: Number,
      required: true,
      min: 1,
    },
    reason: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED", "ASSIGNED", "COMPLETED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    assignedBus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",
      default: null,
    },
    assignedDriver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },
    adminNotes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("SpecialBusRequest", SpecialBusRequestSchema);
