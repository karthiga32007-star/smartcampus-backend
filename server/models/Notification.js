const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    recipientTag: {
      type: String,
      default: "all",
      index: true, // e.g. "all", "role:ADMIN", "bus:NEC-01", "STU001", "parent:STU001"
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ["INFO", "SUCCESS", "WARNING", "ALERT", "EMERGENCY"],
      default: "INFO",
      index: true,
    },
    category: {
      type: String,
      enum: ["board", "drop", "reach", "delay", "sos", "info", "registration"],
      default: "info",
    },
    relatedEntity: {
      entityType: { type: String, default: null },
      entityId: { type: String, default: null },
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", NotificationSchema);
