const mongoose = require("mongoose");

const ParentProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    emergencyContact: {
      type: String,
      default: "",
    },
    students: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StudentProfile",
      },
    ],
    studentIds: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("ParentProfile", ParentProfileSchema);
