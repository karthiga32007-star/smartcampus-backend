const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || "development",
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET || "smartmove_super_secret_jwt_key_nec_2026",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:5173",

  // Google OAuth
  googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  googleCallbackUrl: process.env.GOOGLE_CALLBACK_URL || "",

  // EmailJS Service
  emailJsServiceId: process.env.EMAILJS_SERVICE_ID || "",
  emailJsTemplateId: process.env.EMAILJS_TEMPLATE_ID || "",
  emailJsPublicKey: process.env.EMAILJS_PUBLIC_KEY || "",
  emailJsPrivateKey: process.env.EMAILJS_PRIVATE_KEY || "",

  // Socket.IO
  socketCorsOrigin: process.env.SOCKET_CORS_ORIGIN || "http://localhost:5173",
};
