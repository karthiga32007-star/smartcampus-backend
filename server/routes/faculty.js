const express = require("express");
const router = express.Router();
const FacultyProfile = require("../models/FacultyProfile");
const { authenticateUser, requireAdmin } = require("../middleware/auth");

/**
 * Get faculty profile of current authenticated user
 */
router.get("/me", authenticateUser, async (req, res, next) => {
  try {
    const profile = await FacultyProfile.findOne({ user: req.user._id });
    res.json({
      success: true,
      profile: profile || null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update faculty profile details
 */
router.put("/me", authenticateUser, async (req, res, next) => {
  try {
    const { department, designation, emergencyContact } = req.body;

    let profile = await FacultyProfile.findOne({ user: req.user._id });
    if (!profile) {
      profile = new FacultyProfile({
        user: req.user._id,
        employeeId: `FAC${Math.floor(100 + Math.random() * 900)}`,
      });
    }

    if (department) profile.department = department;
    if (designation) profile.designation = designation;
    if (emergencyContact) profile.emergencyContact = emergencyContact;

    await profile.save();

    res.json({
      success: true,
      message: "Faculty profile updated successfully.",
      profile,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin view all faculty
 */
router.get("/", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const facultyList = await FacultyProfile.find().populate("user", "name email avatar status");
    res.json({ success: true, faculty: facultyList });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
