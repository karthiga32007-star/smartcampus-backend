const connectDB = require("../config/db");
const { app } = require("../index");
const authService = require("../services/authService");
const User = require("../models/User");

async function runGoogleAuthTests() {
  console.log("====================================================");
  console.log(" SMARTMOVE — GOOGLE OAUTH 2.0 & RBAC TEST SUITE");
  console.log("====================================================\n");

  await connectDB();

  const server = app.listen(5098, async () => {
    try {
      const BASE = "http://localhost:5098/api";

      // Test 1: GET /api/auth/google returns 302 Redirect to Google OAuth consent
      console.log("TEST 1: Verifying GET /api/auth/google endpoint...");
      const googleRes = await fetch(`${BASE}/auth/google`, { redirect: "manual" });
      const location = googleRes.headers.get("location");

      if (googleRes.status !== 302) {
        throw new Error(`Expected 302 Redirect, received status ${googleRes.status}`);
      }
      if (!location || !location.startsWith("https://accounts.google.com/o/oauth2/v2/auth")) {
        throw new Error(`Invalid OAuth redirection target: ${location}`);
      }
      if (!location.includes("client_id=339035102255-39ne8l7068nhepsg4iuqc4ah45it9eal.apps.googleusercontent.com")) {
        throw new Error(`Client ID missing from auth URL: ${location}`);
      }
      if (!location.includes("prompt=select_account")) {
        throw new Error(`prompt=select_account missing from auth URL`);
      }
      console.log("  [PASS] GET /api/auth/google generates valid 302 redirect to accounts.google.com with prompt=select_account\n");

      // Test 2: Authenticate Registered Gmail Account (student.demo@gmail.com)
      console.log("TEST 2: Authenticating registered Gmail account (student.demo@gmail.com)...");
      const gmailResult = await authService.authenticateGoogleUser({
        googleId: "google-uid-demo-student",
        email: "student.demo@gmail.com",
        name: "Demo Student",
        avatar: "https://lh3.googleusercontent.com/demo.jpg",
      });
      if (!gmailResult.token) throw new Error("Token was not generated");
      if (gmailResult.user.role !== "STUDENT") {
        throw new Error(`Expected role STUDENT, got: ${gmailResult.user.role}`);
      }
      console.log("  [PASS] Gmail user authenticated successfully with server-enforced role:", gmailResult.user.role);
      console.log("  [PASS] Received valid JWT token:", gmailResult.token.substring(0, 24) + "...\n");

      // Test 3: Authenticate Registered NEC Account (admin@nec.edu.in)
      console.log("TEST 3: Authenticating registered NEC account (admin@nec.edu.in)...");
      const necResult = await authService.authenticateGoogleUser({
        googleId: "google-uid-admin-nec",
        email: "admin@nec.edu.in",
        name: "Transport Officer",
        avatar: null,
      });
      if (!necResult.token) throw new Error("Token was not generated");
      if (necResult.user.role !== "TRANSPORT_ADMIN") {
        throw new Error(`Expected role TRANSPORT_ADMIN, got: ${necResult.user.role}`);
      }
      console.log("  [PASS] NEC account authenticated successfully with server-enforced role:", necResult.user.role);
      console.log("  [PASS] Received valid JWT token:", necResult.token.substring(0, 24) + "...\n");

      // Test 4: Reject Unregistered Google Account (stranger@anydomain.com)
      console.log("TEST 4: Rejecting unregistered Google account (stranger@external.com)...");
      let unregisteredRejected = false;
      try {
        await authService.authenticateGoogleUser({
          googleId: "google-uid-unregistered-999",
          email: "stranger@external.com",
          name: "Unregistered User",
          avatar: null,
        });
      } catch (err) {
        if (err.code === "NOT_REGISTERED") {
          unregisteredRejected = true;
          console.log("  [PASS] Correctly rejected with code:", err.code);
          console.log("  [PASS] User error message:", `"${err.message}"`);
        } else {
          throw new Error(`Unexpected error code for unregistered user: ${err.code} / ${err.message}`);
        }
      }
      if (!unregisteredRejected) throw new Error("Unregistered account was unexpectedly allowed!");

      // Verify no user was created in MongoDB for the stranger
      const strangerCheck = await User.findOne({ email: "stranger@external.com" });
      if (strangerCheck) throw new Error("Unregistered user was illegally created in MongoDB!");
      console.log("  [PASS] Verified 0 auto-created records in MongoDB for unregistered account.\n");

      // Test 5: Reject Suspended Account (suspended.user@gmail.com)
      console.log("TEST 5: Rejecting suspended account (suspended.user@gmail.com)...");
      let suspendedRejected = false;
      try {
        await authService.authenticateGoogleUser({
          googleId: "google-uid-suspended",
          email: "suspended.user@gmail.com",
          name: "Suspended User",
          avatar: null,
        });
      } catch (err) {
        if (err.code === "ACCOUNT_SUSPENDED") {
          suspendedRejected = true;
          console.log("  [PASS] Correctly rejected with code:", err.code);
          console.log("  [PASS] User error message:", `"${err.message}"`);
        } else {
          throw new Error(`Unexpected error code for suspended user: ${err.code} / ${err.message}`);
        }
      }
      if (!suspendedRejected) throw new Error("Suspended account was unexpectedly allowed!\n");
      console.log("  [PASS] Verified account suspension strictly enforced.\n");

      // Test 6: Reject Pending Account (pending.user@gmail.com)
      console.log("TEST 6: Rejecting pending account (pending.user@gmail.com)...");
      let pendingRejected = false;
      try {
        await authService.authenticateGoogleUser({
          googleId: "google-uid-pending",
          email: "pending.user@gmail.com",
          name: "Pending Approval",
          avatar: null,
        });
      } catch (err) {
        if (err.code === "ACCOUNT_PENDING") {
          pendingRejected = true;
          console.log("  [PASS] Correctly rejected with code:", err.code);
          console.log("  [PASS] User error message:", `"${err.message}"`);
        } else {
          throw new Error(`Unexpected error code for pending user: ${err.code} / ${err.message}`);
        }
      }
      if (!pendingRejected) throw new Error("Pending account was unexpectedly allowed!");
      console.log("  [PASS] Verified pending account approval strictly enforced.\n");

      // Test 7: Verify OAuth callback error redirection
      console.log("TEST 7: Verifying GET /api/auth/google/callback error and cancellation handling...");
      const cancelRes = await fetch(`${BASE}/auth/google/callback?error=access_denied`, { redirect: "manual" });
      const cancelLoc = cancelRes.headers.get("location");
      if (cancelRes.status !== 302 || !cancelLoc.includes("error=AUTH_CANCELLED")) {
        throw new Error(`Expected redirect with AUTH_CANCELLED, received ${cancelLoc}`);
      }
      console.log("  [PASS] Callback safely redirects user back with ?error=AUTH_CANCELLED\n");

      // Test 8: Independent Demo Account Password Logins
      console.log("TEST 8: Verifying demo accounts continue to log in with password...");
      const demoRes = await fetch(`${BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "student@nec.edu.in", password: "nec@123" }),
      });
      const demoJson = await demoRes.json();
      if (!demoJson.success || !demoJson.token) {
        throw new Error("Demo password login failed: " + JSON.stringify(demoJson));
      }
      console.log("  [PASS] student@nec.edu.in password login succeeds, role:", demoJson.user.role);

      console.log("\n====================================================");
      console.log(" ALL 8 GOOGLE OAUTH & RBAC SECURITY TESTS PASSED!");
      console.log("====================================================");

      server.close(() => process.exit(0));
    } catch (err) {
      console.error("\n[TEST FAILED]:", err.message || err);
      server.close(() => process.exit(1));
    }
  });
}

runGoogleAuthTests();
