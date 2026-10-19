const express = require("express");
const router = express.Router();
const Announcement = require("../models/Announcement");
const Notification = require("../models/Notification");
const { authenticateUser, requireRole } = require("../middleware/auth");
const { broadcast } = require("../sockets");

/**
 * List active announcements
 */
router.get("/", async (req, res, next) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 }).limit(20);
    res.json({ success: true, announcements });
  } catch (err) {
    next(err);
  }
});

/**
 * Publish a new announcement (Admin & Transport Staff)
 */
router.post("/", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { title, message, priority, targetAudience } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: "Title and message are required." });
    }

    const item = await Announcement.create({
      title: title.trim(),
      message: message.trim(),
      priority: priority || "Normal",
      targetAudience: targetAudience || "All",
      publishedBy: req.user._id,
      authorName: req.user.name,
    });

    // Also blast an in-app broadcast notification
    const notif = await Notification.create({
      recipientTag: "all",
      title: `Announcement: ${title}`,
      message,
      type: priority === "Urgent" ? "ALERT" : priority === "Important" ? "WARNING" : "INFO",
      category: "info",
    });
    broadcast("notification:new", notif);

    res.status(201).json({
      success: true,
      message: "Announcement published across campus.",
      announcement: item,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete an announcement
 */
router.delete("/:id", authenticateUser, requireRole("TRANSPORT_ADMIN"), async (req, res, next) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Announcement removed." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
