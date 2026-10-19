const mongoose = require("mongoose");

const FacultyProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    employeeId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    department: {
      type: String,
      default: "Engineering Faculty",
    },
    designation: {
      type: String,
      default: "Assistant Professor",
    },
    emergencyContact: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("FacultyProfile", FacultyProfileSchema);
