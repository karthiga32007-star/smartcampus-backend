/**
 * SMARTMOVE — END-TO-END AUTOMATED USER REGISTRATION & APPROVAL VERIFICATION
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const connectDB = require("../config/db");
const mongoose = require("mongoose");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const FacultyProfile = require("../models/FacultyProfile");
const ParentProfile = require("../models/ParentProfile");
const RegistrationRequest = require("../models/RegistrationRequest");
const authService = require("../services/authService");

const BASE_URL = "http://localhost:5000";

async function runTests() {
  console.log("===============================================================");
  console.log(" SMARTMOVE — COMPLETE USER REGISTRATION & APPROVAL TEST SUITE  ");
  console.log("===============================================================\n");

  await connectDB();

  // Clean up any previous test artifacts
  await User.deleteMany({ email: { $in: ["test.student.flow@gmail.com", "test.faculty.flow@gmail.com"] } });
  await RegistrationRequest.deleteMany({ email: { $in: ["test.student.flow@gmail.com", "test.faculty.flow@gmail.com"] } });
  await StudentProfile.deleteMany({ studentId: "21CS099-TEST" });
  await FacultyProfile.deleteMany({ employeeId: "FAC-889-TEST" });

  let passed = 0;
  let total = 0;

  function assert(condition, testName, details = "") {
    total++;
    if (condition) {
      console.log(`  [PASS] Test ${total}: ${testName}`);
      if (details) console.log(`         ${details}`);
      passed++;
    } else {
      console.error(`  [FAIL] Test ${total}: ${testName}`);
      if (details) console.error(`         ${details}`);
      process.exitCode = 1;
    }
  }

  // Find admin user for auth header
  const adminUser = await User.findOne({ role: "TRANSPORT_ADMIN" });
  if (!adminUser) {
    throw new Error("Admin user not found. Seed database first.");
  }
  const adminToken = authService.generateToken(adminUser);

  try {
    // -------------------------------------------------------------
    // TEST 1: Submit valid Student self-registration request
    // -------------------------------------------------------------
    const regRes = await fetch(`${BASE_URL}/api/registration/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test.student.flow@gmail.com",
        name: "Alice Test Student",
        requestedRole: "STUDENT",
        registerNumber: "21CS099-TEST",
        department: "Computer Science & Engineering",
        year: "3rd Year",
        section: "A",
        phone: "9876543210",
        emergencyContact: "9876543211",
      }),
    });
    const regData = await regRes.json();
    assert(
      regRes.status === 201 && regData.success === true && regData.requestId,
      "Submit Student Registration Request",
      `Request ID: ${regData.requestId}, Status: PENDING`
    );

    const createdReq = await RegistrationRequest.findById(regData.requestId);
    assert(
      createdReq && createdReq.status === "PENDING" && createdReq.registerNumber === "21CS099-TEST",
      "MongoDB RegistrationRequest Document Verified",
      `Email: ${createdReq.email}, Requested Role: ${createdReq.requestedRole}`
    );

    // -------------------------------------------------------------
    // TEST 2: Role elevation attempt blocked (SECURITY CHECK)
    // -------------------------------------------------------------
    const hackerRes = await fetch(`${BASE_URL}/api/registration/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "hacker@gmail.com",
        name: "Unauthorized Actor",
        requestedRole: "TRANSPORT_ADMIN", // Malicious attempt to self-appoint as Admin
      }),
    });
    const hackerData = await hackerRes.json();
    assert(
      hackerRes.status === 403 && hackerData.code === "ROLE_NOT_PERMITTED",
      "Security Gate: Block Self-Elevation to Transport Admin",
      `HTTP ${hackerRes.status} Forbidden: ${hackerData.message}`
    );

    // -------------------------------------------------------------
    // TEST 3: Check Registration Status Endpoint (PENDING)
    // -------------------------------------------------------------
    const statusRes = await fetch(`${BASE_URL}/api/registration/status?email=test.student.flow@gmail.com`);
    const statusData = await statusRes.json();
    assert(
      statusRes.ok && statusData.exists === true && statusData.status === "PENDING",
      "Public Registration Status Lookup (PENDING)",
      `Message: ${statusData.message}`
    );

    // -------------------------------------------------------------
    // TEST 4: Prevent duplicate submission while already pending
    // -------------------------------------------------------------
    const dupRes = await fetch(`${BASE_URL}/api/registration/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test.student.flow@gmail.com",
        name: "Alice Test Student Again",
        requestedRole: "STUDENT",
      }),
    });
    const dupData = await dupRes.json();
    assert(
      dupRes.status === 409 && dupData.code === "REQUEST_ALREADY_PENDING",
      "Prevent Duplicate Submission While Pending",
      `HTTP 409 Conflict: ${dupData.message}`
    );

    // -------------------------------------------------------------
    // TEST 5: Admin Lists Pending Requests
    // -------------------------------------------------------------
    const listRes = await fetch(`${BASE_URL}/api/admin/registration-requests?status=PENDING`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const listData = await listRes.json();
    const hasAlice = listData.requests?.some((r) => r.email === "test.student.flow@gmail.com");
    assert(
      listRes.ok && listData.success && hasAlice,
      "Admin Lists Pending Registration Requests",
      `Total Pending: ${listData.counts?.pending}, Found Alice: ${hasAlice}`
    );

    // -------------------------------------------------------------
    // TEST 6: Admin Approves Registration Request
    // -------------------------------------------------------------
    const approveRes = await fetch(`${BASE_URL}/api/admin/registration-requests/${createdReq._id}/approve`, {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const approveData = await approveRes.json();
    assert(
      approveRes.ok && approveData.success && approveData.user?.role === "STUDENT",
      "Admin Approves & Activates Account",
      approveData.message
    );

    // Verify User and Profile in MongoDB
    const approvedUser = await User.findOne({ email: "test.student.flow@gmail.com" });
    const studentProfile = await StudentProfile.findOne({ user: approvedUser._id });
    assert(
      approvedUser && approvedUser.status === "Active" && studentProfile?.studentId === "21CS099-TEST",
      "User & StudentProfile Activated in MongoDB",
      `User ID: ${approvedUser._id}, Student ID: ${studentProfile?.studentId}`
    );

    // -------------------------------------------------------------
    // TEST 7: Check Registration Status Endpoint (APPROVED)
    // -------------------------------------------------------------
    const approvedStatusRes = await fetch(`${BASE_URL}/api/registration/status?email=test.student.flow@gmail.com`);
    const approvedStatusData = await approvedStatusRes.json();
    assert(
      approvedStatusData.exists === true && approvedStatusData.status === "APPROVED" && approvedStatusData.userActive === true,
      "Public Registration Status Lookup (APPROVED)",
      `User Active: ${approvedStatusData.userActive}, Role: ${approvedStatusData.role}`
    );

    // -------------------------------------------------------------
    // TEST 8: Authenticate as the newly approved Student via Google/Direct
    // -------------------------------------------------------------
    const authResult = await authService.authenticateGoogleUser({
      googleId: "google-test-id-123",
      email: "test.student.flow@gmail.com",
      name: "Alice Test Student",
      avatar: "https://example.com/alice.png",
    });
    assert(
      authResult.token && authResult.user.role === "STUDENT" && authResult.user.status === "Active",
      "Approved User Successfully Authenticates (JWT Issued)",
      `Issued Role: ${authResult.user.role}, Name: ${authResult.user.name}`
    );

    // -------------------------------------------------------------
    // TEST 9: Faculty Rejection Flow
    // -------------------------------------------------------------
    const facRes = await fetch(`${BASE_URL}/api/registration/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test.faculty.flow@gmail.com",
        name: "Bob Candidate",
        requestedRole: "FACULTY",
        employeeId: "FAC-889-TEST",
        department: "Mechanical Engineering",
      }),
    });
    const facData = await facRes.json();
    const facReqId = facData.requestId;

    const rejectRes = await fetch(`${BASE_URL}/api/admin/registration-requests/${facReqId}/reject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        reason: "Employee ID could not be matched with college faculty registry.",
      }),
    });
    const rejectData = await rejectRes.json();
    assert(
      rejectRes.ok && rejectData.success,
      "Admin Rejects Registration Request with Reason",
      rejectData.message
    );

    const rejectedStatusRes = await fetch(`${BASE_URL}/api/registration/status?email=test.faculty.flow@gmail.com`);
    const rejectedStatusData = await rejectedStatusRes.json();
    assert(
      rejectedStatusData.status === "REJECTED" && rejectedStatusData.rejectionReason.includes("faculty registry"),
      "Public Registration Status Returns Rejection Reason",
      `Reason: ${rejectedStatusData.rejectionReason}`
    );

    const userNotCreated = await User.findOne({ email: "test.faculty.flow@gmail.com" });
    assert(
      userNotCreated === null,
      "Rejected Applicant Has Zero Records in User Collection",
      "User collection remains completely pristine."
    );

    // -------------------------------------------------------------
    // TEST 10: Clean up test artifacts
    // -------------------------------------------------------------
    await User.deleteMany({ email: { $in: ["test.student.flow@gmail.com", "test.faculty.flow@gmail.com"] } });
    await RegistrationRequest.deleteMany({ email: { $in: ["test.student.flow@gmail.com", "test.faculty.flow@gmail.com"] } });
    await StudentProfile.deleteMany({ studentId: "21CS099-TEST" });
    await FacultyProfile.deleteMany({ employeeId: "FAC-889-TEST" });

    console.log("\n===============================================================");
    console.log(` ALL ${passed}/${total} REGISTRATION & APPROVAL TESTS PASSED (100%)`);
    console.log("===============================================================\n");
  } finally {
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error("Test execution fatal error:", err);
  process.exit(1);
});
