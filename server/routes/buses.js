const express = require("express");
const router = express.Router();
const Bus = require("../models/Bus");
const Driver = require("../models/Driver");
const TransportRegistration = require("../models/TransportRegistration");
const AuditLog = require("../models/AuditLog");
const { authenticateUser, requireRole } = require("../middleware/auth");

/**
 * List all buses with route, driver, and rider seat counts
 */
router.get("/", authenticateUser, async (req, res, next) => {
  try {
    const buses = await Bus.find()
      .populate("assignedRoute", "code name via fee arrivalAtCollege departureFromCollege")
      .populate("assignedDriver", "driverCode name phone status")
      .sort({ busNumber: 1 });

    // Populate rider count per bus
    const busIds = buses.map((b) => b._id);
    const riderCounts = await TransportRegistration.aggregate([
      { $match: { assignedBus: { $in: busIds }, status: "Approved" } },
      { $group: { _id: "$assignedBus", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    riderCounts.forEach((rc) => {
      countMap[rc._id.toString()] = rc.count;
    });

    const enriched = buses.map((b) => {
      const obj = b.toObject();
      const ridersCount = countMap[b._id.toString()] || 0;
      obj.ridersCount = ridersCount;
      obj.seatsFree = Math.max(0, b.capacity - ridersCount);
      return obj;
    });

    res.json({ success: true, buses: enriched });
  } catch (err) {
    next(err);
  }
});

/**
 * Add a new bus
 */
router.post("/", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { busNumber, registrationNumber, capacity, busType, assignedRouteId, assignedDriverId } = req.body;

    if (!busNumber || !registrationNumber) {
      return res.status(400).json({ success: false, message: "Bus number and registration number are required." });
    }

    const bus = await Bus.create({
      busNumber: busNumber.trim().toUpperCase(),
      registrationNumber: registrationNumber.trim().toUpperCase(),
      capacity: parseInt(capacity, 10) || 50,
      busType: busType || "Standard",
      assignedRoute: assignedRouteId || null,
      assignedDriver: assignedDriverId || null,
      status: "Active",
    });

    if (assignedDriverId) {
      await Driver.findByIdAndUpdate(assignedDriverId, { assignedBus: bus._id });
    }

    await AuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: "BUS_CREATED",
      entityType: "Bus",
      entityId: bus._id.toString(),
      metadata: { busNumber: bus.busNumber, registrationNumber: bus.registrationNumber },
    });

    res.status(201).json({
      success: true,
      message: `Bus ${bus.busNumber} added to fleet.`,
      bus,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update bus properties (route, driver, capacity, status)
 */
router.put("/:id", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { registrationNumber, capacity, busType, assignedRouteId, assignedDriverId, status } = req.body;
    const bus = await Bus.findById(req.params.id);
    if (!bus) return res.status(404).json({ success: false, message: "Bus not found." });

    if (registrationNumber) bus.registrationNumber = registrationNumber.trim().toUpperCase();
    if (capacity) bus.capacity = parseInt(capacity, 10);
    if (busType) bus.busType = busType;
    if (status) bus.status = status;

    if (assignedRouteId !== undefined) bus.assignedRoute = assignedRouteId || null;

    if (assignedDriverId !== undefined) {
      if (bus.assignedDriver && bus.assignedDriver.toString() !== assignedDriverId) {
        await Driver.findByIdAndUpdate(bus.assignedDriver, { assignedBus: null });
      }
      bus.assignedDriver = assignedDriverId || null;
      if (assignedDriverId) {
        await Driver.findByIdAndUpdate(assignedDriverId, { assignedBus: bus._id });
      }
    }

    await bus.save();

    res.json({
      success: true,
      message: `Bus ${bus.busNumber} updated successfully.`,
      bus,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update bus operational status (Active, In Maintenance, Breakdown, Emergency)
 */
router.put("/:id/status", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF", "DRIVER"), async (req, res, next) => {
  try {
    const { status } = req.body;
    const valid = ["Active", "In Maintenance", "Out of Service", "Breakdown", "Emergency"];
    if (!valid.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${valid.join(", ")}` });
    }

    const bus = await Bus.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!bus) return res.status(404).json({ success: false, message: "Bus not found." });

    res.json({
      success: true,
      message: `Status of ${bus.busNumber} updated to ${status}.`,
      bus,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete bus from fleet
 */
router.delete("/:id", authenticateUser, requireRole("TRANSPORT_ADMIN"), async (req, res, next) => {
  try {
    const bus = await Bus.findById(req.params.id);
    if (!bus) return res.status(404).json({ success: false, message: "Bus not found." });

    // Check if active approved riders are assigned to this bus
    const activeRiders = await TransportRegistration.countDocuments({ assignedBus: bus._id, status: "Approved" });
    if (activeRiders > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete bus ${bus.busNumber}: it has ${activeRiders} active approved riders assigned. Reassign them first.`,
        code: "BUS_HAS_ACTIVE_RIDERS",
      });
    }

    if (bus.assignedDriver) {
      await Driver.findByIdAndUpdate(bus.assignedDriver, { assignedBus: null });
    }

    await Bus.findByIdAndDelete(req.params.id);

    await AuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: "BUS_DELETED",
      entityType: "Bus",
      entityId: req.params.id,
      metadata: { busNumber: bus.busNumber },
    });

    res.json({ success: true, message: `Bus ${bus.busNumber} deleted.` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
