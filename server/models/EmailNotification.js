const mongoose = require("mongoose");

const EmailNotificationSchema = new mongoose.Schema(
  {
    toEmail: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    recipientName: {
      type: String,
      default: "Valued Member",
    },
    templateId: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    templateParams: {
      type: Map,
      of: String,
      default: {},
    },
    status: {
      type: String,
      enum: ["SENT", "FAILED", "QUEUED"],
      default: "QUEUED",
      index: true,
    },
    errorDetails: {
      type: String,
      default: null,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("EmailNotification", EmailNotificationSchema);
