const express = require("express");
const router = express.Router();
const Complaint = require("../models/Complaint");
const Route = require("../models/Route");
const Notification = require("../models/Notification");
const { authenticateUser, requireRole } = require("../middleware/auth");
const { emitToUser, emitToRole } = require("../sockets");

/**
 * List complaints (Admins/Staff view all, Users view their own)
 */
router.get("/", authenticateUser, async (req, res, next) => {
  try {
    const isStaff = req.user.role === "TRANSPORT_ADMIN" || req.user.role === "TRANSPORT_STAFF";
    const query = isStaff ? {} : { user: req.user._id };

    const complaints = await Complaint.find(query).populate("route", "name code").sort({ createdAt: -1 });

    res.json({ success: true, complaints });
  } catch (err) {
    next(err);
  }
});

/**
 * Submit a new complaint
 */
router.post("/", authenticateUser, async (req, res, next) => {
  try {
    const { category, description, routeId, priority } = req.body;

    if (!category || !description) {
      return res.status(400).json({ success: false, message: "Category and description are required." });
    }

    let routeName = "";
    if (routeId) {
      const rt = await Route.findById(routeId);
      if (rt) routeName = rt.name;
    }

    const count = await Complaint.countDocuments();
    const ticketId = `CMP-${1000 + count + 1}`;

    const complaint = await Complaint.create({
      ticketId,
      user: req.user._id,
      userName: req.user.name,
      category,
      route: routeId || null,
      routeName,
      description: description.trim(),
      priority: priority || "Medium",
      status: "OPEN",
    });

    // Notify admins
    const notif = await Notification.create({
      recipientTag: "role:admin",
      title: `New Grievance: ${category}`,
      message: `${req.user.name} lodged complaint ${ticketId}: "${description.slice(0, 80)}..."`,
      type: "WARNING",
      category: "info",
    });
    emitToRole("admin", "notification:new", notif);

    res.status(201).json({
      success: true,
      message: `Complaint ticket ${ticketId} registered with the Transport Office.`,
      complaint,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update complaint status & response (Admin/Staff only)
 */
router.put("/:id/status", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { status, adminResponse } = req.body;
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: "Complaint not found." });

    if (status) complaint.status = status;
    if (adminResponse !== undefined) complaint.adminResponse = adminResponse;
    if (status === "RESOLVED") complaint.resolvedAt = new Date();

    await complaint.save();

    // Notify complainant
    const notif = await Notification.create({
      recipient: complaint.user,
      title: `Complaint ${complaint.ticketId} Updated`,
      message: `Status: ${complaint.status}.${adminResponse ? ` Response: ${adminResponse}` : ""}`,
      type: status === "RESOLVED" ? "SUCCESS" : "INFO",
      category: "info",
    });
    emitToUser(complaint.user.toString(), "notification:new", notif);

    res.json({
      success: true,
      message: `Complaint ${complaint.ticketId} marked as ${complaint.status}.`,
      complaint,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
