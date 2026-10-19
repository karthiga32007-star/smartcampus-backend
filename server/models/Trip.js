const mongoose = require("mongoose");

const TripSchema = new mongoose.Schema(
  {
    bus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",
      required: true,
      index: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
      index: true,
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true, // YYYY-MM-DD
      index: true,
    },
    direction: {
      type: String,
      enum: ["MORNING", "EVENING"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["SCHEDULED", "READY", "RUNNING", "DELAYED", "COMPLETED", "CANCELLED"],
      default: "SCHEDULED",
      index: true,
    },
    currentStopIndex: {
      type: Number,
      default: -1,
    },
    phase: {
      type: String,
      enum: ["ENROUTE", "AT_STOP"],
      default: "ENROUTE",
    },
    delayMinutes: {
      type: Number,
      default: 0,
    },
    startedAt: {
      type: String, // HH:mm
      default: null,
    },
    endedAt: {
      type: String, // HH:mm
      default: null,
    },
    stopTimestamps: {
      type: Map,
      of: String, // e.g. { "0": "06:47", "1": "07:12" }
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to guarantee one trip record per bus per date per direction
TripSchema.index({ bus: 1, date: 1, direction: 1 }, { unique: true });

module.exports = mongoose.model("Trip", TripSchema);
