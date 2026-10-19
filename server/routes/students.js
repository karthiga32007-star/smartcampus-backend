const express = require("express");
const router = express.Router();
const StudentProfile = require("../models/StudentProfile");
const User = require("../models/User");
const { authenticateUser, requireAdmin } = require("../middleware/auth");

/**
 * Get student profile of current authenticated student
 */
router.get("/me", authenticateUser, async (req, res, next) => {
  try {
    const profile = await StudentProfile.findOne({ user: req.user._id }).populate("parentUser", "name email phone");
    res.json({
      success: true,
      profile: profile || null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Update student profile details (department, section, emergency contact)
 */
router.put("/me", authenticateUser, async (req, res, next) => {
  try {
    const { department, year, section, emergencyContact } = req.body;

    let profile = await StudentProfile.findOne({ user: req.user._id });
    if (!profile) {
      profile = new StudentProfile({
        user: req.user._id,
        studentId: `STU${Math.floor(100 + Math.random() * 900)}`,
      });
    }

    if (department) profile.department = department;
    if (year) profile.year = year;
    if (section) profile.section = section;
    if (emergencyContact) profile.emergencyContact = emergencyContact;

    await profile.save();

    res.json({
      success: true,
      message: "Student profile updated successfully.",
      profile,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin view all students
 */
router.get("/", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const students = await StudentProfile.find().populate("user", "name email avatar status").sort({ studentId: 1 });
    res.json({ success: true, students });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
