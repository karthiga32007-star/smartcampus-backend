const express = require("express");
const router = express.Router();
const Driver = require("../models/Driver");
const Bus = require("../models/Bus");
const AuditLog = require("../models/AuditLog");
const { authenticateUser, requireRole } = require("../middleware/auth");

/**
 * List all drivers
 */
router.get("/", authenticateUser, async (req, res, next) => {
  try {
    const drivers = await Driver.find().populate("assignedBus", "busNumber registrationNumber status").sort({ name: 1 });
    res.json({ success: true, drivers });
  } catch (err) {
    next(err);
  }
});

/**
 * Get driver assigned to current authenticated driver user
 */
router.get("/me", authenticateUser, requireRole("DRIVER", "TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const driver = await Driver.findOne({ user: req.user._id }).populate({
      path: "assignedBus",
      populate: { path: "assignedRoute", populate: { path: "stops.stop" } },
    });

    res.json({
      success: true,
      driver: driver || null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Add a new driver (Admin only)
 */
router.post("/", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { name, phone, licenseNumber, licenseExpiry, experienceYears, assignedBusId } = req.body;

    if (!name || !phone || !licenseNumber || !licenseExpiry) {
      return res.status(400).json({ success: false, message: "Name, phone, license number, and expiry are required." });
    }

    const count = await Driver.countDocuments();
    const driverCode = `D${String(count + 1).padStart(3, "0")}`;

    const driver = await Driver.create({
      driverCode,
      name: name.trim(),
      phone: phone.trim(),
      licenseNumber: licenseNumber.trim(),
      licenseExpiry,
      experienceYears: experienceYears || 0,
      assignedBus: assignedBusId || null,
      status: "Active",
    });

    if (assignedBusId) {
      await Bus.findByIdAndUpdate(assignedBusId, { assignedDriver: driver._id });
    }

    await AuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: "DRIVER_CREATED",
      entityType: "Driver",
      entityId: driver._id.toString(),
      metadata: { name: driver.name, licenseNumber },
    });

    res.status(201).json({
      success: true,
      message: "Driver registered successfully.",
      driver,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update driver details
 */
router.put("/:id", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { name, phone, licenseNumber, licenseExpiry, experienceYears, status, assignedBusId } = req.body;
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ success: false, message: "Driver not found." });

    if (name) driver.name = name.trim();
    if (phone) driver.phone = phone.trim();
    if (licenseNumber) driver.licenseNumber = licenseNumber.trim();
    if (licenseExpiry) driver.licenseExpiry = licenseExpiry;
    if (experienceYears !== undefined) driver.experienceYears = experienceYears;
    if (status) driver.status = status;

    if (assignedBusId !== undefined) {
      // Clear previous assignment
      if (driver.assignedBus && driver.assignedBus.toString() !== assignedBusId) {
        await Bus.findByIdAndUpdate(driver.assignedBus, { assignedDriver: null });
      }
      driver.assignedBus = assignedBusId || null;
      if (assignedBusId) {
        await Bus.findByIdAndUpdate(assignedBusId, { assignedDriver: driver._id });
      }
    }

    await driver.save();

    res.json({
      success: true,
      message: "Driver updated successfully.",
      driver,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete / deactivate driver
 */
router.delete("/:id", authenticateUser, requireRole("TRANSPORT_ADMIN"), async (req, res, next) => {
  try {
    const driver = await Driver.findById(req.params.id);
    if (!driver) return res.status(404).json({ success: false, message: "Driver not found." });

    if (driver.assignedBus) {
      await Bus.findByIdAndUpdate(driver.assignedBus, { assignedDriver: null });
    }

    await Driver.findByIdAndDelete(req.params.id);

    await AuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: "DRIVER_DELETED",
      entityType: "Driver",
      entityId: req.params.id,
      metadata: { name: driver.name },
    });

    res.json({ success: true, message: `Driver ${driver.name} removed successfully.` });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
