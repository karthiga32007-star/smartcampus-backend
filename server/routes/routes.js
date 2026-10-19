const express = require("express");
const router = express.Router();
const Route = require("../models/Route");
const Stop = require("../models/Stop");
const Bus = require("../models/Bus");
const TransportRegistration = require("../models/TransportRegistration");
const AuditLog = require("../models/AuditLog");
const { authenticateUser, requireAdmin } = require("../middleware/auth");

/**
 * List all active routes with stops populated
 */
router.get("/", async (req, res, next) => {
  try {
    const routes = await Route.find({ isActive: true })
      .populate("stops.stop")
      .sort({ code: 1 });

    // Populate free seats count per route
    const buses = await Bus.find({ status: { $in: ["Active", "Breakdown", "Emergency"] } });
    const regs = await TransportRegistration.find({ status: "Approved" });

    const enriched = routes.map((rt) => {
      const obj = rt.toObject();
      const routeBuses = buses.filter((b) => b.assignedRoute && b.assignedRoute.toString() === rt._id.toString());
      const totalCapacity = routeBuses.reduce((sum, b) => sum + b.capacity, 0);
      const riderCount = regs.filter((r) => r.route && r.route.toString() === rt._id.toString()).length;
      obj.totalCapacity = totalCapacity;
      obj.ridersCount = riderCount;
      obj.freeSeats = Math.max(0, totalCapacity - riderCount);
      return obj;
    });

    res.json({ success: true, routes: enriched });
  } catch (err) {
    next(err);
  }
});

/**
 * Get route by ID with stops and assigned buses
 */
router.get("/:id", async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id).populate("stops.stop");
    if (!route) return res.status(404).json({ success: false, message: "Route not found." });

    const buses = await Bus.find({ assignedRoute: route._id }).populate("assignedDriver", "name phone");

    res.json({ success: true, route, buses });
  } catch (err) {
    next(err);
  }
});

/**
 * Create a new route (Admin only)
 */
router.post("/", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { name, via, fee, arrivalAtCollege, departureFromCollege, distanceKm } = req.body;

    if (!name || !via) {
      return res.status(400).json({ success: false, message: "Route name and intermediate towns (via) are required." });
    }

    const count = await Route.countDocuments();
    const code = `R${count + 1}`;

    const route = await Route.create({
      code,
      name: name.trim(),
      via: via.trim(),
      fee: fee ? parseInt(fee, 10) : 12000,
      arrivalAtCollege: arrivalAtCollege || "08:30",
      departureFromCollege: departureFromCollege || "16:30",
      distanceKm: distanceKm ? parseFloat(distanceKm) : 35,
      stops: [],
      isActive: true,
    });

    await AuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: "ROUTE_CREATED",
      entityType: "Route",
      entityId: route._id.toString(),
      metadata: { code: route.code, name: route.name },
    });

    res.status(201).json({ success: true, message: `Route ${route.name} created.`, route });
  } catch (err) {
    next(err);
  }
});

/**
 * Update route parameters
 */
router.put("/:id", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { name, via, fee, arrivalAtCollege, departureFromCollege, distanceKm, isActive } = req.body;
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: "Route not found." });

    if (name) route.name = name.trim();
    if (via) route.via = via.trim();
    if (fee !== undefined) route.fee = parseInt(fee, 10);
    if (arrivalAtCollege) route.arrivalAtCollege = arrivalAtCollege;
    if (departureFromCollege) route.departureFromCollege = departureFromCollege;
    if (distanceKm !== undefined) route.distanceKm = parseFloat(distanceKm);
    if (isActive !== undefined) route.isActive = isActive;

    await route.save();

    res.json({ success: true, message: "Route updated successfully.", route });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete a route
 */
router.delete("/:id", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const activeRiders = await TransportRegistration.countDocuments({ route: req.params.id, status: "Approved" });
    if (activeRiders > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete route: it currently has ${activeRiders} active approved passengers. Reassign them first.`,
        code: "ROUTE_HAS_RIDERS",
      });
    }

    await Route.findByIdAndDelete(req.params.id);
    await Bus.updateMany({ assignedRoute: req.params.id }, { assignedRoute: null });

    res.json({ success: true, message: "Route deleted successfully." });
  } catch (err) {
    next(err);
  }
});

/**
 * Add stop to route with morning and evening times
 */
router.post("/:id/stops", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { stopId, name, morningTime, eveningTime } = req.body;
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: "Route not found." });

    let stopTargetId = stopId;

    // If stopId is not provided, find or create stop by name
    if (!stopTargetId && name) {
      let stop = await Stop.findOne({ name: name.trim() });
      if (!stop) {
        const count = await Stop.countDocuments();
        stop = await Stop.create({
          code: `S${count + 1}`,
          name: name.trim(),
          area: route.name.split(" ")[0],
          latitude: 9.1723,
          longitude: 77.8689,
        });
      }
      stopTargetId = stop._id;
    }

    if (!stopTargetId) {
      return res.status(400).json({ success: false, message: "A valid stop ID or name is required." });
    }

    const nextOrder = route.stops.length + 1;
    route.stops.push({
      stop: stopTargetId,
      stopOrder: nextOrder,
      morningTime: morningTime || "07:00",
      eveningTime: eveningTime || "17:30",
    });

    await route.save();
    const updated = await Route.findById(route._id).populate("stops.stop");

    res.json({ success: true, message: "Stop added to route schedule.", route: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * Remove stop from route
 */
router.delete("/:id/stops/:stopId", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: "Route not found." });

    route.stops = route.stops.filter((s) => s.stop.toString() !== req.params.stopId);
    // Re-index stopOrder
    route.stops.forEach((s, idx) => {
      s.stopOrder = idx + 1;
    });

    await route.save();
    const updated = await Route.findById(route._id).populate("stops.stop");

    res.json({ success: true, message: "Stop removed from route.", route: updated });
  } catch (err) {
    next(err);
  }
});

/**
 * Move stop up/down in sequence
 */
router.put("/:id/stops/move", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { stopId, direction } = req.body; // direction: -1 (up), 1 (down)
    const route = await Route.findById(req.params.id);
    if (!route) return res.status(404).json({ success: false, message: "Route not found." });

    const idx = route.stops.findIndex((s) => s.stop.toString() === stopId);
    if (idx === -1) return res.status(404).json({ success: false, message: "Stop not found on route." });

    const newIdx = idx + parseInt(direction, 10);
    if (newIdx < 0 || newIdx >= route.stops.length) {
      return res.json({ success: true, route }); // Out of bounds, do nothing
    }

    // Swap
    const temp = route.stops[idx];
    route.stops[idx] = route.stops[newIdx];
    route.stops[newIdx] = temp;

    // Fix orders
    route.stops.forEach((s, i) => {
      s.stopOrder = i + 1;
    });

    await route.save();
    const updated = await Route.findById(route._id).populate("stops.stop");

    res.json({ success: true, message: "Stop reordered.", route: updated });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
