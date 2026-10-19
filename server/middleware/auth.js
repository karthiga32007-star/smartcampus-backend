const jwt = require("jsonwebtoken");
const config = require("../config");
const User = require("../models/User");

async function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please log in.",
        code: "UNAUTHENTICATED",
      });
    }

    const token = authHeader.split(" ")[1];
    let decoded;

    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired session. Please sign in again.",
        code: "INVALID_TOKEN",
      });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User account not found.",
        code: "USER_NOT_FOUND",
      });
    }

    if (user.status === "Suspended") {
      return res.status(403).json({
        success: false,
        message: "Your account has been suspended by the transport office.",
        code: "ACCOUNT_SUSPENDED",
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
        code: "UNAUTHENTICATED",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Requires one of: ${allowedRoles.join(", ")}`,
        code: "FORBIDDEN",
      });
    }

    next();
  };
}

const requireAdmin = requireRole("TRANSPORT_ADMIN");

async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.verify(token, config.jwtSecret);
      const user = await User.findById(decoded.id);
      if (user && user.status === "Active") {
        req.user = user;
      }
    }
  } catch (e) {
    // ignore
  }
  next();
}

module.exports = {
  authenticateUser,
  requireRole,
  requireAdmin,
  optionalAuth,
};
