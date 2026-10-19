const mongoose = require("mongoose");

const BusLocationSchema = new mongoose.Schema(
  {
    bus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",
      required: true,
      index: true,
    },
    trip: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Trip",
      default: null,
      index: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Driver",
      default: null,
    },
    latitude: {
      type: Number,
      required: true,
    },
    longitude: {
      type: Number,
      required: true,
    },
    speed: {
      type: Number,
      default: null,
    },
    heading: {
      type: Number,
      default: null,
    },
    accuracy: {
      type: Number,
      default: null, // meters
    },
    recordedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index to automatically purge historical raw GPS breadcrumbs after 30 days
BusLocationSchema.index({ recordedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
BusLocationSchema.index({ bus: 1, recordedAt: -1 });

module.exports = mongoose.model("BusLocation", BusLocationSchema);
