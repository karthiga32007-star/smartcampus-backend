const express = require("express");
const router = express.Router();
const Attendance = require("../models/Attendance");
const TransportRegistration = require("../models/TransportRegistration");
const Bus = require("../models/Bus");
const Notification = require("../models/Notification");
const StudentProfile = require("../models/StudentProfile");
const ParentProfile = require("../models/ParentProfile");
const User = require("../models/User");
const { authenticateUser, requireRole } = require("../middleware/auth");
const { emitToUser, emitToBus } = require("../sockets");
const { notifyStudentBoarded, notifyStudentDropped } = require("../services/emailService");

const todayStr = () => new Date().toISOString().slice(0, 10);
const hhmm = () => {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};

/**
 * Get passenger list / manifest with today's attendance for a bus
 */
router.get("/today", authenticateUser, async (req, res, next) => {
  try {
    const { busId, direction } = req.query;
    const date = todayStr();
    const dir = (direction || "MORNING").toUpperCase();

    const query = { status: "Approved" };
    if (busId) query.assignedBus = busId;

    const riders = await TransportRegistration.find(query)
      .populate("pickupStop")
      .populate("dropStop")
      .populate("user", "name email phone avatar")
      .sort({ assignedSeat: 1 });

    const attendanceRecords = await Attendance.find({
      date,
      direction: dir,
      ...(busId ? { bus: busId } : {}),
    });

    const statusMap = {};
    attendanceRecords.forEach((a) => {
      statusMap[a.registration.toString()] = {
        status: a.status,
        markedAt: a.markedAt,
      };
    });

    const manifest = riders.map((r) => {
      const att = statusMap[r._id.toString()];
      return {
        registrationId: r._id,
        personId: r.personId,
        name: r.personName,
        seat: r.assignedSeat || "—",
        pickupStop: r.pickupStop?.name || "—",
        pickupStopId: r.pickupStop?._id,
        dropStop: r.dropStop?.name || "—",
        dropStopId: r.dropStop?._id,
        phone: r.phone,
        status: att ? att.status : "Scheduled",
        markedAt: att ? att.markedAt : null,
      };
    });

    res.json({
      success: true,
      date,
      direction: dir,
      records: attendanceRecords,
      manifest,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Driver marks passenger attendance (BOARDED, DROPPED, ABSENT)
 */
router.post("/mark", authenticateUser, requireRole("DRIVER", "TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const { registrationId, busId, stopName, direction, status } = req.body;
    const date = todayStr();
    const time = hhmm();
    const dir = (direction || "MORNING").toUpperCase();

    if (!registrationId || !status) {
      return res.status(400).json({ success: false, message: "Registration ID and status are required." });
    }

    const reg = await TransportRegistration.findById(registrationId)
      .populate("user")
      .populate("pickupStop")
      .populate("dropStop");

    if (!reg) return res.status(404).json({ success: false, message: "Registration record not found." });

    const bus = await Bus.findById(busId || reg.assignedBus);

    // Upsert attendance record atomically to prevent duplicate marks
    const att = await Attendance.findOneAndUpdate(
      { registration: reg._id, date, direction: dir },
      {
        student: reg.user._id,
        personId: reg.personId,
        studentName: reg.personName,
        bus: bus?._id || reg.assignedBus,
        stopName: stopName || (dir === "MORNING" ? reg.pickupStop?.name : reg.dropStop?.name) || "",
        status,
        markedAt: time,
        markedBy: req.user._id,
      },
      { upsert: true, new: true }
    );

    // Socket.IO event to student & bus
    emitToUser(reg.user._id.toString(), "attendance:marked", {
      status,
      time,
      direction: dir,
      stopName: att.stopName,
    });
    if (bus) {
      emitToBus(bus._id.toString(), "attendance:updated", {
        registrationId: reg._id,
        status,
        time,
      });
    }

    // In-app Notification to student
    await Notification.create({
      recipient: reg.user._id,
      recipientTag: reg.personId,
      title: `Boarding Status: ${status}`,
      message: `${reg.personName} marked as ${status} at ${att.stopName} (${time}).`,
      type: status === "ABSENT" ? "WARNING" : "SUCCESS",
      category: status === "BOARDED" ? "board" : status === "DROPPED" ? "drop" : "info",
    });

    // Notify Parent: Find linked parent
    const studentProfile = await StudentProfile.findOne({ user: reg.user._id }).populate("parentUser");
    const parentUser = studentProfile?.parentUser;

    if (parentUser) {
      // In-app Notification to parent
      const parentNotif = await Notification.create({
        recipient: parentUser._id,
        recipientTag: `parent:${reg.personId}`,
        title: `Ward ${status === "BOARDED" ? "Boarded Bus" : status === "DROPPED" ? "Alighted from Bus" : "Marked Absent"}`,
        message: `${reg.personName} was marked ${status} on Bus ${bus?.busNumber || ""} at ${att.stopName} (${time}).`,
        type: status === "ABSENT" ? "ALERT" : "SUCCESS",
        category: status === "BOARDED" ? "board" : status === "DROPPED" ? "drop" : "info",
      });
      emitToUser(parentUser._id.toString(), "notification:new", parentNotif);

      // Email Parent via EmailJS
      if (parentUser.email) {
        if (status === "BOARDED") {
          notifyStudentBoarded({
            toEmail: parentUser.email,
            parentName: parentUser.name,
            studentName: reg.personName,
            busNumber: bus?.busNumber || "NEC",
            stopName: att.stopName,
            time,
          }).catch(console.error);
        } else if (status === "DROPPED") {
          notifyStudentDropped({
            toEmail: parentUser.email,
            parentName: parentUser.name,
            studentName: reg.personName,
            busNumber: bus?.busNumber || "NEC",
            stopName: att.stopName,
            time,
          }).catch(console.error);
        }
      }
    }

    res.json({
      success: true,
      message: `Passenger marked ${status}.`,
      attendance: att,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Get attendance history for the authenticated user or linked child
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

    const records = await Attendance.find({ student: targetUserId }).sort({ date: -1, createdAt: -1 }).limit(30);

    res.json({ success: true, records });
  } catch (err) {
    next(err);
  }
});

/**
 * Daily attendance summary report
 */
router.get("/reports/daily", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const date = req.query.date || todayStr();

    const attendance = await Attendance.find({ date });
    const buses = await Bus.find().populate("assignedRoute");

    const report = buses.map((b) => {
      const busAtt = attendance.filter((a) => a.bus && a.bus.toString() === b._id.toString());
      const boarded = busAtt.filter((a) => a.status === "BOARDED").length;
      const dropped = busAtt.filter((a) => a.status === "DROPPED").length;
      const absent = busAtt.filter((a) => a.status === "ABSENT").length;

      return {
        busNumber: b.busNumber,
        route: b.assignedRoute?.name || "Unassigned",
        capacity: b.capacity,
        boarded,
        dropped,
        absent,
      };
    });

    res.json({ success: true, date, report });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
