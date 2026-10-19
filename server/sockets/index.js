const { Server } = require("socket.io");
const config = require("../config");
const BusLocation = require("../models/BusLocation");
const Bus = require("../models/Bus");

let io = null;

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        // Allow all local dev origins and configured frontend URL
        callback(null, true);
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    pingTimeout: 60000,
  });

  io.on("connection", (socket) => {
    // Client joins room based on role or subscription
    socket.on("join:bus", (busId) => {
      if (busId) {
        socket.join(`bus:${busId}`);
      }
    });

    socket.on("leave:bus", (busId) => {
      if (busId) {
        socket.leave(`bus:${busId}`);
      }
    });

    socket.on("join:user", (userId) => {
      if (userId) {
        socket.join(`user:${userId}`);
      }
    });

    socket.on("join:role", (role) => {
      if (role) {
        socket.join(`role:${role.toLowerCase()}`);
      }
    });

    // Driver streams real-time GPS coordinates
    socket.on("driver:location", async (data) => {
      try {
        const { busId, tripId, driverId, latitude, longitude, speed, heading, accuracy } = data;
        if (!busId || latitude === undefined || longitude === undefined) return;

        // Persist location breadcrumb in MongoDB
        await BusLocation.create({
          bus: busId,
          trip: tripId || null,
          driver: driverId || null,
          latitude,
          longitude,
          speed: speed || null,
          heading: heading || null,
          accuracy: accuracy || null,
          recordedAt: new Date(),
        });

        const payload = {
          busId,
          latitude,
          longitude,
          speed,
          heading,
          accuracy,
          recordedAt: new Date().toISOString(),
          isLive: true,
        };

        // Broadcast to listeners of this bus and to admin dashboard
        io.to(`bus:${busId}`).emit("bus:location_updated", payload);
        io.to("role:admin").emit("bus:location_updated", payload);
        io.to("role:transport_admin").emit("bus:location_updated", payload);
      } catch (err) {
        console.error("Socket driver:location error:", err.message);
      }
    });

    // Driver triggers Emergency SOS
    socket.on("driver:emergency", async (data) => {
      const { busId, busNumber, driverName, location, description } = data;
      const payload = {
        busId,
        busNumber,
        driverName,
        location,
        description: description || "Driver reported emergency breakdown/incident.",
        timestamp: new Date().toISOString(),
      };

      // Mark bus status in DB
      try {
        if (busId) {
          await Bus.findByIdAndUpdate(busId, { status: "Emergency" });
        }
      } catch (e) {}

      io.to("role:admin").emit("emergency:alert", payload);
      io.to("role:transport_admin").emit("emergency:alert", payload);
      io.to("role:transport_staff").emit("emergency:alert", payload);
      io.to(`bus:${busId}`).emit("emergency:alert", payload);
    });

    socket.on("disconnect", () => {
      // Disconnected
    });
  });

  console.log("Socket.IO Real-Time Engine Initialized.");
  return io;
}

function getIO() {
  return io;
}

function emitToBus(busId, event, data) {
  if (io) io.to(`bus:${busId}`).emit(event, data);
}

function emitToUser(userId, event, data) {
  if (io) io.to(`user:${userId}`).emit(event, data);
}

function emitToRole(role, event, data) {
  if (io) io.to(`role:${role.toLowerCase()}`).emit(event, data);
}

function broadcast(event, data) {
  if (io) io.emit(event, data);
}

module.exports = {
  initSocket,
  getIO,
  emitToBus,
  emitToUser,
  emitToRole,
  broadcast,
};
