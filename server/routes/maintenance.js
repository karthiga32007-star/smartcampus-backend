const express = require("express");
const router = express.Router();
const Maintenance = require("../models/Maintenance");
const Bus = require("../models/Bus");
const { authenticateUser, requireRole } = require("../middleware/auth");

/**
 * List maintenance alerts and logs
 */
router.get("/", authenticateUser, async (req, res, next) => {
  try {
    const alerts = await Maintenance.find().populate("bus", "busNumber registrationNumber status").sort({ createdAt: -1 });
    res.json({ success: true, alerts });
  } catch (err) {
    next(err);
  }
});

/**
 * Add a maintenance ticket / alert (Admin & Transport Staff)
 */
router.post("/", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF", "DRIVER"), async (req, res, next) => {
  try {
    const { busId, maintenanceType, description, priority, scheduledDate, costInfo } = req.body;

    const bus = await Bus.findById(busId);
    if (!bus) return res.status(404).json({ success: false, message: "Bus not found." });

    const item = await Maintenance.create({
      bus: bus._id,
      busNumber: bus.busNumber,
      maintenanceType: maintenanceType || "Scheduled Service",
      description: description.trim(),
      priority: priority || "Medium",
      scheduledDate: scheduledDate || "",
      costInfo: costInfo ? parseFloat(costInfo) : 0,
      status: "REPORTED",
    });

    if (priority === "High" || priority === "Critical") {
      bus.status = "In Maintenance";
      await bus.save();
    }

    res.status(201).json({
      success: true,
      message: `Maintenance alert logged for ${bus.busNumber}.`,
      alert: item,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update maintenance status
 */
router.put("/:id/status", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { status, completedDate } = req.body;
    const item = await Maintenance.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: "Maintenance record not found." });

    item.status = status;
    if (status === "COMPLETED") {
      item.completedDate = completedDate || new Date().toISOString().slice(0, 10);
      // Restore bus status to Active if it was In Maintenance
      const bus = await Bus.findById(item.bus);
      if (bus && bus.status === "In Maintenance") {
        bus.status = "Active";
        await bus.save();
      }
    }

    await item.save();

    res.json({
      success: true,
      message: `Maintenance item marked as ${status}.`,
      alert: item,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
