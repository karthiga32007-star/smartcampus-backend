const mongoose = require("mongoose");

const AnnouncementSchema = new mongoose.Schema(
  {
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
    priority: {
      type: String,
      enum: ["Normal", "Important", "Urgent"],
      default: "Normal",
    },
    targetAudience: {
      type: String,
      enum: ["All", "Students", "Faculty", "Parents", "Drivers"],
      default: "All",
      index: true,
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    authorName: {
      type: String,
      default: "Transport Office",
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Announcement", AnnouncementSchema);
