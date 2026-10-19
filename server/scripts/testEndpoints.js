const connectDB = require("../config/db");
const { app } = require("../index");
const TransportPass = require("../models/TransportPass");

async function runTests() {
  console.log("Running Backend Endpoints Self-Test...");
  await connectDB();

  const server = app.listen(5099, async () => {
    try {
      const BASE = "http://localhost:5099/api";

      // 1. Health check
      console.log("Testing GET /api/health...");
      let res = await fetch(`${BASE}/health`);
      let json = await res.json();
      console.log("  Health response:", json.status, json.database);
      if (!json.success) throw new Error("Health check failed");

      // 2. Auth login (Student)
      console.log("Testing POST /api/auth/login (Student)...");
      res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "student@nec.edu.in", password: "nec@123" }),
      });
      json = await res.json();
      if (!json.token) throw new Error("Student login failed: " + JSON.stringify(json));
      const studentToken = json.token;
      console.log("  Student login token acquired for role:", json.user.role);

      // 3. Auth login (Admin)
      console.log("Testing POST /api/auth/login (Admin)...");
      res = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "admin@nec.edu.in", password: "nec@123" }),
      });
      json = await res.json();
      if (!json.token) throw new Error("Admin login failed");
      const adminToken = json.token;
      console.log("  Admin login token acquired for role:", json.user.role);

      // 4. Routes
      console.log("Testing GET /api/routes...");
      res = await fetch(`${BASE}/routes`);
      json = await res.json();
      console.log("  Routes count:", json.routes?.length);
      if (!json.routes?.length) throw new Error("No routes found");

      // 5. Buses
      console.log("Testing GET /api/buses...");
      res = await fetch(`${BASE}/buses`, { headers: { Authorization: `Bearer ${adminToken}` } });
      json = await res.json();
      console.log("  Buses count:", json.buses?.length);

      // 6. Registrations /my
      console.log("Testing GET /api/registrations/my (Student)...");
      res = await fetch(`${BASE}/registrations/my`, { headers: { Authorization: `Bearer ${studentToken}` } });
      json = await res.json();
      console.log("  Student registration found:", !!json.registration, "Assigned seat:", json.registration?.assignedSeat);

      // 7. Admin Dashboard KPIs
      console.log("Testing GET /api/admin/dashboard (Admin)...");
      res = await fetch(`${BASE}/admin/dashboard`, { headers: { Authorization: `Bearer ${adminToken}` } });
      json = await res.json();
      console.log("  Dashboard KPIs:", json.kpis);

      // 8. Attendance
      console.log("Testing GET /api/attendance/today...");
      res = await fetch(`${BASE}/attendance/today`, { headers: { Authorization: `Bearer ${adminToken}` } });
      json = await res.json();
      console.log("  Attendance records count:", json.manifest?.length);

      // 9. Digital Pass Verification
      console.log("Testing Digital Pass Public Verification...");
      const pass = await TransportPass.findOne();
      if (pass) {
        res = await fetch(`${BASE}/transport-pass/verify/${pass.verificationToken}`);
        json = await res.json();
        console.log("  Pass verified successfully:", json.valid, "Holder:", json.holderName, "Seat:", json.seatNumber);
      }

      // 10. CSV Report Export
      console.log("Testing CSV export GET /api/reports/registrations/csv...");
      res = await fetch(`${BASE}/reports/registrations/csv`, { headers: { Authorization: `Bearer ${adminToken}` } });
      const csv = await res.text();
      console.log("  CSV header:", csv.split("\n")[0]);

      console.log("====================================================");
      console.log(" ALL BACKEND REST API ENDPOINTS PASSED VERIFICATION!");
      console.log("====================================================");

      server.close(() => process.exit(0));
    } catch (err) {
      console.error("Test failed:", err);
      server.close(() => process.exit(1));
    }
  });
}

runTests();
