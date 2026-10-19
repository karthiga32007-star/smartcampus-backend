const express = require("express");
const router = express.Router();
const BusLocation = require("../models/BusLocation");
const Bus = require("../models/Bus");
const { authenticateUser, requireRole } = require("../middleware/auth");
const { emitToBus, emitToRole } = require("../sockets");

/**
 * Driver updates live GPS coordinates (REST endpoint alongside Socket stream)
 */
router.post("/location", authenticateUser, requireRole("DRIVER", "TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { busId, tripId, latitude, longitude, speed, heading, accuracy } = req.body;

    if (!busId || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "busId, latitude, and longitude are required.",
        code: "INVALID_COORDINATES",
      });
    }

    const loc = await BusLocation.create({
      bus: busId,
      trip: tripId || null,
      driver: req.user._id,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      speed: speed ? parseFloat(speed) : null,
      heading: heading ? parseFloat(heading) : null,
      accuracy: accuracy ? parseFloat(accuracy) : null,
      recordedAt: new Date(),
    });

    const payload = {
      busId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      speed: loc.speed,
      heading: loc.heading,
      accuracy: loc.accuracy,
      recordedAt: loc.recordedAt.toISOString(),
      isLive: true,
    };

    // Emit real-time update via Socket.IO
    emitToBus(busId, "bus:location_updated", payload);
    emitToRole("admin", "bus:location_updated", payload);

    res.json({
      success: true,
      message: "GPS coordinate recorded and broadcast.",
      location: payload,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get latest GPS tracking status for a bus
 */
router.get("/bus/:busId", async (req, res, next) => {
  try {
    const { busId } = req.params;

    const loc = await BusLocation.findOne({ bus: busId }).sort({ recordedAt: -1 });

    if (!loc) {
      return res.json({
        success: true,
        hasGps: false,
        isLive: false,
        message: "Live GPS is not currently being shared for this vehicle.",
      });
    }

    const recordedTime = new Date(loc.recordedAt);
    const now = new Date();
    const diffMinutes = Math.max(0, Math.floor((now - recordedTime) / 60000));
    const isLive = diffMinutes < 3;

    res.json({
      success: true,
      hasGps: true,
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy: loc.accuracy,
      speed: loc.speed,
      recordedAt: loc.recordedAt,
      isLive,
      statusText: isLive ? "Live GPS Active" : `Last signal ${diffMinutes} min ago`,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
