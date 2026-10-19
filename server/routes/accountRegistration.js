const express = require("express");
const router = express.Router();
const RegistrationRequest = require("../models/RegistrationRequest");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const authService = require("../services/authService");
const emailService = require("../services/emailService");
const { emitToRole } = require("../sockets");
const jwt = require("jsonwebtoken");
const config = require("../config");

/**
 * Public User Self-Registration Endpoint.
 * Supports verified Google accounts (via signed regToken) and standard onboarding.
 * Strictly limits allowed roles to STUDENT, FACULTY, PARENT.
 */
router.post("/submit", async (req, res, next) => {
  try {
    const {
      regToken,
      requestedRole,
      phone,
      registerNumber,
      department,
      year,
      section,
      employeeId,
      designation,
      studentIds,
      emergencyContact,
      address,
      notes,
    } = req.body;

    let email = req.body.email;
    let name = req.body.name;
    let googleId = null;
    let avatar = null;
    let profileImage = null;

    // If signed Google registration token is supplied, verify it
    if (regToken) {
      const verified = authService.verifyRegistrationToken(regToken);
      if (verified) {
        email = verified.email;
        name = verified.name || name;
        googleId = verified.googleId;
        avatar = verified.avatar;
      }
    }

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email address is required.",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Full name is required.",
      });
    }

    // STRICT ROLE VALIDATION: Never allow self-registration as ADMIN, STAFF, or DRIVER
    const roleUpper = (requestedRole || "STUDENT").toUpperCase();
    const ALLOWED_ROLES = ["STUDENT", "FACULTY", "PARENT"];

    if (!ALLOWED_ROLES.includes(roleUpper)) {
      return res.status(403).json({
        success: false,
        message: "Administrative and driver roles cannot be self-requested. Please contact the Transport Office.",
        code: "ROLE_NOT_PERMITTED",
      });
    }

    // Check if account already exists in MongoDB User collection
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      const userStatus = (existingUser.status || "ACTIVE").toUpperCase();
      if (userStatus === "ACTIVE") {
        return res.status(409).json({
          success: false,
          message: "An active SmartMove account with this email already exists. Please log in directly.",
          code: "ACCOUNT_EXISTS",
        });
      } else {
        return res.status(409).json({
          success: false,
          message: `An account with this email exists but is currently ${userStatus.toLowerCase()}. Please contact the Transport Office.`,
          code: `ACCOUNT_${userStatus}`,
        });
      }
    }

    // Check if a PENDING registration request already exists
    const existingPending = await RegistrationRequest.findOne({
      email: cleanEmail,
      status: "PENDING",
    });

    if (existingPending) {
      return res.status(409).json({
        success: false,
        message: "A registration request is already under review for this email address. Please check your status.",
        code: "REQUEST_ALREADY_PENDING",
      });
    }

    // Create new RegistrationRequest
    const newRequest = await RegistrationRequest.create({
      googleId: googleId || undefined,
      email: cleanEmail,
      name: name.trim(),
      avatar: avatar || null,
      profileImage: avatar || null,
      requestedRole: roleUpper,
      phone: (phone || "").trim(),
      registerNumber: (registerNumber || "").trim(),
      department: (department || "").trim(),
      year: (year || "").trim(),
      section: (section || "").trim(),
      employeeId: (employeeId || "").trim(),
      designation: (designation || "").trim(),
      studentIds: Array.isArray(studentIds) ? studentIds.filter(Boolean) : [],
      emergencyContact: (emergencyContact || "").trim(),
      address: (address || "").trim(),
      notes: (notes || "").trim(),
      status: "PENDING",
      submittedAt: new Date(),
    });

    // Real-Time Socket.IO Notification to Admin
    const eventPayload = {
      requestId: newRequest._id,
      name: newRequest.name,
      email: newRequest.email,
      requestedRole: newRequest.requestedRole,
      department: newRequest.department,
      registerNumber: newRequest.registerNumber,
      employeeId: newRequest.employeeId,
      submittedAt: newRequest.submittedAt,
    };

    emitToRole("admin", "registration:new", eventPayload);
    emitToRole("transport_admin", "registration:new", eventPayload);

    // Audit Log
    try {
      await AuditLog.create({
        actorName: newRequest.name,
        actorRole: newRequest.requestedRole,
        action: "REGISTRATION_REQUEST_SUBMITTED",
        details: `Submitted account registration request for ${newRequest.email} as ${newRequest.requestedRole}`,
        entityType: "RegistrationRequest",
        entityId: newRequest._id.toString(),
      });
    } catch (auditErr) {
      console.warn("Failed to create audit log for registration request:", auditErr.message);
    }

    // Email Notification (Simulated in development, EmailJS in production)
    emailService
      .notifyRegistrationReceived({
        toEmail: cleanEmail,
        name: newRequest.name,
        requestedRole: newRequest.requestedRole,
      })
      .catch((e) => console.error("Email dispatch error:", e.message));

    return res.status(201).json({
      success: true,
      message: "Registration request submitted successfully! Your account is pending Transport Office approval.",
      requestId: newRequest._id,
      request: newRequest,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Public Registration Status Lookup Endpoint.
 * Allows applicants to check if their account has been approved or rejected.
 */
router.get("/status", async (req, res, next) => {
  try {
    const { email } = req.query;

    if (!email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email address query parameter is required.",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if account is already activated in User collection
    const activeUser = await User.findOne({ email: cleanEmail });
    if (activeUser && (activeUser.status === "Active" || activeUser.status === "ACTIVE")) {
      return res.json({
        success: true,
        exists: true,
        status: "APPROVED",
        userActive: true,
        role: activeUser.role,
        message: "Your account is active! You can now log in directly.",
      });
    }

    // Lookup latest RegistrationRequest
    const request = await RegistrationRequest.findOne({ email: cleanEmail }).sort({ submittedAt: -1 });

    if (!request) {
      return res.json({
        success: true,
        exists: false,
        status: "NOT_FOUND",
        message: "No registration request found for this email address.",
      });
    }

    return res.json({
      success: true,
      exists: true,
      status: request.status,
      requestedRole: request.requestedRole,
      name: request.name,
      email: request.email,
      submittedAt: request.submittedAt,
      reviewedAt: request.reviewedAt,
      rejectionReason: request.rejectionReason,
      message:
        request.status === "PENDING"
          ? "Your registration request is currently under review by the Transport Office."
          : request.status === "APPROVED"
          ? "Your account registration has been approved! You can now sign in."
          : `Your registration request was rejected: ${request.rejectionReason || "Please contact the Transport Office."}`,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get registration request details for applicant
 */
router.get("/me", async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let email = req.query.email;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        if (decoded?.email) email = decoded.email;
      } catch (e) {}
    }

    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required." });
    }

    const cleanEmail = email.toLowerCase().trim();
    const reqDoc = await RegistrationRequest.findOne({ email: cleanEmail }).sort({ submittedAt: -1 });

    if (!reqDoc) {
      return res.status(404).json({ success: false, message: "No registration request found." });
    }

    res.json({ success: true, request: reqDoc });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
