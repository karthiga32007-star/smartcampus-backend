const express = require("express");
const router = express.Router();
const SpecialBusRequest = require("../models/SpecialBusRequest");
const Bus = require("../models/Bus");
const Driver = require("../models/Driver");
const Notification = require("../models/Notification");
const { authenticateUser, requireRole } = require("../middleware/auth");
const { emitToUser, emitToRole } = require("../sockets");

/**
 * List special bus requests
 */
router.get("/", authenticateUser, async (req, res, next) => {
  try {
    const isStaff = req.user.role === "TRANSPORT_ADMIN" || req.user.role === "TRANSPORT_STAFF";
    const query = isStaff ? {} : { user: req.user._id };

    const requests = await SpecialBusRequest.find(query)
      .populate("assignedBus", "busNumber registrationNumber capacity")
      .populate("assignedDriver", "name phone")
      .sort({ createdAt: -1 });

    res.json({ success: true, requests });
  } catch (err) {
    next(err);
  }
});

/**
 * Submit special bus request for college event, industrial visit, symposium, etc.
 */
router.post("/", authenticateUser, async (req, res, next) => {
  try {
    const { eventName, tripDate, departureTime, returnTime, pickupLocation, destination, passengerCount, reason } = req.body;

    if (!eventName || !tripDate || !destination || !passengerCount) {
      return res.status(400).json({
        success: false,
        message: "Event name, trip date, destination, and passenger count are required.",
      });
    }

    const count = await SpecialBusRequest.countDocuments();
    const requestCode = `SBR-${100 + count + 1}`;

    const request = await SpecialBusRequest.create({
      requestCode,
      user: req.user._id,
      requestedBy: req.user.name,
      eventName: eventName.trim(),
      tripDate,
      departureTime: departureTime || "09:00",
      returnTime: returnTime || "17:00",
      pickupLocation: pickupLocation || "NEC Campus, Kovilpatti",
      destination: destination.trim(),
      passengerCount: parseInt(passengerCount, 10),
      reason: reason || "",
      status: "PENDING",
    });

    // Notify admins
    const notif = await Notification.create({
      recipientTag: "role:admin",
      title: "New Special Bus Request",
      message: `${req.user.name} requested a bus for "${eventName}" to ${destination} on ${tripDate}.`,
      type: "INFO",
      category: "info",
    });
    emitToRole("admin", "notification:new", notif);

    res.status(201).json({
      success: true,
      message: `Special bus request ${requestCode} submitted for transport office approval.`,
      request,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin decide special bus request (Approve, Reject, Assign Bus & Driver)
 */
router.put("/:id/decide", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { status, assignedBusId, assignedDriverId, adminNotes } = req.body;
    const request = await SpecialBusRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ success: false, message: "Request not found." });

    if (status) request.status = status;
    if (adminNotes !== undefined) request.adminNotes = adminNotes;
    if (assignedBusId) request.assignedBus = assignedBusId;
    if (assignedDriverId) request.assignedDriver = assignedDriverId;

    await request.save();

    // Notify requester
    const notif = await Notification.create({
      recipient: request.user,
      title: `Special Bus Request ${request.requestCode} ${request.status}`,
      message: `Your special bus booking for "${request.eventName}" has been ${request.status.toLowerCase()}.${adminNotes ? ` Note: ${adminNotes}` : ""}`,
      type: request.status === "APPROVED" || request.status === "ASSIGNED" ? "SUCCESS" : "ALERT",
      category: "info",
    });
    emitToUser(request.user.toString(), "notification:new", notif);

    res.json({
      success: true,
      message: `Special bus request ${request.requestCode} updated to ${request.status}.`,
      request,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
