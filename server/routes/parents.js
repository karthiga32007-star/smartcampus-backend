const express = require("express");
const router = express.Router();
const ParentProfile = require("../models/ParentProfile");
const StudentProfile = require("../models/StudentProfile");
const TransportRegistration = require("../models/TransportRegistration");
const Trip = require("../models/Trip");
const Attendance = require("../models/Attendance");
const { authenticateUser, requireRole } = require("../middleware/auth");

/**
 * Get linked child info and transport status for parent
 */
router.get("/child", authenticateUser, requireRole("PARENT", "TRANSPORT_ADMIN"), async (req, res, next) => {
  try {
    let parentProfile = await ParentProfile.findOne({ user: req.user._id }).populate({
      path: "students",
      populate: { path: "user", select: "name email avatar phone" },
    });

    if (!parentProfile || !parentProfile.students || parentProfile.students.length === 0) {
      // Check if student profile lists this user as parent
      const linkedStudent = await StudentProfile.findOne({ parentUser: req.user._id }).populate(
        "user",
        "name email avatar phone"
      );

      if (linkedStudent) {
        if (!parentProfile) {
          parentProfile = await ParentProfile.create({
            user: req.user._id,
            students: [linkedStudent._id],
            studentIds: [linkedStudent.studentId],
          });
        } else {
          parentProfile.students = [linkedStudent._id];
          parentProfile.studentIds = [linkedStudent.studentId];
          await parentProfile.save();
        }
      }
    }

    // Default to first child
    const child = parentProfile?.students?.[0];
    if (!child) {
      return res.json({
        success: true,
        child: null,
        registration: null,
        message: "No student linked to this parent account yet.",
      });
    }

    // Retrieve active registration for child
    const registration = await TransportRegistration.findOne({
      $or: [{ user: child.user?._id }, { personId: child.studentId }],
      status: "Approved",
    })
      .populate("route")
      .populate("pickupStop")
      .populate("dropStop")
      .populate({
        path: "assignedBus",
        populate: { path: "assignedDriver" },
      });

    // Check today's boarding and drop status
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayAttendance = await Attendance.find({
      student: child.user?._id,
      date: todayStr,
    });

    const morningStatus = todayAttendance.find((a) => a.direction === "MORNING")?.status || "Scheduled";
    const eveningStatus = todayAttendance.find((a) => a.direction === "EVENING")?.status || "Scheduled";

    res.json({
      success: true,
      child: {
        studentId: child.studentId,
        name: child.user?.name || "Student",
        email: child.user?.email,
        department: child.department,
        year: child.year,
        avatar: child.user?.avatar,
      },
      registration,
      attendanceToday: {
        morning: morningStatus,
        evening: eveningStatus,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Parent links child by Register Number / Student ID
 */
router.post("/link-child", authenticateUser, requireRole("PARENT", "TRANSPORT_ADMIN"), async (req, res, next) => {
  try {
    const { studentId } = req.body;
    if (!studentId) {
      return res.status(400).json({ success: false, message: "Student ID / Register number is required." });
    }

    const studentProfile = await StudentProfile.findOne({ studentId: studentId.trim() }).populate("user");
    if (!studentProfile) {
      return res.status(404).json({ success: false, message: "Student record with this ID was not found." });
    }

    studentProfile.parentUser = req.user._id;
    await studentProfile.save();

    let parentProfile = await ParentProfile.findOne({ user: req.user._id });
    if (!parentProfile) {
      parentProfile = new ParentProfile({
        user: req.user._id,
        students: [studentProfile._id],
        studentIds: [studentProfile.studentId],
      });
    } else {
      if (!parentProfile.studentIds.includes(studentProfile.studentId)) {
        parentProfile.students.push(studentProfile._id);
        parentProfile.studentIds.push(studentProfile.studentId);
      }
    }
    await parentProfile.save();

    res.json({
      success: true,
      message: `Successfully linked ${studentProfile.user?.name || studentId} to your account.`,
      child: studentProfile,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
