const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    googleId: {
      type: String,
      sparse: true,
      index: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    avatar: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ["STUDENT", "FACULTY", "PARENT", "DRIVER", "TRANSPORT_STAFF", "TRANSPORT_ADMIN"],
      default: "STUDENT",
      index: true,
    },
    status: {
      type: String,
      enum: ["Active", "Pending", "Suspended", "ACTIVE", "PENDING", "SUSPENDED"],
      default: "Active",
      index: true,
    },
    passwordHash: {
      type: String,
      default: null,
    },
    phone: {
      type: String,
      default: "",
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Virtual for clean JSON serialization
UserSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

module.exports = mongoose.model("User", UserSchema);
