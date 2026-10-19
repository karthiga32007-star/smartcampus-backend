const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema(
  {
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorName: {
      type: String,
      required: true,
    },
    actorRole: {
      type: String,
      default: "TRANSPORT_ADMIN",
    },
    action: {
      type: String,
      required: true, // e.g. "APPROVED_REGISTRATION", "SUSPENDED_USER", "BUS_CREATED"
      index: true,
    },
    entityType: {
      type: String,
      default: "", // "Registration", "Bus", "User", "Route"
    },
    entityId: {
      type: String,
      default: "",
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ipAddress: {
      type: String,
      default: "",
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

AuditLogSchema.index({ timestamp: -1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
