const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");

const config = require("./config");
const connectDB = require("./config/db");
const errorHandler = require("./middleware/errorHandler");
const { initSocket } = require("./sockets");

// Initialize Express
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO
initSocket(server);

// Security Middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // allow loading Google GIS, maps if embedded
    crossOriginEmbedderPolicy: false,
  })
);

// MongoDB Body Sanitization against NoSQL injection (Express 5 compatible)
app.use((req, res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.params) mongoSanitize.sanitize(req.params);
  next();
});

// Rate Limiting on API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requests per 15 min window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
    code: "RATE_LIMIT_EXCEEDED",
  },
});
app.use("/api/", apiLimiter);

// CORS Configuration
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow localhost dev servers, mobile/curl, or configured frontend
      if (!origin || origin.includes("localhost") || origin === config.frontendUrl) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  })
);

// Body Parsing
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health Check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    service: "NEC Smart Campus Transport Production API",
    database: "MongoDB Atlas",
    timestamp: new Date().toISOString(),
    authentication: "Google OAuth 2.0 (All Valid Domains Supported - Domain Agnostic)",
    mode: config.nodeEnv,
  });
});

// Mount Routes (Modular REST Architecture)
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);
app.use("/api/registration", require("./routes/accountRegistration"));

app.use("/api/users", require("./routes/users"));
app.use("/api/students", require("./routes/students"));
app.use("/api/faculty", require("./routes/faculty"));
app.use("/api/parents", require("./routes/parents"));
app.use("/api/drivers", require("./routes/drivers"));
app.use("/api/buses", require("./routes/buses"));
app.use("/api/routes", require("./routes/routes"));
app.use("/api/stops", require("./routes/stops"));
app.use("/api/registrations", require("./routes/registrations"));
app.use("/api/trips", require("./routes/trips"));
app.use("/api/attendance", require("./routes/attendance"));
app.use("/api/tracking", require("./routes/tracking"));
app.use("/api/notifications", require("./routes/notifications"));
app.use("/api/complaints", require("./routes/complaints"));
app.use("/api/feedback", require("./routes/feedback"));
app.use("/api/maintenance", require("./routes/maintenance"));
app.use("/api/special-bus", require("./routes/specialBus"));
app.use("/api/announcements", require("./routes/announcements"));
app.use("/api/transport-pass", require("./routes/transportPass"));
app.use("/api/reports", require("./routes/reports"));
app.use("/api/admin", require("./routes/admin"));

// Global Error Handler
app.use(errorHandler);

// Connect to MongoDB and start listening
const PORT = config.port;

if (require.main === module) {
  connectDB().then(() => {
    server.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(` NEC SmartMove Production Backend Server Running!   `);
      console.log(` Port: ${PORT}                                      `);
      console.log(` Mode: ${config.nodeEnv}                            `);
      console.log(` Database: MongoDB Atlas (Mongoose)                 `);
      console.log(` Google OAuth: Enabled (All Valid Domains Supported)`);
      console.log(` OAuth URL: http://localhost:${PORT}/api/auth/google`);
      console.log(` Real-Time: Socket.IO Enabled                       `);
      console.log(` Payment Gateway: NONE (Out of scope)               `);
      console.log(` Health: http://localhost:${PORT}/api/health        `);
      console.log(`====================================================`);
    });
  });
}

module.exports = { app, server };
