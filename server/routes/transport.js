const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateUser, requireAdmin } = require("../middleware/auth");

/**
 * Helper to generate seat labels based on capacity
 */
function getSeatList(capacity) {
  const letters = ["A", "B", "C", "D"];
  return Array.from({ length: capacity }, (_, i) => {
    const row = String(Math.floor(i / 4) + 1).padStart(2, "0");
    const col = letters[i % 4];
    return `${row}${col}`;
  });
}

/**
 * Helper to find the first available seat on a bus
 */
function getFirstFreeSeat(busId) {
  const bus = db.prepare("SELECT capacity FROM buses WHERE id = ?").get(busId);
  if (!bus) return null;

  const takenSeats = new Set(
    db.prepare("SELECT seat FROM transport_registrations WHERE bus_id = ? AND status = 'Approved' AND seat IS NOT NULL")
      .all(busId)
      .map((r) => r.seat)
  );

  const allSeats = getSeatList(bus.capacity);
  return allSeats.find((s) => !takenSeats.has(s)) || null;
}

/**
 * Get current user's transport registration
 */
router.get("/my", authenticateUser, (req, res) => {
  const user = req.user;
  let personId = user.id;

  if (user.role === "PARENT") {
    const parentProfile = db.prepare("SELECT child_student_id FROM parent_profiles WHERE user_id = ?").get(user.id);
    if (parentProfile?.child_student_id) {
      personId = parentProfile.child_student_id;
    }
  } else if (user.role === "STUDENT") {
    const studentProfile = db.prepare("SELECT student_id FROM student_profiles WHERE user_id = ?").get(user.id);
    if (studentProfile?.student_id) {
      personId = studentProfile.student_id;
    }
  } else if (user.role === "STAFF") {
    const staffProfile = db.prepare("SELECT staff_id FROM staff_profiles WHERE user_id = ?").get(user.id);
    if (staffProfile?.staff_id) {
      personId = staffProfile.staff_id;
    }
  }

  // Lookup registration by person_id or user_id
  const reg = db.prepare(`
    SELECT r.*,
           rt.name as route_name, rt.via as route_via, rt.fee as route_fee, rt.arrive as route_arrive, rt.depart as route_depart,
           pk.name as pickup_name, pk.area as pickup_area,
           dp.name as dropoff_name, dp.area as dropoff_area,
           rs_pk.morning_time as pickup_am, rs_dp.evening_time as dropoff_pm,
           b.reg_no as bus_reg,
           d.name as driver_name, d.phone as driver_phone
    FROM transport_registrations r
    JOIN routes rt ON r.route_id = rt.id
    JOIN stops pk ON r.pickup_stop_id = pk.id
    JOIN stops dp ON r.dropoff_stop_id = dp.id
    LEFT JOIN route_stops rs_pk ON (rs_pk.route_id = r.route_id AND rs_pk.stop_id = r.pickup_stop_id)
    LEFT JOIN route_stops rs_dp ON (rs_dp.route_id = r.route_id AND rs_dp.stop_id = r.dropoff_stop_id)
    LEFT JOIN buses b ON r.bus_id = b.id
    LEFT JOIN drivers d ON b.driver_id = d.id
    WHERE r.person_id = ? OR r.user_id = ?
    ORDER BY r.created_at DESC LIMIT 1
  `).get(personId, user.id);

  if (!reg) {
    return res.json({ registration: null });
  }

  // Format change data if present
  let change = null;
  if (reg.change_data) {
    try {
      change = JSON.parse(reg.change_data);
    } catch (e) {
      change = null;
    }
  }

  // Check fee status
  const payments = db.prepare("SELECT payment_status FROM payments WHERE owner_person_id = ? OR user_id = ?").all(personId, user.id);
  let feeStatus = "—";
  if (payments.length > 0) {
    if (payments.every((p) => p.payment_status === "Paid")) feeStatus = "Paid";
    else feeStatus = "Pending";
  }

  res.json({
    registration: {
      ...reg,
      change,
      feeStatus,
    },
  });
});

/**
 * Submit transport registration request
 */
router.post("/register", authenticateUser, (req, res) => {
  const user = req.user;
  const { routeId, pickupStopId, dropoffStopId } = req.body;

  if (!routeId || !pickupStopId || !dropoffStopId) {
    return res.status(400).json({ error: "Route, pickup stop, and drop-off stop are required." });
  }

  // Validate route exists
  const route = db.prepare("SELECT * FROM routes WHERE id = ? AND is_active = 1").get(routeId);
  if (!route) {
    return res.status(400).json({ error: "Invalid bus route selected." });
  }

  // Validate pickup stop belongs to route
  const pickupStop = db.prepare("SELECT id FROM route_stops WHERE route_id = ? AND stop_id = ?").get(routeId, pickupStopId);
  if (!pickupStop) {
    return res.status(400).json({ error: "The chosen pickup stop does not belong to this route." });
  }

  // Validate dropoff stop belongs to route
  const dropoffStop = db.prepare("SELECT id FROM route_stops WHERE route_id = ? AND stop_id = ?").get(routeId, dropoffStopId);
  if (!dropoffStop) {
    return res.status(400).json({ error: "The chosen drop-off stop does not belong to this route." });
  }

  // Check seat capacity on this route
  const routeBuses = db.prepare("SELECT SUM(capacity) as totalCap FROM buses WHERE route_id = ? AND status = 'Active'").get(routeId);
  const totalCap = routeBuses?.totalCap || 0;
  const registeredCount = db.prepare("SELECT COUNT(*) as count FROM transport_registrations WHERE route_id = ? AND status = 'Approved'").get(routeId).count;

  if (totalCap > 0 && registeredCount >= totalCap) {
    return res.status(400).json({ error: "This route has reached maximum capacity. Please contact the transport office." });
  }

  // Identify person ID and department
  const student = db.prepare("SELECT student_id, department, phone FROM student_profiles WHERE user_id = ?").get(user.id);
  const staff = db.prepare("SELECT staff_id, department, phone FROM staff_profiles WHERE user_id = ?").get(user.id);

  const personId = student?.student_id || staff?.staff_id || `ID_${user.id}`;
  const personType = staff ? "Staff" : "Student";
  const department = student?.department || staff?.department || "";
  const phone = student?.phone || staff?.phone || "";

  // Check for existing registration
  const existing = db.prepare("SELECT id FROM transport_registrations WHERE person_id = ? OR user_id = ?").get(personId, user.id);

  if (existing) {
    db.prepare(`
      UPDATE transport_registrations
      SET route_id = ?, pickup_stop_id = ?, dropoff_stop_id = ?, status = 'Pending',
          bus_id = NULL, seat = NULL, change_data = NULL, rejection_reason = NULL,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(routeId, pickupStopId, dropoffStopId, existing.id);
  } else {
    const regId = `G${Date.now() % 100000}`;
    db.prepare(`
      INSERT INTO transport_registrations
      (id, user_id, person_id, person_name, person_type, department, phone, route_id, pickup_stop_id, dropoff_stop_id, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', datetime('now'), datetime('now'))
    `).run(regId, user.id, personId, user.name, personType, department, phone, routeId, pickupStopId, dropoffStopId);
  }

  // Notify admin
  const pkName = db.prepare("SELECT name FROM stops WHERE id = ?").get(pickupStopId)?.name || "";
  const dpName = db.prepare("SELECT name FROM stops WHERE id = ?").get(dropoffStopId)?.name || "";

  db.prepare(`
    INSERT INTO notifications (recipient_tag, type, text, level, category, created_at)
    VALUES ('role:admin', 'New transport request', ?, 'info', 'info', strftime('%H:%M', 'now', 'localtime'))
  `).run(`${user.name} (${personType}) requested ${route.name}: pickup ${pkName}, drop-off ${dpName}.`);

  db.prepare(`
    INSERT INTO audit_logs (id, actor, action, timestamp)
    VALUES (?, ?, ?, datetime('now'))
  `).run(`A${Date.now()}`, user.name, `Requested transport on ${route.name}`);

  res.json({ message: "Transport registration submitted for admin approval." });
});

/**
 * Request change of pickup / drop-off stops
 */
router.post("/request-change", authenticateUser, (req, res) => {
  const user = req.user;
  const { routeId, pickupStopId, dropoffStopId } = req.body;

  const reg = db.prepare("SELECT * FROM transport_registrations WHERE user_id = ? OR person_id = ?").get(user.id, user.id);
  if (!reg) return res.status(404).json({ error: "Registration not found." });

  // Validate route and stops
  const route = db.prepare("SELECT name FROM routes WHERE id = ?").get(routeId);
  const pickupStop = db.prepare("SELECT id, name FROM stops WHERE id = ?").get(pickupStopId);
  const dropoffStop = db.prepare("SELECT id, name FROM stops WHERE id = ?").get(dropoffStopId);

  if (!route || !pickupStop || !dropoffStop) {
    return res.status(400).json({ error: "Invalid route or stops selected." });
  }

  const changeData = JSON.stringify({
    routeId,
    pickup: pickupStopId,
    drop: dropoffStopId,
  });

  db.prepare(`
    UPDATE transport_registrations
    SET change_data = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(changeData, reg.id);

  db.prepare(`
    INSERT INTO notifications (recipient_tag, type, text, level, category, created_at)
    VALUES ('role:admin', 'Stop change request', ?, 'info', 'info', strftime('%H:%M', 'now', 'localtime'))
  `).run(`${reg.person_name} asked to change to ${route.name}: pickup ${pickupStop.name}, drop-off ${dropoffStop.name}.`);

  res.json({ message: "Stop change request submitted for admin approval." });
});

/**
 * Withdraw / cancel change request
 */
router.post("/cancel-change", authenticateUser, (req, res) => {
  const user = req.user;
  db.prepare(`
    UPDATE transport_registrations SET change_data = NULL, updated_at = datetime('now')
    WHERE user_id = ? OR person_id = ?
  `).run(user.id, user.id);

  res.json({ message: "Change request cancelled." });
});

/**
 * Cancel transport registration
 */
router.post("/cancel", authenticateUser, (req, res) => {
  const user = req.user;
  const reg = db.prepare("SELECT * FROM transport_registrations WHERE user_id = ? OR person_id = ?").get(user.id, user.id);
  if (!reg) return res.status(404).json({ error: "Registration not found." });

  db.prepare("DELETE FROM transport_registrations WHERE id = ?").run(reg.id);

  db.prepare(`
    INSERT INTO notifications (recipient_tag, type, text, level, category, created_at)
    VALUES ('role:admin', 'Registration cancelled', ?, 'warning', 'info', strftime('%H:%M', 'now', 'localtime'))
  `).run(`${reg.person_name} cancelled their transport registration.`);

  db.prepare(`
    INSERT INTO audit_logs (id, actor, action, timestamp)
    VALUES (?, ?, ?, datetime('now'))
  `).run(`A${Date.now()}`, user.name, "Cancelled transport registration");

  res.json({ message: "Registration cancelled successfully." });
});

/**
 * List all registrations (Admin only)
 */
router.get("/registrations", authenticateUser, requireAdmin, (req, res) => {
  const { status, search } = req.query;

  let query = `
    SELECT r.*,
           rt.name as route_name, rt.fee as route_fee,
           pk.name as pickup_name, dp.name as dropoff_name,
           rs_pk.morning_time as pickup_am, rs_dp.evening_time as dropoff_pm,
           b.id as bus_id, b.reg_no as bus_reg
    FROM transport_registrations r
    JOIN routes rt ON r.route_id = rt.id
    JOIN stops pk ON r.pickup_stop_id = pk.id
    JOIN stops dp ON r.dropoff_stop_id = dp.id
    LEFT JOIN route_stops rs_pk ON (rs_pk.route_id = r.route_id AND rs_pk.stop_id = r.pickup_stop_id)
    LEFT JOIN route_stops rs_dp ON (rs_dp.route_id = r.route_id AND rs_dp.stop_id = r.dropoff_stop_id)
    LEFT JOIN buses b ON r.bus_id = b.id
    WHERE 1=1
  `;
  const params = [];

  if (status && status !== "All") {
    if (status === "Changes") {
      query += " AND r.change_data IS NOT NULL";
    } else if (status === "Pending") {
      query += " AND (r.status = 'Pending' OR r.change_data IS NOT NULL)";
    } else {
      query += " AND r.status = ?";
      params.push(status);
    }
  }

  if (search) {
    query += " AND (r.person_name LIKE ? OR r.person_id LIKE ? OR r.department LIKE ?)";
    const term = `%${search}%`;
    params.push(term, term, term);
  }

  query += " ORDER BY r.created_at DESC";

  const rows = db.prepare(query).all(...params);

  // Parse change data and fee status for each row
  const registrations = rows.map((r) => {
    let change = null;
    if (r.change_data) {
      try {
        change = JSON.parse(r.change_data);
      } catch (e) {
        change = null;
      }
    }

    const pay = db.prepare("SELECT payment_status FROM payments WHERE owner_person_id = ?").all(r.person_id);
    let feeStatus = "—";
    if (pay.length > 0) {
      if (pay.every((p) => p.payment_status === "Paid")) feeStatus = "Paid";
      else feeStatus = "Pending";
    }

    return {
      ...r,
      pickup: r.pickup_stop_id,
      drop: r.dropoff_stop_id,
      name: r.person_name,
      pid: r.person_id,
      type: r.person_type,
      dept: r.department,
      change,
      feeStatus,
    };
  });

  res.json({ registrations });
});

/**
 * Approve or reject transport request / change request (Admin only)
 */
router.post("/decide", authenticateUser, requireAdmin, (req, res) => {
  const { regId, approve, busId, reason } = req.body;

  const reg = db.prepare("SELECT * FROM transport_registrations WHERE id = ?").get(regId);
  if (!reg) return res.status(404).json({ error: "Registration not found." });

  // 1. Handle stop change approval / rejection
  if (reg.change_data) {
    const change = JSON.parse(reg.change_data);
    if (!approve) {
      db.prepare("UPDATE transport_registrations SET change_data = NULL, updated_at = datetime('now') WHERE id = ?").run(reg.id);
      db.prepare(`
        INSERT INTO notifications (recipient_tag, type, text, level, category, created_at)
        VALUES (?, 'Stop change rejected', ?, 'warning', 'info', strftime('%H:%M', 'now', 'localtime'))
      `).run(reg.person_id, `Your request to change stops was not approved${reason ? ": " + reason : "."}`);
      return res.json({ message: "Stop change rejected." });
    }

    // Approve change
    let targetBusId = reg.bus_id;
    let targetSeat = reg.seat;

    if (change.routeId !== reg.routeId || !targetBusId) {
      // Find a bus with capacity on the new route
      const candidateBus = busId
        ? db.prepare("SELECT id FROM buses WHERE id = ? AND route_id = ?").get(busId, change.routeId)
        : db.prepare("SELECT id FROM buses WHERE route_id = ? AND status = 'Active'").get(change.routeId);

      if (!candidateBus) {
        return res.status(400).json({ error: "No bus available on the new route." });
      }

      targetBusId = candidateBus.id;
      targetSeat = getFirstFreeSeat(targetBusId);
      if (!targetSeat) {
        return res.status(400).json({ error: "No free seats available on that bus." });
      }
    }

    db.prepare(`
      UPDATE transport_registrations
      SET route_id = ?, pickup_stop_id = ?, dropoff_stop_id = ?, bus_id = ?, seat = ?, change_data = NULL, updated_at = datetime('now')
      WHERE id = ?
    `).run(change.routeId, change.pickup, change.drop, targetBusId, targetSeat, reg.id);

    db.prepare(`
      INSERT INTO notifications (recipient_tag, type, text, level, category, created_at)
      VALUES (?, 'Stop change approved', ?, 'info', 'info', strftime('%H:%M', 'now', 'localtime'))
    `).run(reg.person_id, `Your stop change request was approved. Assigned to Bus ${targetBusId}, Seat ${targetSeat}.`);

    return res.json({ message: "Stop change approved successfully." });
  }

  // 2. Handle initial registration approval / rejection
  if (!approve) {
    db.prepare(`
      UPDATE transport_registrations
      SET status = 'Rejected', rejection_reason = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(reason || "", reg.id);

    db.prepare(`
      INSERT INTO notifications (recipient_tag, type, text, level, category, created_at)
      VALUES (?, 'Transport request rejected', ?, 'warning', 'info', strftime('%H:%M', 'now', 'localtime'))
    `).run(reg.person_id, `Your transport request was not approved${reason ? ": " + reason : "."}`);

    return res.json({ message: "Transport request rejected." });
  }

  // Select bus with available seat
  let assignedBus = null;
  if (busId) {
    assignedBus = db.prepare("SELECT id, capacity FROM buses WHERE id = ? AND route_id = ?").get(busId, reg.route_id);
  } else {
    // Pick first bus on route that has capacity
    const buses = db.prepare("SELECT id, capacity FROM buses WHERE route_id = ? AND status = 'Active'").all(reg.route_id);
    for (const b of buses) {
      const riders = db.prepare("SELECT COUNT(*) as count FROM transport_registrations WHERE bus_id = ? AND status = 'Approved'").get(b.id).count;
      if (riders < b.capacity) {
        assignedBus = b;
        break;
      }
    }
  }

  if (!assignedBus) {
    return res.status(400).json({ error: "No bus with a free seat is available on this route. Please add a bus or increase capacity." });
  }

  const freeSeat = getFirstFreeSeat(assignedBus.id);
  if (!freeSeat) {
    return res.status(400).json({ error: "Selected bus has reached maximum capacity." });
  }

  db.prepare(`
    UPDATE transport_registrations
    SET status = 'Approved', bus_id = ?, seat = ?, rejection_reason = NULL, updated_at = datetime('now')
    WHERE id = ?
  `).run(assignedBus.id, freeSeat, reg.id);

  // Automatically create pending fee invoice in payments table if not already created
  const route = db.prepare("SELECT * FROM routes WHERE id = ?").get(reg.route_id);
  const existingPayment = db.prepare("SELECT id FROM payments WHERE owner_person_id = ? AND label LIKE ?").get(reg.person_id, `%${route.name}%`);

  if (!existingPayment) {
    const payId = `P${Date.now() % 100000}`;
    db.prepare(`
      INSERT INTO payments (id, user_id, owner_person_id, reg_id, academic_year, label, amount, due_date, payment_status, created_at)
      VALUES (?, ?, ?, ?, '2026-2027', ?, ?, '05 Jan 2027', 'Pending', datetime('now'))
    `).run(payId, reg.user_id, reg.person_id, reg.id, `Transport Fee — Even Sem 2026 (${route.name})`, route.fee);
  }

  // Targeted notification
  db.prepare(`
    INSERT INTO notifications (recipient_tag, type, text, level, category, created_at)
    VALUES (?, 'Transport request approved', ?, 'info', 'info', strftime('%H:%M', 'now', 'localtime'))
  `).run(reg.person_id, `Transport approved: Bus ${assignedBus.id}, Seat ${freeSeat}. Route: ${route.name}.`);

  db.prepare(`
    INSERT INTO notifications (recipient_tag, type, text, level, category, created_at)
    VALUES (?, 'Transport request approved', ?, 'info', 'info', strftime('%H:%M', 'now', 'localtime'))
  `).run(`parent:${reg.person_id}`, `Transport approved for ${reg.person_name}: Bus ${assignedBus.id}, Seat ${freeSeat}.`);

  db.prepare(`
    INSERT INTO audit_logs (id, actor, action, timestamp)
    VALUES (?, ?, ?, datetime('now'))
  `).run(`A${Date.now()}`, req.user.name, `Approved transport request: ${reg.person_name} → ${assignedBus.id} (Seat ${freeSeat})`);

  res.json({ message: "Registration approved successfully", busId: assignedBus.id, seat: freeSeat });
});

/**
 * Seat selection by passenger
 */
router.post("/select-seat", authenticateUser, (req, res) => {
  const { seat } = req.body;
  const user = req.user;

  if (!seat) return res.status(400).json({ error: "Seat is required." });

  const reg = db.prepare("SELECT * FROM transport_registrations WHERE user_id = ? AND status = 'Approved'").get(user.id);
  if (!reg || !reg.bus_id) return res.status(400).json({ error: "You must have an approved bus assignment to select a seat." });

  // Validate seat is not already taken by another passenger
  const isTaken = db.prepare(`
    SELECT id FROM transport_registrations
    WHERE bus_id = ? AND seat = ? AND id != ? AND status = 'Approved'
  `).get(reg.bus_id, seat, reg.id);

  if (isTaken) {
    return res.status(400).json({ error: `Seat ${seat} is already occupied. Please choose another seat.` });
  }

  db.prepare("UPDATE transport_registrations SET seat = ?, updated_at = datetime('now') WHERE id = ?").run(seat, reg.id);

  res.json({ message: `Seat ${seat} confirmed successfully.` });
});

module.exports = router;
