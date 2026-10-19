const express = require("express");
const router = express.Router();
const TransportRegistration = require("../models/TransportRegistration");
const Bus = require("../models/Bus");
const Route = require("../models/Route");
const Attendance = require("../models/Attendance");
const Complaint = require("../models/Complaint");
const { authenticateUser, requireRole } = require("../middleware/auth");

const toCSV = (headers, rows) => {
  const headerLine = headers.join(",");
  const dataLines = rows.map((row) =>
    row.map((val) => `"${String(val !== null && val !== undefined ? val : "").replace(/"/g, '""')}"`).join(",")
  );
  return [headerLine, ...dataLines].join("\n");
};

/**
 * Download Transport Registrations CSV Report
 */
router.get("/registrations/csv", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const regs = await TransportRegistration.find()
      .populate("route", "name code")
      .populate("pickupStop", "name")
      .populate("dropStop", "name")
      .populate("assignedBus", "busNumber");

    const headers = ["Reg Code", "ID", "Name", "Type", "Department", "Phone", "Route", "Pickup Stop", "Drop Stop", "Bus", "Seat", "Status"];
    const rows = regs.map((r) => [
      r.regCode || "",
      r.personId || "",
      r.personName || "",
      r.applicantType || "",
      r.department || "",
      r.phone || "",
      r.route?.name || "",
      r.pickupStop?.name || "",
      r.dropStop?.name || "",
      r.assignedBus?.busNumber || "Unassigned",
      r.assignedSeat || "—",
      r.status || "",
    ]);

    const csvData = toCSV(headers, rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="SmartMove_Registrations.csv"');
    res.send(csvData);
  } catch (err) {
    next(err);
  }
});

/**
 * Download Fleet Utilization CSV Report
 */
router.get("/fleet/csv", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const buses = await Bus.find().populate("assignedRoute", "name").populate("assignedDriver", "name phone");

    const headers = ["Bus Number", "Reg No", "Capacity", "Status", "Assigned Route", "Driver", "Driver Phone"];
    const rows = buses.map((b) => [
      b.busNumber,
      b.registrationNumber,
      b.capacity,
      b.status,
      b.assignedRoute?.name || "Unassigned",
      b.assignedDriver?.name || "Unassigned",
      b.assignedDriver?.phone || "—",
    ]);

    const csvData = toCSV(headers, rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="SmartMove_Fleet_Report.csv"');
    res.send(csvData);
  } catch (err) {
    next(err);
  }
});

/**
 * Download Attendance CSV Report
 */
router.get("/attendance/csv", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const records = await Attendance.find({ date }).populate("bus", "busNumber");

    const headers = ["Date", "Direction", "ID", "Student Name", "Bus", "Stop", "Status", "Marked Time"];
    const rows = records.map((a) => [
      a.date,
      a.direction,
      a.personId,
      a.studentName,
      a.bus?.busNumber || "",
      a.stopName || "",
      a.status,
      a.markedAt,
    ]);

    const csvData = toCSV(headers, rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="SmartMove_Attendance_${date}.csv"`);
    res.send(csvData);
  } catch (err) {
    next(err);
  }
});

/**
 * Download Complaints CSV Report
 */
router.get("/complaints/csv", authenticateUser, requireRole("TRANSPORT_ADMIN", "TRANSPORT_STAFF"), async (req, res, next) => {
  try {
    const complaints = await Complaint.find().populate("route", "name");

    const headers = ["Ticket ID", "Complainant", "Category", "Route", "Priority", "Status", "Description", "Admin Response", "Date"];
    const rows = complaints.map((c) => [
      c.ticketId,
      c.userName,
      c.category,
      c.routeName || c.route?.name || "—",
      c.priority,
      c.status,
      c.description,
      c.adminResponse || "—",
      new Date(c.createdAt).toLocaleDateString("en-IN"),
    ]);

    const csvData = toCSV(headers, rows);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="SmartMove_Complaints_Report.csv"');
    res.send(csvData);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
