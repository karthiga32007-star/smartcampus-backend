const authService = require("../services/authService");
const User = require("../models/User");
const connectDB = require("../config/db");

async function runEndToEndVerification() {
  console.log("===============================================================");
  console.log(" SMARTMOVE — LIVE END-TO-END GOOGLE OAUTH & RBAC VERIFICATION");
  console.log("===============================================================\n");

  await connectDB();

  // 1. Verify Backend Live Server /api/health
  console.log("Step 1: Testing Backend Health Endpoint (http://localhost:5000/api/health)...");
  const healthRes = await fetch("http://localhost:5000/api/health");
  const healthJson = await healthRes.json();
  if (!healthJson.success || !healthJson.authentication.includes("Google OAuth")) {
    throw new Error("Health check failed or Google OAuth not indicated: " + JSON.stringify(healthJson));
  }
  console.log("  [PASS] Server running on port 5000. Database:", healthJson.database);
  console.log("  [PASS] Auth Mode:", healthJson.authentication, "\n");

  // 2. Verify GET /api/auth/google on Live Server Port 5000
  console.log("Step 2: Testing Live Route: GET http://localhost:5000/api/auth/google...");
  const googleRes = await fetch("http://localhost:5000/api/auth/google", { redirect: "manual" });
  console.log("  Response Status Code:", googleRes.status);
  const location = googleRes.headers.get("location");
  console.log("  Redirect Location:", location);

  if (googleRes.status !== 302) {
    throw new Error(`Expected HTTP 302 redirect, received status ${googleRes.status}`);
  }
  if (!location || !location.startsWith("https://accounts.google.com/o/oauth2/v2/auth")) {
    throw new Error(`Invalid OAuth redirection target: ${location}`);
  }
  if (!location.includes("client_id=339035102255-39ne8l7068nhepsg4iuqc4ah45it9eal.apps.googleusercontent.com")) {
    throw new Error(`Google Client ID missing from redirect location: ${location}`);
  }
  if (!location.includes("redirect_uri=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fauth%2Fgoogle%2Fcallback")) {
    throw new Error(`Callback URL missing or invalid in redirect location: ${location}`);
  }
  console.log("  [PASS] Route GET /api/auth/google exists, is mounted, and returns HTTP 302 to Google Account Selector!\n");

  // 3. Verify GET /api/auth/google/callback on Live Server Port 5000
  console.log("Step 3: Testing Live Callback Handling: GET http://localhost:5000/api/auth/google/callback?error=access_denied...");
  const cancelRes = await fetch("http://localhost:5000/api/auth/google/callback?error=access_denied", { redirect: "manual" });
  const cancelLoc = cancelRes.headers.get("location");
  console.log("  Cancellation Redirect Location:", cancelLoc);
  if (cancelRes.status !== 302 || !cancelLoc.includes("error=AUTH_CANCELLED")) {
    throw new Error(`Expected redirect to frontend with AUTH_CANCELLED, received ${cancelLoc}`);
  }
  console.log("  [PASS] Route GET /api/auth/google/callback exists, is mounted, and properly redirects cancellation!\n");

  // 4. Verify MongoDB Role-Based Authorization for Google Logins
  console.log("Step 4: Verifying MongoDB Role-Based Access Control logic...");

  // 4A: Registered Gmail account
  const student = await authService.authenticateGoogleUser({
    googleId: "google-uid-demo-student",
    email: "student.demo@gmail.com",
    name: "Demo Student",
  });
  if (student.user.role !== "STUDENT") throw new Error("Expected STUDENT role");
  console.log("  [PASS] student.demo@gmail.com -> Server assigned role:", student.user.role);

  // 4B: Registered NEC account
  const admin = await authService.authenticateGoogleUser({
    googleId: "google-uid-admin-nec",
    email: "admin@nec.edu.in",
    name: "Transport Officer",
  });
  if (admin.user.role !== "TRANSPORT_ADMIN") throw new Error("Expected TRANSPORT_ADMIN role");
  console.log("  [PASS] admin@nec.edu.in -> Server assigned role:", admin.user.role);

  // 4C: Unknown Google account
  let rejectedStranger = false;
  try {
    await authService.authenticateGoogleUser({
      googleId: "google-uid-stranger-xyz",
      email: "stranger@company.com",
      name: "Stranger",
    });
  } catch (err) {
    if (err.code === "NOT_REGISTERED") {
      rejectedStranger = true;
      console.log("  [PASS] stranger@company.com -> Rejected with code:", err.code);
      console.log("         Message:", `"${err.message}"`);
    }
  }
  if (!rejectedStranger) throw new Error("Unknown account was not rejected!");

  // Verify no account was created in MongoDB
  const strangerInDb = await User.findOne({ email: "stranger@company.com" });
  if (strangerInDb) throw new Error("Unregistered account was created in MongoDB!");
  console.log("  [PASS] Verified 0 records created in MongoDB for unregistered account.");

  // 4D: Suspended account
  let rejectedSuspended = false;
  try {
    await authService.authenticateGoogleUser({
      googleId: "google-uid-suspended",
      email: "suspended.user@gmail.com",
      name: "Suspended User",
    });
  } catch (err) {
    if (err.code === "ACCOUNT_SUSPENDED") {
      rejectedSuspended = true;
      console.log("  [PASS] suspended.user@gmail.com -> Rejected with code:", err.code);
    }
  }
  if (!rejectedSuspended) throw new Error("Suspended account was not rejected!");

  // 4E: Pending account
  let rejectedPending = false;
  try {
    await authService.authenticateGoogleUser({
      googleId: "google-uid-pending",
      email: "pending.user@gmail.com",
      name: "Pending User",
    });
  } catch (err) {
    if (err.code === "ACCOUNT_PENDING") {
      rejectedPending = true;
      console.log("  [PASS] pending.user@gmail.com -> Rejected with code:", err.code);
    }
  }
  if (!rejectedPending) throw new Error("Pending account was not rejected!\n");

  // 5. Verify Frontend on Port 5173
  console.log("\nStep 5: Testing Frontend Server (http://localhost:5173)...");
  const feRes = await fetch("http://localhost:5173");
  const feHtml = await feRes.text();
  if (!feHtml.includes("<title>NEC Smart Campus Transport Management</title>")) {
    throw new Error("Frontend title mismatch or wrong server on port 5173!");
  }
  console.log("  [PASS] SmartMove Frontend loaded successfully on port 5173.");

  console.log("\n===============================================================");
  console.log(" ALL LIVE E2E GOOGLE OAUTH & RBAC VERIFICATIONS PASSED (100%)");
  console.log("===============================================================");

  process.exit(0);
}

runEndToEndVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
