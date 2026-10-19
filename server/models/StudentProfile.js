const mongoose = require("mongoose");

const StudentProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    department: {
      type: String,
      default: "Computer Science & Engineering",
    },
    year: {
      type: String,
      default: "3rd Year",
    },
    section: {
      type: String,
      default: "A",
    },
    emergencyContact: {
      type: String,
      default: "",
    },
    parentUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("StudentProfile", StudentProfileSchema);
