const express = require("express");
const router = express.Router();
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { authenticateUser, requireAdmin } = require("../middleware/auth");

/**
 * List all users with filtering by role and status (Admin only)
 */
router.get("/", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { role, status, search } = req.query;
    const query = {};

    if (role && role !== "All") query.role = role;
    if (status && status !== "All") query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const users = await User.find(query).sort({ createdAt: -1 });

    res.json({
      success: true,
      users: users.map((u) => u.toSafeObject()),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Suspend or activate a user account (Admin only)
 */
router.put("/:id/status", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!["Active", "Suspended"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'Active' or 'Suspended'.",
        code: "INVALID_STATUS",
      });
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    targetUser.status = status;
    await targetUser.save();

    await AuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: status === "Suspended" ? "USER_SUSPENDED" : "USER_ACTIVATED",
      entityType: "User",
      entityId: targetUser._id.toString(),
      metadata: { targetEmail: targetUser.email, newStatus: status },
    });

    res.json({
      success: true,
      message: `User status changed to ${status}.`,
      user: targetUser.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update user profile details
 */
router.put("/:id/profile", authenticateUser, async (req, res, next) => {
  try {
    const isOwner = req.user._id.toString() === req.params.id;
    const isAdmin = req.user.role === "TRANSPORT_ADMIN";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    const { phone } = req.body;
    const targetUser = await User.findById(req.params.id);
    if (!targetUser) return res.status(404).json({ success: false, message: "User not found." });

    if (phone !== undefined) targetUser.phone = phone;
    await targetUser.save();

    res.json({
      success: true,
      message: "Profile updated successfully.",
      user: targetUser.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
