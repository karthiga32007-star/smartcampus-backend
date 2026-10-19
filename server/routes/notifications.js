const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { authenticateUser, requireRole } = require("../middleware/auth");
const { broadcast, emitToRole, emitToUser } = require("../sockets");

/**
 * Get notification list for authenticated user
 */
router.get("/", authenticateUser, async (req, res, next) => {
  try {
    const userRole = req.user.role.toLowerCase();
    const tags = ["all", `role:${userRole}`, `role:${req.user.role}`];

    const notifications = await Notification.find({
      $or: [
        { recipient: req.user._id },
        { recipientTag: { $in: tags } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    res.json({
      success: true,
      notifications,
      unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Mark all notifications as read for current user
 */
router.post("/read-all", authenticateUser, async (req, res, next) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ success: true, message: "All notifications marked as read." });
  } catch (err) {
    next(err);
  }
});

/**
 * Send notification (Admin & Transport Staff only)
 */
router.post("/send", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { recipientTag, recipientUserId, title, message, priority, category } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: "Title and message are required." });
    }

    const notif = await Notification.create({
      recipient: recipientUserId || null,
      recipientTag: recipientTag || "all",
      title: title.trim(),
      message: message.trim(),
      type: priority || "INFO",
      category: category || "info",
    });

    if (recipientUserId) {
      emitToUser(recipientUserId, "notification:new", notif);
    } else if (recipientTag && recipientTag !== "all") {
      emitToRole(recipientTag.replace("role:", ""), "notification:new", notif);
    } else {
      broadcast("notification:new", notif);
    }

    res.status(201).json({ success: true, message: "Notification dispatched.", notification: notif });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
