const Bus = require("../models/Bus");
const TransportRegistration = require("../models/TransportRegistration");

/**
 * Generates seat labels e.g. "01A", "01B", "01C", "01D", "02A"...
 */
function generateSeatList(capacity = 50) {
  const letters = ["A", "B", "C", "D"];
  const list = [];
  for (let i = 0; i < capacity; i++) {
    const row = String(Math.floor(i / 4) + 1).padStart(2, "0");
    const col = letters[i % 4];
    list.push(`${row}${col}`);
  }
  return list;
}

/**
 * Finds the first available seat on a bus and prevents duplicate seat allocations.
 */
async function allocateSeat(busId) {
  const bus = await Bus.findById(busId);
  if (!bus) {
    throw new Error("Bus not found for seat allocation.");
  }

  const approvedRegs = await TransportRegistration.find({
    assignedBus: busId,
    status: "Approved",
    assignedSeat: { $ne: null },
  }).select("assignedSeat");

  const occupiedSeats = new Set(approvedRegs.map((r) => r.assignedSeat));
  const allSeats = generateSeatList(bus.capacity);

  const availableSeat = allSeats.find((seat) => !occupiedSeats.has(seat));
  if (!availableSeat) {
    const err = new Error(`Bus ${bus.busNumber} has reached its maximum capacity of ${bus.capacity} seats.`);
    err.status = 400;
    err.code = "BUS_FULL";
    throw err;
  }

  return availableSeat;
}

/**
 * Gets occupancy metrics for a given bus.
 */
async function getOccupancy(busId) {
  const bus = await Bus.findById(busId);
  if (!bus) return null;

  const approvedRegs = await TransportRegistration.find({
    assignedBus: busId,
    status: "Approved",
    assignedSeat: { $ne: null },
  }).select("assignedSeat personName personId");

  const occupiedSeats = approvedRegs.map((r) => ({
    seat: r.assignedSeat,
    rider: r.personName,
    id: r.personId,
  }));

  const occupiedCount = approvedRegs.length;
  const freeCount = Math.max(0, bus.capacity - occupiedCount);
  const occupancyRate = bus.capacity ? Math.round((occupiedCount / bus.capacity) * 100) : 0;

  return {
    busNumber: bus.busNumber,
    registrationNumber: bus.registrationNumber,
    capacity: bus.capacity,
    occupiedCount,
    freeCount,
    occupancyRate,
    occupiedSeats,
  };
}

module.exports = {
  generateSeatList,
  allocateSeat,
  getOccupancy,
};
