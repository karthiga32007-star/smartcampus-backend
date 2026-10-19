const express = require("express");
const router = express.Router();
const Trip = require("../models/Trip");
const Bus = require("../models/Bus");
const Route = require("../models/Route");
const Driver = require("../models/Driver");
const TransportRegistration = require("../models/TransportRegistration");
const Notification = require("../models/Notification");
const { authenticateUser, requireRole } = require("../middleware/auth");
const { emitToBus, emitToRole, broadcast } = require("../sockets");
const { notifyBusDelay, notifyEmergencySOS } = require("../services/emailService");

const todayStr = () => new Date().toISOString().slice(0, 10);
const hhmm = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};

/**
 * Get trip state for a bus today
 */
router.get("/bus/:busId", async (req, res, next) => {
  try {
    const busId = req.params.busId;
    const date = todayStr();

    let morning = await Trip.findOne({ bus: busId, date, direction: "MORNING" }).populate("route");
    let evening = await Trip.findOne({ bus: busId, date, direction: "EVENING" }).populate("route");

    res.json({
      success: true,
      busId,
      date,
      morning: morning || { status: "SCHEDULED", currentStopIndex: -1, phase: "ENROUTE", delayMinutes: 0, stopTimestamps: {} },
      evening: evening || { status: "SCHEDULED", currentStopIndex: -1, phase: "ENROUTE", delayMinutes: 0, stopTimestamps: {} },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Driver starts morning or evening trip
 */
router.post("/start", authenticateUser, requireRole("DRIVER", "TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { busId, direction } = req.body;
    const date = todayStr();
    const time = hhmm();

    const bus = await Bus.findById(busId).populate("assignedRoute");
    if (!bus) return res.status(404).json({ success: false, message: "Bus not found." });
    if (!bus.assignedRoute) return res.status(400).json({ success: false, message: "Bus has no route assigned." });

    const dir = (direction || "MORNING").toUpperCase();

    let trip = await Trip.findOne({ bus: busId, date, direction: dir });
    if (!trip) {
      trip = new Trip({
        bus: busId,
        driver: bus.assignedDriver,
        route: bus.assignedRoute._id,
        date,
        direction: dir,
      });
    }

    trip.status = "RUNNING";
    trip.startedAt = time;
    trip.currentStopIndex = dir === "MORNING" ? -1 : 0;
    trip.phase = dir === "MORNING" ? "ENROUTE" : "AT_STOP";
    if (dir === "EVENING") {
      trip.stopTimestamps = { 0: time };
    }
    await trip.save();

    // Notify listeners via Socket.IO
    emitToBus(busId, "trip:status_updated", {
      busId,
      direction: dir,
      status: "RUNNING",
      startedAt: time,
      phase: trip.phase,
    });
    emitToRole("admin", "trip:status_updated", { busId, status: "RUNNING" });

    // In-app Notification
    await Notification.create({
      recipientTag: `bus:${busId}`,
      title: `${dir === "MORNING" ? "Morning" : "Evening"} Trip Started`,
      message: `Bus ${bus.busNumber} has departed on its ${dir.toLowerCase()} journey.`,
      type: "INFO",
      category: "reach",
    });

    res.json({
      success: true,
      message: `${dir} trip started for Bus ${bus.busNumber}.`,
      trip,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Driver marks arrival at a stop
 */
router.post("/arrive", authenticateUser, requireRole("DRIVER", "TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { busId, direction, stopIndex, stopName } = req.body;
    const date = todayStr();
    const time = hhmm();
    const dir = (direction || "MORNING").toUpperCase();

    const trip = await Trip.findOne({ bus: busId, date, direction: dir });
    if (!trip) return res.status(404).json({ success: false, message: "No active trip found for this bus." });

    trip.currentStopIndex = parseInt(stopIndex, 10);
    trip.phase = "AT_STOP";
    if (!trip.stopTimestamps) trip.stopTimestamps = new Map();
    trip.stopTimestamps.set(String(stopIndex), time);
    await trip.save();

    const bus = await Bus.findById(busId);

    // Socket.IO Broadcast
    emitToBus(busId, "trip:stop_arrived", {
      busId,
      direction: dir,
      stopIndex: trip.currentStopIndex,
      stopName,
      time,
      phase: "AT_STOP",
    });

    // Notify passengers boarding at this stop
    await Notification.create({
      recipientTag: `bus:${busId}`,
      title: `Bus Arrived at ${stopName}`,
      message: `Bus ${bus?.busNumber || ""} has reached ${stopName}.`,
      type: "INFO",
      category: "reach",
    });

    res.json({ success: true, message: `Arrived at ${stopName}.`, time, trip });
  } catch (err) {
    next(err);
  }
});

/**
 * Driver marks departure from current stop
 */
router.post("/depart", authenticateUser, requireRole("DRIVER", "TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { busId, direction, stopIndex, stopName } = req.body;
    const date = todayStr();
    const dir = (direction || "MORNING").toUpperCase();

    const trip = await Trip.findOne({ bus: busId, date, direction: dir });
    if (!trip) return res.status(404).json({ success: false, message: "No active trip found." });

    trip.phase = "ENROUTE";
    await trip.save();

    emitToBus(busId, "trip:stop_departed", {
      busId,
      direction: dir,
      stopIndex,
      stopName,
      phase: "ENROUTE",
    });

    res.json({ success: true, message: `Departed ${stopName}.`, trip });
  } catch (err) {
    next(err);
  }
});

/**
 * Driver ends trip
 */
router.post("/end", authenticateUser, requireRole("DRIVER", "TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { busId, direction } = req.body;
    const date = todayStr();
    const time = hhmm();
    const dir = (direction || "MORNING").toUpperCase();

    const trip = await Trip.findOne({ bus: busId, date, direction: dir });
    if (!trip) return res.status(404).json({ success: false, message: "No active trip found." });

    trip.status = "COMPLETED";
    trip.endedAt = time;
    await trip.save();

    emitToBus(busId, "trip:ended", { busId, direction: dir, time });
    emitToRole("admin", "trip:ended", { busId, direction: dir });

    res.json({ success: true, message: `${dir} trip completed successfully.`, trip });
  } catch (err) {
    next(err);
  }
});

/**
 * Driver reports transit delay
 */
router.post("/delay", authenticateUser, requireRole("DRIVER", "TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { busId, direction, delayMinutes, reason } = req.body;
    const date = todayStr();
    const dir = (direction || "MORNING").toUpperCase();

    const trip = await Trip.findOne({ bus: busId, date, direction: dir }).populate("route");
    if (!trip) return res.status(404).json({ success: false, message: "Trip record not found." });

    trip.delayMinutes = parseInt(delayMinutes, 10);
    trip.status = "DELAYED";
    await trip.save();

    const bus = await Bus.findById(busId);

    // Socket.IO broadcast
    emitToBus(busId, "trip:delay_reported", {
      busId,
      delayMinutes: trip.delayMinutes,
      reason,
    });

    // In-app Notification
    await Notification.create({
      recipientTag: `bus:${busId}`,
      title: `Bus ${bus?.busNumber} Delayed (+${trip.delayMinutes} min)`,
      message: `Bus ${bus?.busNumber} is running ~${trip.delayMinutes} minutes late.${reason ? ` Reason: ${reason}` : ""}`,
      type: "WARNING",
      category: "delay",
    });

    // Notify registered passengers by email
    const regs = await TransportRegistration.find({ assignedBus: busId, status: "Approved" }).populate("user");
    for (const r of regs) {
      if (r.user?.email) {
        notifyBusDelay({
          toEmail: r.user.email,
          name: r.personName,
          busNumber: bus?.busNumber || "NEC",
          delayMins: trip.delayMinutes,
          routeName: trip.route?.name || "College Route",
        }).catch(() => {});
      }
    }

    res.json({ success: true, message: `Delay of ${trip.delayMinutes} mins recorded.`, trip });
  } catch (err) {
    next(err);
  }
});

/**
 * Driver reports breakdown or emergency issue
 */
router.post("/issue", authenticateUser, requireRole("DRIVER", "TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { busId, issueType, description } = req.body;

    const bus = await Bus.findById(busId);
    if (!bus) return res.status(404).json({ success: false, message: "Bus not found." });

    const newStatus = issueType === "Emergency" ? "Emergency" : "Breakdown";
    bus.status = newStatus;
    await bus.save();

    // Broadcast emergency across sockets
    emitToRole("admin", "emergency:alert", {
      busId,
      busNumber: bus.busNumber,
      driverName: req.user.name,
      description,
    });
    emitToBus(busId, "emergency:alert", {
      busId,
      busNumber: bus.busNumber,
      description,
    });

    await Notification.create({
      recipientTag: "role:admin",
      title: `URGENT: ${newStatus} Reported on ${bus.busNumber}`,
      message: `Driver ${req.user.name} reported: ${description || newStatus}`,
      type: "EMERGENCY",
      category: "sos",
    });

    res.json({ success: true, message: `${newStatus} reported. Transport Office notified.`, bus });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
