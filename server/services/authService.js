const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const config = require("../config");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");

// Initialize Google OAuth2Client
const oauth2Client = new OAuth2Client(
  config.googleClientId,
  config.googleClientSecret,
  config.googleCallbackUrl
);

function generateToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
      name: user.name,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

function generateRegistrationToken(profile) {
  return jwt.sign(
    {
      googleId: profile.googleId || null,
      email: profile.email ? profile.email.toLowerCase().trim() : "",
      name: profile.name || "",
      avatar: profile.avatar || null,
      isGoogleVerified: true,
      purpose: "ACCOUNT_REGISTRATION",
    },
    config.jwtSecret,
    { expiresIn: "1h" }
  );
}

function verifyRegistrationToken(token) {
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (decoded.purpose !== "ACCOUNT_REGISTRATION") return null;
    return decoded;
  } catch (e) {
    return null;
  }
}


/**
 * Generate Google OAuth 2.0 authorization URL
 * Redirects user to Google's official account selector screen
 */
function getGoogleAuthUrl() {
  if (!config.googleClientId) {
    const err = new Error("Google OAuth Client ID is not configured in server/.env.");
    err.status = 500;
    throw err;
  }

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
    ],
    prompt: "select_account",
  });
}

/**
 * Handle Google OAuth callback authorization code exchange
 */
async function handleGoogleCallback(code) {
  if (!code) {
    const err = new Error("Authorization code is required from Google callback.");
    err.status = 400;
    err.code = "CODE_REQUIRED";
    throw err;
  }

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const ticket = await oauth2Client.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.googleClientId,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    const err = new Error("Unable to retrieve verified Google account email.");
    err.status = 400;
    err.code = "PROFILE_UNAVAILABLE";
    throw err;
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name || payload.email.split("@")[0],
    avatar: payload.picture || null,
  };
}

/**
 * Verifies authentic Google ID token from Google Identity Services
 */
async function verifyGoogleToken(idToken) {
  if (!idToken) {
    const err = new Error("Google credential token is required.");
    err.status = 400;
    err.code = "TOKEN_REQUIRED";
    throw err;
  }

  const ticket = await oauth2Client.verifyIdToken({
    idToken,
    audience: config.googleClientId,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    const err = new Error("Unable to retrieve Google user profile.");
    err.status = 400;
    err.code = "PROFILE_UNAVAILABLE";
    throw err;
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase().trim(),
    name: payload.name || payload.email.split("@")[0],
    avatar: payload.picture || null,
  };
}

/**
 * Authenticates a Google-verified user against SmartMove MongoDB authorization.
 * Strict separation: Google verifies identity, MongoDB determines authorization.
 *
 * - Does NOT restrict email domains (@gmail.com, @nec.edu.in, etc. all allowed).
 * - If user NOT in MongoDB: rejects with NOT_REGISTERED (does NOT create account).
 * - If account SUSPENDED: rejects with ACCOUNT_SUSPENDED.
 * - If account PENDING: rejects with ACCOUNT_PENDING.
 * - If account ACTIVE: reads server-assigned role from MongoDB, returns JWT.
 */
async function authenticateGoogleUser({ googleId, email, name, avatar }) {
  if (!email) {
    const err = new Error("A valid email address is required.");
    err.status = 400;
    err.code = "EMAIL_REQUIRED";
    throw err;
  }

  const cleanEmail = email.toLowerCase().trim();

  // MongoDB User Lookup (Authentication separate from Authorization)
  const user = await User.findOne({
    $or: [{ googleId }, { email: cleanEmail }],
  });

  // Unknown Google Account: NOT registered in SmartMove MongoDB
  if (!user) {
    const err = new Error(
      "Your Google account is authenticated, but this account is not registered for SmartMove. Please contact the Transport Office."
    );
    err.status = 403;
    err.code = "NOT_REGISTERED";
    err.email = cleanEmail;
    err.name = name || cleanEmail.split("@")[0];
    err.googleId = googleId;
    err.avatar = avatar;
    err.googleProfile = { googleId, email: cleanEmail, name: name || cleanEmail.split("@")[0], avatar };
    throw err;
  }

  // Account Status Check (ACTIVE, PENDING, SUSPENDED)
  const status = (user.status || "ACTIVE").toUpperCase();

  if (status === "SUSPENDED") {
    const err = new Error("Your SmartMove account has been suspended. Please contact the Transport Office.");
    err.status = 403;
    err.code = "ACCOUNT_SUSPENDED";
    throw err;
  }

  if (status === "PENDING") {
    const err = new Error("Your SmartMove account registration is pending approval by the Transport Office.");
    err.status = 403;
    err.code = "ACCOUNT_PENDING";
    throw err;
  }

  // ACTIVE User: update googleId and avatar if not set, update lastLogin
  if (!user.googleId || user.googleId !== googleId) {
    user.googleId = googleId;
  }
  if (avatar && !user.avatar) {
    user.avatar = avatar;
  }
  user.lastLogin = new Date();
  await user.save();

  // Audit Log
  try {
    await AuditLog.create({
      actor: user._id,
      actorName: user.name,
      actorRole: user.role,
      action: "USER_LOGGED_IN_OAUTH",
      entityType: "User",
      entityId: user._id.toString(),
      metadata: { email: cleanEmail, role: user.role },
    });
  } catch (e) {
    // ignore audit logging error
  }

  const token = generateToken(user);
  return { token, user: user.toSafeObject() };
}

/**
 * Standard password login for predefined seed accounts in development/evaluation.
 */
async function devLogin(email, password) {
  if (!email || !password) {
    const err = new Error("Email and password are required.");
    err.status = 400;
    throw err;
  }

  const cleanEmail = email.toLowerCase().trim();

  const user = await User.findOne({ email: cleanEmail });
  if (!user) {
    const err = new Error("Invalid email or password.");
    err.status = 401;
    throw err;
  }

  const status = (user.status || "ACTIVE").toUpperCase();
  if (status === "SUSPENDED") {
    const err = new Error("Your SmartMove account has been suspended. Please contact the Transport Office.");
    err.status = 403;
    err.code = "ACCOUNT_SUSPENDED";
    throw err;
  }

  if (status === "PENDING") {
    const err = new Error("Your SmartMove account registration is pending approval by the Transport Office.");
    err.status = 403;
    err.code = "ACCOUNT_PENDING";
    throw err;
  }

  if (!user.passwordHash || !bcrypt.compareSync(password, user.passwordHash)) {
    const err = new Error("Invalid email or password.");
    err.status = 401;
    throw err;
  }

  user.lastLogin = new Date();
  await user.save();

  const token = generateToken(user);
  return { token, user: user.toSafeObject() };
}

module.exports = {
  generateToken,
  generateRegistrationToken,
  verifyRegistrationToken,
  getGoogleAuthUrl,
  handleGoogleCallback,
  verifyGoogleToken,
  authenticateGoogleUser,
  upsertUserFromGoogle: authenticateGoogleUser, // backward compatibility alias
  devLogin,
};
