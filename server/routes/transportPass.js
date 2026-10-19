const express = require("express");
const router = express.Router();
const TransportPass = require("../models/TransportPass");
const ParentProfile = require("../models/ParentProfile");
const { authenticateUser } = require("../middleware/auth");

/**
 * Get active digital transport pass for authenticated user or linked child
 */
router.get("/my", authenticateUser, async (req, res, next) => {
  try {
    let targetUserId = req.user._id;

    if (req.user.role === "PARENT") {
      const parentProfile = await ParentProfile.findOne({ user: req.user._id }).populate("students");
      if (parentProfile?.students?.[0]) {
        targetUserId = parentProfile.students[0].user;
      }
    }

    const pass = await TransportPass.findOne({ user: targetUserId, status: "ACTIVE" });

    res.json({
      success: true,
      pass: pass || null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Secure QR Verification Endpoint (Publicly Verifiable by Bus Driver / Gate Attendant)
 * Returns strictly sanitized details, no internal tokens or private info.
 */
router.get("/verify/:token", async (req, res, next) => {
  try {
    const { token } = req.params;

    const pass = await TransportPass.findOne({ verificationToken: token });

    if (!pass) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: "Invalid or forged transport pass token.",
        code: "INVALID_PASS",
      });
    }

    const isExpired = new Date(pass.validUntil) < new Date();
    const isValid = pass.status === "ACTIVE" && !isExpired;

    res.json({
      success: true,
      valid: isValid,
      passNumber: pass.passNumber,
      holderName: pass.holderName,
      holderType: pass.holderType,
      personId: pass.personId,
      department: pass.department,
      routeName: pass.routeName,
      pickupStopName: pass.pickupStopName,
      dropStopName: pass.dropStopName,
      busNumber: pass.busNumber,
      seatNumber: pass.seatNumber,
      academicYear: pass.academicYear,
      validUntil: pass.validUntil,
      status: isExpired ? "EXPIRED" : pass.status,
      verifiedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
