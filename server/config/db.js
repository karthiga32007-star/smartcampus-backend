const dns = require("dns");
const mongoose = require("mongoose");
const config = require("./index");

// Fallback to public DNS servers if Windows local resolver fails on SRV lookup
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore in environments where setting DNS servers is restricted
}

async function connectDB() {
  if (!config.mongodbUri) {
    console.error("FATAL: MONGODB_URI is not defined in environment variables.");
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(config.mongodbUri, {
      serverSelectionTimeoutMS: 15000,
      autoIndex: true,
    });

    console.log(`====================================================`);
    console.log(` MongoDB Atlas Connected: ${conn.connection.host}  `);
    console.log(` Database: ${conn.connection.name}                  `);
    console.log(`====================================================`);
    return conn;
  } catch (error) {
    console.error("MongoDB Atlas connection error:", error.message);
    process.exit(1);
  }
}

mongoose.connection.on("disconnected", () => {
  console.warn("MongoDB Atlas disconnected! Attempting reconnect...");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection runtime error:", err.message);
});

module.exports = connectDB;
