const config = require("../config");

function errorHandler(err, req, res, next) {
  const statusCode = err.status || err.statusCode || 500;
  const message = err.message || "An unexpected internal server error occurred.";
  const code = err.code || "SERVER_ERROR";

  if (statusCode === 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
  } else {
    console.warn(`[WARN] ${req.method} ${req.originalUrl} (${statusCode}):`, message);
  }

  res.status(statusCode).json({
    success: false,
    message,
    code,
    ...(config.nodeEnv === "development" && statusCode === 500 ? { stack: err.stack } : {}),
  });
}

module.exports = errorHandler;
