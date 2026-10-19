const express = require("express");
const router = express.Router();
const Feedback = require("../models/Feedback");
const Route = require("../models/Route");
const { authenticateUser } = require("../middleware/auth");

/**
 * List feedback entries
 */
router.get("/", authenticateUser, async (req, res, next) => {
  try {
    const feedbackList = await Feedback.find().populate("route", "name code").sort({ createdAt: -1 });

    const avg = feedbackList.length
      ? (feedbackList.reduce((acc, f) => acc + f.rating, 0) / feedbackList.length).toFixed(1)
      : "5.0";

    res.json({
      success: true,
      feedback: feedbackList,
      averageRating: parseFloat(avg),
      totalCount: feedbackList.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Submit commute feedback & star rating
 */
router.post("/", authenticateUser, async (req, res, next) => {
  try {
    const { routeId, rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "A rating between 1 and 5 stars is required." });
    }

    let routeName = "";
    if (routeId) {
      const rt = await Route.findById(routeId);
      if (rt) routeName = rt.name;
    }

    const feedback = await Feedback.create({
      user: req.user._id,
      userName: req.user.name,
      route: routeId || null,
      routeName,
      rating: parseInt(rating, 10),
      comment: comment ? comment.trim() : "",
    });

    res.status(201).json({
      success: true,
      message: "Thank you! Your commute feedback has been recorded.",
      feedback,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
