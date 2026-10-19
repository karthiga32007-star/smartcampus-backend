const mongoose = require("mongoose");

const ComplaintSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      index: true, // e.g. "CMP-1001"
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    userName: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      enum: ["Bus", "Driver", "Route", "Timing", "Safety", "Cleanliness", "Delay", "Seat Availability", "Other"],
      required: true,
      index: true,
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      default: null,
    },
    routeName: {
      type: String,
      default: "",
    },
    description: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    status: {
      type: String,
      enum: ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED"],
      default: "OPEN",
      index: true,
    },
    adminResponse: {
      type: String,
      default: "",
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Complaint", ComplaintSchema);
