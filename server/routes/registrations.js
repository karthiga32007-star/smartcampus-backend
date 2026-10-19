const express = require("express");
const router = express.Router();
const TransportRegistration = require("../models/TransportRegistration");
const Route = require("../models/Route");
const Stop = require("../models/Stop");
const Bus = require("../models/Bus");
const TransportPass = require("../models/TransportPass");
const Notification = require("../models/Notification");
const AuditLog = require("../models/AuditLog");
const StudentProfile = require("../models/StudentProfile");
const FacultyProfile = require("../models/FacultyProfile");
const { allocateSeat } = require("../services/seatAllocationService");
const { notifyRegistrationApproved, notifyRegistrationRejected } = require("../services/emailService");
const { authenticateUser, requireAdmin } = require("../middleware/auth");
const { emitToUser, emitToRole } = require("../sockets");

/**
 * Get current authenticated user's registration
 */
router.get("/my", authenticateUser, async (req, res, next) => {
  try {
    const reg = await TransportRegistration.findOne({ user: req.user._id })
      .populate("route")
      .populate("pickupStop")
      .populate("dropStop")
      .populate({
        path: "assignedBus",
        populate: { path: "assignedDriver" },
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, registration: reg || null });
  } catch (err) {
    next(err);
  }
});

/**
 * Submit transport registration
 */
router.post("/", authenticateUser, async (req, res, next) => {
  try {
    const { routeId, pickupStopId, dropoffStopId } = req.body;

    if (!routeId || !pickupStopId || !dropoffStopId) {
      return res.status(400).json({
        success: false,
        message: "Route, morning pickup stop, and evening drop-off stop are all required.",
        code: "FIELDS_REQUIRED",
      });
    }

    const route = await Route.findById(routeId).populate("stops.stop");
    if (!route || !route.isActive) {
      return res.status(404).json({ success: false, message: "Selected route is inactive or does not exist." });
    }

    // Verify stops belong to route
    const stopIdsOnRoute = route.stops.map((s) => s.stop._id.toString());
    if (!stopIdsOnRoute.includes(pickupStopId) || !stopIdsOnRoute.includes(dropoffStopId)) {
      return res.status(400).json({
        success: false,
        message: "The selected pickup and drop-off stops must belong to the chosen route.",
        code: "INVALID_STOPS_FOR_ROUTE",
      });
    }

    // Check if user already has an active or pending registration
    let existing = await TransportRegistration.findOne({
      user: req.user._id,
      status: { $in: ["Pending", "Approved"] },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: `You already have an existing ${existing.status.toLowerCase()} transport registration.`,
        code: "REGISTRATION_ALREADY_EXISTS",
      });
    }

    // Lookup user personId and department
    let personId = req.user._id.toString().slice(-6).toUpperCase();
    let department = "NEC";
    let applicantType = req.user.role === "FACULTY" ? "Faculty" : "Student";

    if (req.user.role === "STUDENT") {
      const sp = await StudentProfile.findOne({ user: req.user._id });
      if (sp) {
        personId = sp.studentId;
        department = sp.department;
      }
    } else if (req.user.role === "FACULTY") {
      const fp = await FacultyProfile.findOne({ user: req.user._id });
      if (fp) {
        personId = fp.employeeId;
        department = fp.department;
      }
    }

    const count = await TransportRegistration.countDocuments();
    const regCode = `REG-${1000 + count + 1}`;

    const reg = await TransportRegistration.create({
      regCode,
      user: req.user._id,
      personId,
      personName: req.user.name,
      applicantType,
      department,
      phone: req.user.phone || "",
      route: route._id,
      pickupStop: pickupStopId,
      dropStop: dropoffStopId,
      status: "Pending",
    });

    // Notify admins
    const notif = await Notification.create({
      recipientTag: "role:admin",
      title: "New Transport Application",
      message: `${req.user.name} (${applicantType}) submitted an application for ${route.name}.`,
      type: "INFO",
      category: "registration",
    });
    emitToRole("admin", "notification:new", notif);

    res.status(201).json({
      success: true,
      message: "Transport registration submitted. Awaiting admin approval.",
      registration: reg,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin view all registrations
 */
router.get("/", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { status, routeId, search } = req.query;
    const query = {};

    if (status && status !== "All") query.status = status;
    if (routeId) query.route = routeId;
    if (search) {
      query.$or = [
        { personName: { $regex: search, $options: "i" } },
        { personId: { $regex: search, $options: "i" } },
        { regCode: { $regex: search, $options: "i" } },
      ];
    }

    const registrations = await TransportRegistration.find(query)
      .populate("route")
      .populate("pickupStop")
      .populate("dropStop")
      .populate({
        path: "assignedBus",
        populate: { path: "assignedDriver" },
      })
      .sort({ createdAt: -1 });

    res.json({ success: true, registrations });
  } catch (err) {
    next(err);
  }
});

/**
 * Admin Approve / Reject registration
 */
router.post("/decide", authenticateUser, requireAdmin, async (req, res, next) => {
  try {
    const { registrationId, approved, busId, rejectionReason } = req.body;

    const reg = await TransportRegistration.findById(registrationId)
      .populate("user")
      .populate("route")
      .populate("pickupStop")
      .populate("dropStop");

    if (!reg) return res.status(404).json({ success: false, message: "Registration not found." });

    if (approved) {
      // Find candidate bus: either explicitly requested or first active bus on this route with free seats
      let targetBusId = busId;
      if (!targetBusId) {
        const routeBuses = await Bus.find({ assignedRoute: reg.route._id, status: "Active" });
        if (!routeBuses.length) {
          return res.status(400).json({
            success: false,
            message: `No active bus is currently assigned to route ${reg.route.name}. Assign a bus to the route first.`,
            code: "NO_BUS_ON_ROUTE",
          });
        }
        targetBusId = routeBuses[0]._id;
      }

      // Automatically allocate the first available seat on this bus
      const seat = await allocateSeat(targetBusId);
      const bus = await Bus.findById(targetBusId);

      reg.status = "Approved";
      reg.assignedBus = bus._id;
      reg.assignedSeat = seat;
      reg.rejectionReason = "";

      // If this was an approved change request, apply change data
      if (reg.changeRequest && reg.changeRequest.route) {
        reg.route = reg.changeRequest.route;
        reg.pickupStop = reg.changeRequest.pickupStop;
        reg.dropStop = reg.changeRequest.dropStop;
        reg.changeRequest = undefined;
      }

      await reg.save();

      // Generate or update Digital Transport Pass
      const passNumber = `NEC-PASS-${new Date().getFullYear()}-${reg.personId}`;
      await TransportPass.findOneAndUpdate(
        { user: reg.user._id },
        {
          passNumber,
          user: reg.user._id,
          registration: reg._id,
          personId: reg.personId,
          holderName: reg.personName,
          holderType: reg.applicantType,
          department: reg.department,
          routeName: reg.route.name,
          pickupStopName: reg.pickupStop.name,
          dropStopName: reg.dropStop.name,
          busNumber: bus.busNumber,
          seatNumber: seat,
          status: "ACTIVE",
        },
        { upsert: true, new: true }
      );

      // In-app Notification
      const notif = await Notification.create({
        recipient: reg.user._id,
        recipientTag: reg.personId,
        title: "Transport Approved!",
        message: `Your registration for ${reg.route.name} is approved. Bus: ${bus.busNumber}, Seat: ${seat}.`,
        type: "SUCCESS",
        category: "registration",
      });
      emitToUser(reg.user._id.toString(), "notification:new", notif);

      // Email Notification (via EmailJS)
      notifyRegistrationApproved({
        toEmail: reg.user.email,
        name: reg.personName,
        routeName: reg.route.name,
        busNumber: bus.busNumber,
        seatNumber: seat,
      }).catch(console.error);

      // Audit Log
      await AuditLog.create({
        actor: req.user._id,
        actorName: req.user.name,
        actorRole: req.user.role,
        action: "REGISTRATION_APPROVED",
        entityType: "TransportRegistration",
        entityId: reg._id.toString(),
        metadata: { busNumber: bus.busNumber, seatNumber: seat, personId: reg.personId },
      });

      res.json({
        success: true,
        message: `Approved: ${reg.personName} allotted Bus ${bus.busNumber}, Seat ${seat}.`,
        registration: reg,
      });
    } else {
      // Rejection
      reg.status = "Rejected";
      reg.rejectionReason = rejectionReason || "Capacity reached on requested route.";
      reg.assignedBus = null;
      reg.assignedSeat = null;
      await reg.save();

      // Deactivate pass if one existed
      await TransportPass.findOneAndUpdate({ user: reg.user._id }, { status: "SUSPENDED" });

      const notif = await Notification.create({
        recipient: reg.user._id,
        recipientTag: reg.personId,
        title: "Registration Rejected",
        message: `Your transport request was not approved. Reason: ${reg.rejectionReason}`,
        type: "ALERT",
        category: "registration",
      });
      emitToUser(reg.user._id.toString(), "notification:new", notif);

      notifyRegistrationRejected({
        toEmail: reg.user.email,
        name: reg.personName,
        reason: reg.rejectionReason,
      }).catch(console.error);

      res.json({
        success: true,
        message: `Registration for ${reg.personName} rejected.`,
        registration: reg,
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * Request change of pickup / drop-off stop
 */
router.post("/request-change", authenticateUser, async (req, res, next) => {
  try {
    const { routeId, pickupStopId, dropoffStopId } = req.body;
    const reg = await TransportRegistration.findOne({ user: req.user._id, status: "Approved" });

    if (!reg) {
      return res.status(400).json({ success: false, message: "No active approved registration found to change." });
    }

    reg.changeRequest = {
      route: routeId,
      pickupStop: pickupStopId,
      dropStop: dropoffStopId,
      requestedAt: new Date(),
    };
    await reg.save();

    res.json({
      success: true,
      message: "Stop change request submitted for transport office review.",
      registration: reg,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Withdraw stop change request
 */
router.post("/cancel-change", authenticateUser, async (req, res, next) => {
  try {
    const reg = await TransportRegistration.findOne({ user: req.user._id, status: "Approved" });
    if (reg) {
      reg.changeRequest = undefined;
      await reg.save();
    }
    res.json({ success: true, message: "Change request cancelled." });
  } catch (err) {
    next(err);
  }
});

/**
 * Cancel active registration
 */
router.post("/cancel", authenticateUser, async (req, res, next) => {
  try {
    const reg = await TransportRegistration.findOne({ user: req.user._id });
    if (!reg) return res.status(404).json({ success: false, message: "Registration not found." });

    reg.status = "Cancelled";
    reg.assignedSeat = null;
    await reg.save();

    await TransportPass.findOneAndUpdate({ user: req.user._id }, { status: "SUSPENDED" });

    res.json({ success: true, message: "Transport registration cancelled." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
