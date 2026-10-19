const express = require("express");
const router = express.Router();
const authService = require("../services/authService");
const { authenticateUser } = require("../middleware/auth");
const config = require("../config");

const RegistrationRequest = require("../models/RegistrationRequest");

/**
 * Real Google OAuth 2.0 Initiation Endpoint.
 * Redirects the user's browser directly to Google's official account selector screen.
 */
router.get("/google", (req, res, next) => {
  try {
    const authUrl = authService.getGoogleAuthUrl();
    console.log(`[Google OAuth] Redirecting browser to Google consent screen (302)...`);
    res.redirect(302, authUrl);
  } catch (err) {
    next(err);
  }
});

/**
 * Real Google OAuth 2.0 Callback Endpoint.
 * Google redirects here with ?code=...
 * Exchanges authorization code, authenticates against MongoDB, redirects to frontend with token or launches registration.
 */
router.get("/google/callback", async (req, res) => {
  const { code, error } = req.query;
  const frontendUrl = config.frontendUrl || "http://localhost:5173";

  if (error || !code) {
    return res.redirect(`${frontendUrl}/?error=AUTH_CANCELLED`);
  }

  try {
    const googleProfile = await authService.handleGoogleCallback(code);
    const result = await authService.authenticateGoogleUser(googleProfile);

    return res.redirect(`${frontendUrl}/?token=${result.token}`);
  } catch (err) {
    if (err.code === "NOT_REGISTERED") {
      const email = (err.email || "").toLowerCase().trim();
      const name = err.name || "";
      const googleId = err.googleId || "";
      const avatar = err.avatar || "";
      const regToken = authService.generateRegistrationToken({
        email,
        name,
        googleId,
        avatar,
      });

      // Check if user already submitted a registration request
      try {
        const existingReq = await RegistrationRequest.findOne({ email }).sort({ submittedAt: -1 });
        if (existingReq) {
          if (existingReq.status === "PENDING") {
            return res.redirect(
              `${frontendUrl}/?oauth_action=pending&email=${encodeURIComponent(email)}`
            );
          }
          if (existingReq.status === "REJECTED") {
            return res.redirect(
              `${frontendUrl}/?oauth_action=rejected&email=${encodeURIComponent(email)}&reason=${encodeURIComponent(existingReq.rejectionReason || "")}`
            );
          }
        }
      } catch (dbErr) {
        console.error("Error checking RegistrationRequest:", dbErr.message);
      }

      // Case D: Fresh unregistered Google account
      return res.redirect(
        `${frontendUrl}/?oauth_action=not_registered&regToken=${encodeURIComponent(regToken)}&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&avatar=${encodeURIComponent(avatar)}`
      );
    }

    if (err.code === "ACCOUNT_PENDING") {
      const email = (err.email || "").toLowerCase().trim();
      return res.redirect(
        `${frontendUrl}/?oauth_action=pending&email=${encodeURIComponent(email)}`
      );
    }

    if (err.code === "ACCOUNT_SUSPENDED") {
      return res.redirect(
        `${frontendUrl}/?error=ACCOUNT_SUSPENDED&msg=${encodeURIComponent("Your SmartMove account has been suspended. Please contact the Transport Office.")}`
      );
    }

    const errorCode = err.code || "AUTH_FAILED";
    const errorMessage = err.message || "Google authentication failed";
    return res.redirect(
      `${frontendUrl}/?error=${encodeURIComponent(errorCode)}&msg=${encodeURIComponent(errorMessage)}`
    );
  }
});

/**
 * Real Google OAuth 2.0 Direct ID Token / Credential Verification Endpoint.
 * Takes { idToken } or { credential }, verifies with Google, checks MongoDB, returns JWT.
 */
router.post("/google", async (req, res, next) => {
  try {
    const { idToken, credential } = req.body;
    const token = idToken || credential;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Google credential token is required.",
        code: "TOKEN_REQUIRED",
      });
    }

    const googleProfile = await authService.verifyGoogleToken(token);
    const result = await authService.authenticateGoogleUser(googleProfile);

    res.json({
      success: true,
      message: "Google authentication successful",
      token: result.token,
      user: result.user,
    });
  } catch (err) {
    if (err.code === "NOT_REGISTERED") {
      const regToken = authService.generateRegistrationToken(
        err.googleProfile || { email: err.email, name: err.name, googleId: err.googleId, avatar: err.avatar }
      );
      return res.status(403).json({
        success: false,
        code: err.code,
        message: err.message,
        email: err.email,
        name: err.name,
        avatar: err.avatar,
        regToken,
      });
    }
    if (err.code) {
      return res.status(err.status || 403).json({
        success: false,
        code: err.code,
        message: err.message,
      });
    }
    next(err);
  }
});

/**
 * Development & Evaluation Login Endpoint.
 * Allows sign-in with verified seed credentials (e.g. admin@nec.edu.in, student@nec.edu.in)
 * Validates password with bcrypt against MongoDB.
 */
router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
        code: "CREDENTIALS_REQUIRED",
      });
    }

    const result = await authService.devLogin(email, password);

    res.json({
      success: true,
      message: "Login successful",
      token: result.token,
      user: result.user,
    });
  } catch (err) {
    if (err.code) {
      return res.status(err.status || 403).json({
        success: false,
        code: err.code,
        message: err.message,
      });
    }
    next(err);
  }
});

/**
 * Get currently authenticated session user profile.
 */
router.get("/me", authenticateUser, async (req, res) => {
  res.json({
    success: true,
    user: req.user.toSafeObject(),
  });
});

/**
 * Logout invalidates client session.
 */
router.post("/logout", authenticateUser, (req, res) => {
  res.json({
    success: true,
    message: "Logged out successfully",
  });
});

module.exports = router;
