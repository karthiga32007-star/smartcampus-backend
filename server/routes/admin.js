const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Bus = require("../models/Bus");
const Route = require("../models/Route");
const Driver = require("../models/Driver");
const TransportRegistration = require("../models/TransportRegistration");
const Trip = require("../models/Trip");
const Attendance = require("../models/Attendance");
const Complaint = require("../models/Complaint");
const Maintenance = require("../models/Maintenance");
const SpecialBusRequest = require("../models/SpecialBusRequest");
const AuditLog = require("../models/AuditLog");
const SystemSetting = require("../models/SystemSetting");
const RegistrationRequest = require("../models/RegistrationRequest");
const StudentProfile = require("../models/StudentProfile");
const FacultyProfile = require("../models/FacultyProfile");
const ParentProfile = require("../models/ParentProfile");
const emailService = require("../services/emailService");
const { emitToRole } = require("../sockets");
const { authenticateUser, requireAdmin } = require("../middleware/auth");

/**
 * Real MongoDB Analytics & Dashboard KPIs
 */
router.get("/dashboard", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const todayStr = new Date().toISOString().slice(0, 10);

    const [
      totalUsers,
      totalStudents,
      totalFaculty,
      totalBuses,
      activeBuses,
      totalDrivers,
      activeDrivers,
      approvedRiders,
      pendingRegistrations,
      pendingAccountRequests,
      openComplaints,
      openMaintenance,
      pendingSpecialRequests,
      runningTrips,
      todayAttendanceCount,
      allRoutes,
      allBuses,
      allRegs,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "STUDENT" }),
      User.countDocuments({ role: "FACULTY" }),
      Bus.countDocuments(),
      Bus.countDocuments({ status: "Active" }),
      Driver.countDocuments(),
      Driver.countDocuments({ status: "Active" }),
      TransportRegistration.countDocuments({ status: "Approved" }),
      TransportRegistration.countDocuments({
        $or: [{ status: "Pending" }, { "changeRequest.route": { $ne: null } }],
      }),
      RegistrationRequest.countDocuments({ status: "PENDING" }),
      Complaint.countDocuments({ status: { $in: ["OPEN", "IN_REVIEW"] } }),
      Maintenance.countDocuments({ status: { $ne: "COMPLETED" } }),
      SpecialBusRequest.countDocuments({ status: "PENDING" }),
      Trip.countDocuments({ date: todayStr, status: "RUNNING" }),
      Attendance.countDocuments({ date: todayStr, status: "BOARDED" }),
      Route.find({ isActive: true }).select("_id name code fee"),
      Bus.find({ status: { $in: ["Active", "Breakdown", "Emergency"] } }),
      TransportRegistration.find({ status: "Approved" }).select("route assignedBus assignedSeat"),
    ]);

    const totalSeats = allBuses.reduce((sum, b) => sum + b.capacity, 0);
    const availableSeats = Math.max(0, totalSeats - approvedRiders);

    // Calculate real seat occupancy breakdown by route
    const routeOccupancy = allRoutes.map((rt) => {
      const routeBuses = allBuses.filter((b) => b.assignedRoute && b.assignedRoute.toString() === rt._id.toString());
      const capacity = routeBuses.reduce((sum, b) => sum + b.capacity, 0);
      const riders = allRegs.filter((r) => r.route && r.route.toString() === rt._id.toString()).length;
      const rate = capacity ? Math.round((riders / capacity) * 100) : 0;
      return {
        routeId: rt._id,
        code: rt.code,
        name: rt.name,
        capacity,
        riders,
        freeSeats: Math.max(0, capacity - riders),
        occupancyRate: rate,
      };
    });

    res.json({
      success: true,
      kpis: {
        totalUsers,
        totalStudents,
        totalFaculty,
        activeBuses: `${activeBuses} / ${totalBuses}`,
        totalBuses,
        busesOnTrip: runningTrips,
        totalDrivers,
        activeDrivers,
        registeredRiders: approvedRiders,
        pendingRegistrations,
        pendingAccountRequests,
        availableSeats,
        totalSeats,
        openComplaints,
        openMaintenance,
        pendingSpecialRequests,
        todayBoarded: todayAttendanceCount,
      },
      routeOccupancy,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Administrative Audit Log
 */
router.get("/audit-log", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(50);
    res.json({ success: true, logs });
  } catch (err) {
    next(err);
  }
});

/**
 * System Settings
 */
router.get("/settings", authenticateUser, async (req, res, next) => {
  try {
    const settings = await SystemSetting.find();
    const map = {};
    settings.forEach((s) => {
      map[s.key] = s.value;
    });
    res.json({ success: true, settings: map });
  } catch (err) {
    next(err);
  }
});

router.put("/settings", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ success: false, message: "Setting key is required." });

    const setting = await SystemSetting.findOneAndUpdate(
      { key },
      { key, value },
      { upsert: true, new: true }
    );

    await AuditLog.create({
      actor: req.user._id,
      actorName: req.user.name,
      actorRole: req.user.role,
      action: "SETTING_UPDATED",
      entityType: "SystemSetting",
      entityId: key,
      metadata: { key, value },
    });

    res.json({ success: true, message: `Setting ${key} updated.`, setting });
  } catch (err) {
    next(err);
  }
});

/**
 * List all User Registration Requests (with optional status filter)
 */
router.get("/registration-requests", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status && status !== "ALL") {
      filter.status = status.toUpperCase();
    }
    const requests = await RegistrationRequest.find(filter)
      .populate("reviewedBy", "name email")
      .sort({ submittedAt: -1 });

    const counts = {
      pending: await RegistrationRequest.countDocuments({ status: "PENDING" }),
      approved: await RegistrationRequest.countDocuments({ status: "APPROVED" }),
      rejected: await RegistrationRequest.countDocuments({ status: "REJECTED" }),
      total: await RegistrationRequest.countDocuments(),
    };

    res.json({
      success: true,
      requests,
      counts,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get Single Registration Request Details
 */
router.get("/registration-requests/:id", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const request = await RegistrationRequest.findById(req.params.id).populate("reviewedBy", "name email");
    if (!request) {
      return res.status(404).json({ success: false, message: "Registration request not found." });
    }
    res.json({ success: true, request });
  } catch (err) {
    next(err);
  }
});

/**
 * Approve a Registration Request & Activate User Account
 */
router.post("/registration-requests/:id/approve", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const request = await RegistrationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Registration request not found." });
    }
    if (request.status === "APPROVED") {
      return res.status(400).json({ success: false, message: "This request has already been approved." });
    }

    // Find or create User in MongoDB
    let user = await User.findOne({ email: request.email });
    if (!user) {
      user = new User({
        email: request.email,
        name: request.name,
        role: request.requestedRole,
        status: "Active",
        googleId: request.googleId || undefined,
        avatar: request.avatar || undefined,
        phone: request.phone || "",
      });
    } else {
      user.name = request.name || user.name;
      user.role = request.requestedRole;
      user.status = "Active";
      if (request.googleId) user.googleId = request.googleId;
      if (request.avatar) user.avatar = request.avatar;
      if (request.phone) user.phone = request.phone;
    }
    await user.save();

    // Create / update Role-Specific Profile
    if (request.requestedRole === "STUDENT") {
      const studentId = request.registerNumber || `STU-${Date.now().toString().slice(-6)}`;
      await StudentProfile.findOneAndUpdate(
        { user: user._id },
        {
          user: user._id,
          studentId,
          department: request.department || "Computer Science & Engineering",
          year: request.year || "3rd Year",
          section: request.section || "A",
          emergencyContact: request.emergencyContact || "",
        },
        { upsert: true, new: true }
      );
    } else if (request.requestedRole === "FACULTY") {
      const employeeId = request.employeeId || `FAC-${Date.now().toString().slice(-6)}`;
      await FacultyProfile.findOneAndUpdate(
        { user: user._id },
        {
          user: user._id,
          employeeId,
          department: request.department || "Engineering Faculty",
          designation: request.designation || "Assistant Professor",
          emergencyContact: request.emergencyContact || "",
        },
        { upsert: true, new: true }
      );
    } else if (request.requestedRole === "PARENT") {
      await ParentProfile.findOneAndUpdate(
        { user: user._id },
        {
          user: user._id,
          emergencyContact: request.emergencyContact || "",
          studentIds: request.studentIds || [],
        },
        { upsert: true, new: true }
      );
    }

    // Update RegistrationRequest record
    request.status = "APPROVED";
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    // Audit Log
    try {
      await AuditLog.create({
        actor: req.user._id,
        actorName: req.user.name,
        actorRole: req.user.role,
        action: "REGISTRATION_REQUEST_APPROVED",
        details: `Approved registration for ${request.email} as ${request.requestedRole}`,
        entityType: "RegistrationRequest",
        entityId: request._id.toString(),
      });
    } catch (auditErr) {
      console.warn("Failed to create audit log:", auditErr.message);
    }

    // Real-Time Socket Event
    emitToRole("admin", "registration:approved", {
      requestId: request._id,
      email: request.email,
      role: request.requestedRole,
      approvedAt: request.reviewedAt,
    });

    // Send Approval Email
    emailService
      .notifyAccountApproved({
        toEmail: request.email,
        name: request.name,
        role: request.requestedRole,
      })
      .catch((e) => console.error("Email approval dispatch error:", e.message));

    res.json({
      success: true,
      message: `Registration approved successfully. Account activated for ${request.name} (${request.requestedRole}).`,
      user: user.toSafeObject(),
      request,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Reject a Registration Request with Institutional Reason
 */
router.post("/registration-requests/:id/reject", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const request = await RegistrationRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ success: false, message: "Registration request not found." });
    }

    request.status = "REJECTED";
    request.rejectionReason = reason || "Application details could not be verified by the Transport Office.";
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    // Audit Log
    try {
      await AuditLog.create({
        actor: req.user._id,
        actorName: req.user.name,
        actorRole: req.user.role,
        action: "REGISTRATION_REQUEST_REJECTED",
        details: `Rejected registration for ${request.email}: ${request.rejectionReason}`,
        entityType: "RegistrationRequest",
        entityId: request._id.toString(),
      });
    } catch (auditErr) {
      console.warn("Failed to create audit log:", auditErr.message);
    }

    // Real-Time Socket Event
    emitToRole("admin", "registration:rejected", {
      requestId: request._id,
      email: request.email,
      reason: request.rejectionReason,
    });

    // Send Rejection Email
    emailService
      .notifyAccountRejected({
        toEmail: request.email,
        name: request.name,
        reason: request.rejectionReason,
      })
      .catch((e) => console.error("Email rejection dispatch error:", e.message));

    res.json({
      success: true,
      message: "Registration request rejected.",
      request,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
