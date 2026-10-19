const mongoose = require("mongoose");

const RouteStopSubSchema = new mongoose.Schema(
  {
    stop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stop",
      required: true,
    },
    stopOrder: {
      type: Number,
      required: true,
    },
    morningTime: {
      type: String,
      required: true, // e.g. "06:45"
    },
    eveningTime: {
      type: String,
      required: true, // e.g. "18:10"
    },
  },
  { _id: false }
);

const RouteSchema = new mongoose.Schema(
  {
    code: {
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
    via: {
      type: String,
      required: true,
      trim: true,
    },
    fee: {
      type: Number,
      required: true,
      default: 12000,
    },
    arrivalAtCollege: {
      type: String,
      required: true,
      default: "08:30",
    },
    departureFromCollege: {
      type: String,
      required: true,
      default: "16:30",
    },
    stops: [RouteStopSubSchema],
    distanceKm: {
      type: Number,
      default: 35,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Route", RouteSchema);
