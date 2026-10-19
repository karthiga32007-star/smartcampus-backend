const mongoose = require("mongoose");

const MaintenanceSchema = new mongoose.Schema(
  {
    bus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",
      required: true,
      index: true,
    },
    busNumber: {
      type: String,
      required: true,
    },
    maintenanceType: {
      type: String,
      enum: ["Scheduled Service", "Breakdown", "Inspection", "Tire", "Electrical", "Bodywork", "Gearbox", "Insurance/Cert"],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Critical"],
      default: "Medium",
      index: true,
    },
    reportedDate: {
      type: String,
      default: () => new Date().toISOString().slice(0, 10),
    },
    scheduledDate: {
      type: String,
      default: "",
    },
    completedDate: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ["REPORTED", "SCHEDULED", "IN_PROGRESS", "COMPLETED"],
      default: "REPORTED",
      index: true,
    },
    costInfo: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Maintenance", MaintenanceSchema);
