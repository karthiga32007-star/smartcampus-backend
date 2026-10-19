const mongoose = require("mongoose");

const TransportRegistrationSchema = new mongoose.Schema(
  {
    regCode: {
      type: String,
      unique: true,
      index: true, // e.g. "REG-1001"
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    personId: {
      type: String,
      required: true,
      index: true, // Student ID or Faculty ID e.g. "STU001"
    },
    personName: {
      type: String,
      required: true,
    },
    applicantType: {
      type: String,
      enum: ["Student", "Faculty"],
      default: "Student",
    },
    department: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      required: true,
      index: true,
    },
    pickupStop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stop",
      required: true,
    },
    dropStop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stop",
      required: true,
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected", "Cancelled"],
      default: "Pending",
      index: true,
    },
    assignedBus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",
      default: null,
      index: true,
    },
    assignedSeat: {
      type: String,
      default: null, // e.g. "01A"
    },
    rejectionReason: {
      type: String,
      default: "",
    },
    changeRequest: {
      route: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Route",
      },
      pickupStop: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Stop",
      },
      dropStop: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Stop",
      },
      requestedAt: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("TransportRegistration", TransportRegistrationSchema);
