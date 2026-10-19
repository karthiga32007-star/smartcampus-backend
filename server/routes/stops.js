const express = require("express");
const router = express.Router();
const Stop = require("../models/Stop");
const { authenticateUser, requireAdmin } = require("../middleware/auth");

/**
 * List all active stops
 */
router.get("/", async (req, res, next) => {
  try {
    const stops = await Stop.find({ isActive: true }).sort({ name: 1 });
    res.json({ success: true, stops });
  } catch (err) {
    next(err);
  }
});

/**
 * Add a new stop
 */
router.post("/", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { name, area, latitude, longitude } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Stop name is required." });

    const count = await Stop.countDocuments();
    const code = `S${count + 1}`;

    const stop = await Stop.create({
      code,
      name: name.trim(),
      area: area ? area.trim() : "",
      latitude: latitude ? parseFloat(latitude) : 9.1723,
      longitude: longitude ? parseFloat(longitude) : 77.8689,
      isActive: true,
    });

    res.status(201).json({ success: true, message: `Stop ${stop.name} created.`, stop });
  } catch (err) {
    next(err);
  }
});

/**
 * Update stop details
 */
router.put("/:id", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { name, area, latitude, longitude, isActive } = req.body;
    const stop = await Stop.findById(req.params.id);
    if (!stop) return res.status(404).json({ success: false, message: "Stop not found." });

    if (name) stop.name = name.trim();
    if (area !== undefined) stop.area = area.trim();
    if (latitude !== undefined) stop.latitude = parseFloat(latitude);
    if (longitude !== undefined) stop.longitude = parseFloat(longitude);
    if (isActive !== undefined) stop.isActive = isActive;

    await stop.save();

    res.json({ success: true, message: "Stop updated successfully.", stop });
  } catch (err) {
    next(err);
  }
});

/**
 * Delete stop
 */
router.delete("/:id", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    await Stop.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: "Stop deactivated." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
