const mongoose = require("mongoose");

const AttendanceSchema = new mongoose.Schema(
  {
    registration: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TransportRegistration",
      required: true,
      index: true,
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    personId: {
      type: String,
      required: true,
      index: true,
    },
    studentName: {
      type: String,
      required: true,
    },
    bus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",
      required: true,
      index: true,
    },
    stop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stop",
      default: null,
    },
    stopName: {
      type: String,
      default: "",
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
    },
    status: {
      type: String,
      enum: ["BOARDED", "DROPPED", "ABSENT"],
      required: true,
      index: true,
    },
    markedAt: {
      type: String,
      required: true, // HH:mm or ISO
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate attendance entry for same rider, same date, same direction
AttendanceSchema.index({ registration: 1, date: 1, direction: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", AttendanceSchema);
