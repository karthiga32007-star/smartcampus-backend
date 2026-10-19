const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const FacultyProfile = require("../models/FacultyProfile");
const ParentProfile = require("../models/ParentProfile");
const Driver = require("../models/Driver");
const Stop = require("../models/Stop");
const Route = require("../models/Route");
const Bus = require("../models/Bus");
const TransportRegistration = require("../models/TransportRegistration");
const TransportPass = require("../models/TransportPass");
const Trip = require("../models/Trip");
const Attendance = require("../models/Attendance");
const Complaint = require("../models/Complaint");
const Feedback = require("../models/Feedback");
const Maintenance = require("../models/Maintenance");
const Announcement = require("../models/Announcement");
const Notification = require("../models/Notification");
const SystemSetting = require("../models/SystemSetting");
const AuditLog = require("../models/AuditLog");

async function seed() {
  console.log("Starting SmartMove MongoDB Atlas Seeding...");
  await connectDB();

  console.log("Clearing existing collections...");
  await Promise.all([
    User.deleteMany(),
    StudentProfile.deleteMany(),
    FacultyProfile.deleteMany(),
    ParentProfile.deleteMany(),
    Driver.deleteMany(),
    Stop.deleteMany(),
    Route.deleteMany(),
    Bus.deleteMany(),
    TransportRegistration.deleteMany(),
    TransportPass.deleteMany(),
    Trip.deleteMany(),
    Attendance.deleteMany(),
    Complaint.deleteMany(),
    Feedback.deleteMany(),
    Maintenance.deleteMany(),
    Announcement.deleteMany(),
    Notification.deleteMany(),
    SystemSetting.deleteMany(),
    AuditLog.deleteMany(),
  ]);

  console.log("Seeding System Settings...");
  await SystemSetting.create([
    { key: "email_notifications", value: true, description: "Send automated email alerts to parents & riders" },
    { key: "auto_allocate_seats", value: true, description: "Automatically allot the first available seat" },
    { key: "default_capacity", value: 50, description: "Standard bus capacity" },
    { key: "session_timeout_mins", value: 30, description: "Inactivity timeout in minutes" },
  ]);

  console.log("Seeding Bus Stops...");
  const stops = await Stop.create([
    // Route 1 (Tirunelveli)
    { code: "R1A", name: "Tirunelveli New Bus Stand", area: "Tirunelveli", latitude: 8.7139, longitude: 77.7567 },
    { code: "R1B", name: "Gangaikondan", area: "Gangaikondan", latitude: 8.8523, longitude: 77.7845 },
    { code: "R1C", name: "Kayathar", area: "Kayathar", latitude: 8.9567, longitude: 77.7723 },
    { code: "R1D", name: "Kovilpatti Bus Stand", area: "Kovilpatti", latitude: 9.1723, longitude: 77.8689 },

    // Route 2 (Thoothukudi)
    { code: "R2A", name: "Thoothukudi New Bus Stand", area: "Thoothukudi", latitude: 8.7642, longitude: 78.1348 },
    { code: "R2B", name: "Ottapidaram", area: "Ottapidaram", latitude: 8.9042, longitude: 78.0125 },
    { code: "R2C", name: "Kovilpatti Bus Stand", area: "Kovilpatti", latitude: 9.1723, longitude: 77.8689 },

    // Route 3 (Sivakasi)
    { code: "R3A", name: "Sivakasi Bus Stand", area: "Sivakasi", latitude: 9.4533, longitude: 77.7946 },
    { code: "R3B", name: "Sattur Bus Stand", area: "Sattur", latitude: 9.3621, longitude: 77.9254 },
    { code: "R3C", name: "Kovilpatti Bus Stand", area: "Kovilpatti", latitude: 9.1723, longitude: 77.8689 },

    // Route 4 (Tenkasi)
    { code: "R4A", name: "Tenkasi Bus Stand", area: "Tenkasi", latitude: 8.9594, longitude: 77.3152 },
    { code: "R4B", name: "Sankarankovil Bus Stand", area: "Sankarankovil", latitude: 9.1718, longitude: 77.5342 },
    { code: "R4C", name: "Kovilpatti Bus Stand", area: "Kovilpatti", latitude: 9.1723, longitude: 77.8689 },
  ]);

  const stopMap = {};
  stops.forEach((s) => {
    stopMap[s.code] = s;
  });

  console.log("Seeding Routes...");
  const routes = await Route.create([
    {
      code: "R1",
      name: "Tirunelveli Route",
      via: "Tirunelveli – Gangaikondan – Kayathar – Kovilpatti",
      fee: 12500,
      arrivalAtCollege: "08:30",
      departureFromCollege: "16:30",
      distanceKm: 48,
      stops: [
        { stop: stopMap["R1A"]._id, stopOrder: 1, morningTime: "06:45", eveningTime: "18:10" },
        { stop: stopMap["R1B"]._id, stopOrder: 2, morningTime: "07:10", eveningTime: "17:45" },
        { stop: stopMap["R1C"]._id, stopOrder: 3, morningTime: "07:35", eveningTime: "17:20" },
        { stop: stopMap["R1D"]._id, stopOrder: 4, morningTime: "08:05", eveningTime: "16:55" },
      ],
    },
    {
      code: "R2",
      name: "Thoothukudi Route",
      via: "Thoothukudi – Ottapidaram – Kovilpatti",
      fee: 11000,
      arrivalAtCollege: "08:30",
      departureFromCollege: "16:30",
      distanceKm: 42,
      stops: [
        { stop: stopMap["R2A"]._id, stopOrder: 1, morningTime: "07:00", eveningTime: "18:00" },
        { stop: stopMap["R2B"]._id, stopOrder: 2, morningTime: "07:30", eveningTime: "17:30" },
        { stop: stopMap["R2C"]._id, stopOrder: 3, morningTime: "08:05", eveningTime: "16:55" },
      ],
    },
    {
      code: "R3",
      name: "Sivakasi Route",
      via: "Sivakasi – Sattur – Kovilpatti",
      fee: 10500,
      arrivalAtCollege: "08:30",
      departureFromCollege: "16:30",
      distanceKm: 36,
      stops: [
        { stop: stopMap["R3A"]._id, stopOrder: 1, morningTime: "06:50", eveningTime: "18:10" },
        { stop: stopMap["R3B"]._id, stopOrder: 2, morningTime: "07:20", eveningTime: "17:40" },
        { stop: stopMap["R3C"]._id, stopOrder: 3, morningTime: "08:05", eveningTime: "16:55" },
      ],
    },
    {
      code: "R4",
      name: "Tenkasi Route",
      via: "Tenkasi – Sankarankovil – Kovilpatti",
      fee: 13500,
      arrivalAtCollege: "08:30",
      departureFromCollege: "16:30",
      distanceKm: 55,
      stops: [
        { stop: stopMap["R4A"]._id, stopOrder: 1, morningTime: "06:30", eveningTime: "18:20" },
        { stop: stopMap["R4B"]._id, stopOrder: 2, morningTime: "07:20", eveningTime: "17:30" },
        { stop: stopMap["R4C"]._id, stopOrder: 3, morningTime: "08:05", eveningTime: "16:55" },
      ],
    },
  ]);

  const routeMap = {};
  routes.forEach((r) => {
    routeMap[r.code] = r;
  });

  console.log("Seeding Buses...");
  const buses = await Bus.create([
    {
      busNumber: "NEC-01",
      registrationNumber: "TN 72 AX 1201",
      capacity: 50,
      busType: "Standard",
      status: "Active",
      assignedRoute: routeMap["R1"]._id,
    },
    {
      busNumber: "NEC-02",
      registrationNumber: "TN 72 AX 1202",
      capacity: 50,
      busType: "Standard",
      status: "Active",
      assignedRoute: routeMap["R1"]._id,
    },
    {
      busNumber: "NEC-03",
      registrationNumber: "TN 72 BY 2203",
      capacity: 45,
      busType: "Standard",
      status: "Active",
      assignedRoute: routeMap["R2"]._id,
    },
    {
      busNumber: "NEC-04",
      registrationNumber: "TN 72 CZ 3304",
      capacity: 45,
      busType: "Standard",
      status: "Active",
      assignedRoute: routeMap["R3"]._id,
    },
    {
      busNumber: "NEC-05",
      registrationNumber: "TN 72 DA 4405",
      capacity: 40,
      busType: "Mini",
      status: "Active",
      assignedRoute: routeMap["R4"]._id,
    },
    {
      busNumber: "NEC-06",
      registrationNumber: "TN 72 EE 5506",
      capacity: 45,
      busType: "Standard",
      status: "In Maintenance",
      assignedRoute: null,
    },
  ]);

  const busMap = {};
  buses.forEach((b) => {
    busMap[b.busNumber] = b;
  });

  console.log("Seeding Drivers...");
  const drivers = await Driver.create([
    {
      driverCode: "D001",
      name: "Suresh Kumar",
      phone: "90000 11111",
      licenseNumber: "TN72 20230145",
      licenseExpiry: "2027-03-14",
      experienceYears: 8,
      status: "Active",
      assignedBus: busMap["NEC-01"]._id,
    },
    {
      driverCode: "D002",
      name: "Manoj Rao",
      phone: "90000 22222",
      licenseNumber: "TN72 20220098",
      licenseExpiry: "2026-11-02",
      experienceYears: 5,
      status: "Active",
      assignedBus: busMap["NEC-03"]._id,
    },
    {
      driverCode: "D003",
      name: "Farah Sheikh",
      phone: "90000 33333",
      licenseNumber: "TN72 20210077",
      licenseExpiry: "2027-07-19",
      experienceYears: 6,
      status: "Active",
      assignedBus: busMap["NEC-04"]._id,
    },
    {
      driverCode: "D004",
      name: "Devika Nair",
      phone: "90000 44444",
      licenseNumber: "TN72 20230211",
      licenseExpiry: "2028-01-30",
      experienceYears: 3,
      status: "Active",
      assignedBus: busMap["NEC-05"]._id,
    },
    {
      driverCode: "D005",
      name: "Anil Verma",
      phone: "90000 55555",
      licenseNumber: "TN72 20190034",
      licenseExpiry: "2026-12-05",
      experienceYears: 11,
      status: "Active",
      assignedBus: busMap["NEC-02"]._id,
    },
  ]);

  // Connect bus to assigned driver
  await Bus.findByIdAndUpdate(busMap["NEC-01"]._id, { assignedDriver: drivers[0]._id });
  await Bus.findByIdAndUpdate(busMap["NEC-03"]._id, { assignedDriver: drivers[1]._id });
  await Bus.findByIdAndUpdate(busMap["NEC-04"]._id, { assignedDriver: drivers[2]._id });
  await Bus.findByIdAndUpdate(busMap["NEC-05"]._id, { assignedDriver: drivers[3]._id });
  await Bus.findByIdAndUpdate(busMap["NEC-02"]._id, { assignedDriver: drivers[4]._id });

  console.log("Seeding Users & Profiles...");
  const passwordHash = bcrypt.hashSync("nec@123", 10);

  // 1. Admin
  const adminUser = await User.create({
    name: "Arvind Rao",
    email: "admin@nec.edu.in",
    role: "TRANSPORT_ADMIN",
    status: "Active",
    passwordHash,
    phone: "95555 12345",
  });

  // 2. Transport Staff
  const staffUser = await User.create({
    name: "Ravi Shankar",
    email: "staff@nec.edu.in",
    role: "TRANSPORT_STAFF",
    status: "Active",
    passwordHash,
    phone: "94444 54321",
  });

  // 3. Driver User
  const driverUser = await User.create({
    name: "Suresh Kumar",
    email: "driver@nec.edu.in",
    role: "DRIVER",
    status: "Active",
    passwordHash,
    phone: "90000 11111",
  });
  await Driver.findByIdAndUpdate(drivers[0]._id, { user: driverUser._id });

  // 4. Parent User
  const parentUser = await User.create({
    name: "Venkat Reddy",
    email: "parent@nec.edu.in",
    role: "PARENT",
    status: "Active",
    passwordHash,
    phone: "98765 00000",
  });

  // 5. Student User
  const studentUser = await User.create({
    name: "Ananya Reddy",
    email: "student@nec.edu.in",
    role: "STUDENT",
    status: "Active",
    passwordHash,
    phone: "98765 43210",
  });

  const studentProfile = await StudentProfile.create({
    user: studentUser._id,
    studentId: "STU001",
    department: "Computer Science & Engineering",
    year: "3rd Year",
    section: "A",
    emergencyContact: "Mr. Venkat Reddy · 98765 00000",
    parentUser: parentUser._id,
  });

  await ParentProfile.create({
    user: parentUser._id,
    emergencyContact: "Ananya Reddy (daughter) · 98765 43210",
    students: [studentProfile._id],
    studentIds: ["STU001"],
  });

  // 6. Faculty User
  const facultyUser = await User.create({
    name: "Dr. Meera Nair",
    email: "faculty@nec.edu.in",
    role: "FACULTY",
    status: "Active",
    passwordHash,
    phone: "93333 77777",
  });

  await FacultyProfile.create({
    user: facultyUser._id,
    employeeId: "FAC001",
    department: "Mechanical Engineering",
    designation: "Associate Professor",
    emergencyContact: "Mr. Nair · 93333 88888",
  });

  // 7. General user account for user@nec.edu.in (student persona)
  const commonUser = await User.create({
    name: "Karthika Lakshmanan",
    email: "user@nec.edu.in",
    role: "STUDENT",
    status: "Active",
    passwordHash,
    phone: "98765 11223",
  });
  await StudentProfile.create({
    user: commonUser._id,
    studentId: "STU002",
    department: "Electronics & Communication",
    year: "2nd Year",
    section: "B",
    emergencyContact: "Mr. Lakshmanan · 98765 99887",
  });

  // 8. Sample registered Gmail account (Demonstrating any Google account authorization)
  const gmailStudent = await User.create({
    name: "Priya Sharma",
    email: "student.demo@gmail.com",
    role: "STUDENT",
    status: "Active",
    passwordHash,
    phone: "98765 33445",
  });
  await StudentProfile.create({
    user: gmailStudent._id,
    studentId: "STU003",
    department: "Information Technology",
    year: "3rd Year",
    section: "A",
    emergencyContact: "Mrs. Sharma · 98765 33440",
  });

  // 9. Sample Suspended Account (Testing SUSPENDED state rejection)
  await User.create({
    name: "Suspended Commuter",
    email: "suspended.user@gmail.com",
    role: "STUDENT",
    status: "Suspended",
    passwordHash,
    phone: "98765 55667",
  });

  // 10. Sample Pending Account (Testing PENDING approval state)
  await User.create({
    name: "Pending Applicant",
    email: "pending.user@gmail.com",
    role: "STUDENT",
    status: "Pending",
    passwordHash,
    phone: "98765 77889",
  });

  console.log("Seeding Approved Transport Registration & Digital Pass...");
  const approvedReg = await TransportRegistration.create({
    regCode: "REG-1001",
    user: studentUser._id,
    personId: "STU001",
    personName: "Ananya Reddy",
    applicantType: "Student",
    department: "Computer Science & Engineering",
    phone: "98765 43210",
    route: routeMap["R1"]._id,
    pickupStop: stopMap["R1A"]._id,
    dropStop: stopMap["R1D"]._id,
    status: "Approved",
    assignedBus: busMap["NEC-01"]._id,
    assignedSeat: "01A",
  });

  await TransportPass.create({
    passNumber: "NEC-PASS-2026-STU001",
    user: studentUser._id,
    registration: approvedReg._id,
    personId: "STU001",
    holderName: "Ananya Reddy",
    holderType: "Student",
    department: "CSE · 3rd Year",
    routeName: routeMap["R1"].name,
    pickupStopName: stopMap["R1A"].name,
    dropStopName: stopMap["R1D"].name,
    busNumber: "NEC-01",
    seatNumber: "01A",
    academicYear: "2026-2027",
    status: "ACTIVE",
  });

  console.log("Seeding Attendance, Complaints, Feedback, Maintenance, Announcements...");
  const today = new Date().toISOString().slice(0, 10);

  // Today's Trip & Boarding Attendance
  const trip = await Trip.create({
    bus: busMap["NEC-01"]._id,
    driver: drivers[0]._id,
    route: routeMap["R1"]._id,
    date: today,
    direction: "MORNING",
    status: "RUNNING",
    currentStopIndex: 1,
    phase: "AT_STOP",
    startedAt: "06:45",
    stopTimestamps: { 0: "06:45", 1: "07:10" },
  });

  await Attendance.create({
    registration: approvedReg._id,
    trip: trip._id,
    student: studentUser._id,
    personId: "STU001",
    studentName: "Ananya Reddy",
    bus: busMap["NEC-01"]._id,
    stop: stopMap["R1A"]._id,
    stopName: stopMap["R1A"].name,
    date: today,
    direction: "MORNING",
    status: "BOARDED",
    markedAt: "06:48",
    markedBy: driverUser._id,
  });

  // Complaint
  await Complaint.create([
    {
      ticketId: "CMP-1001",
      user: studentUser._id,
      userName: "Ananya Reddy",
      category: "Delay",
      route: routeMap["R1"]._id,
      routeName: routeMap["R1"].name,
      description: "Morning bus was 15 minutes late at Kayathar junction due to road works.",
      priority: "Medium",
      status: "IN_REVIEW",
      adminResponse: "Driver was instructed to take the bypass bridge from tomorrow.",
    },
  ]);

  // Feedback
  await Feedback.create([
    {
      user: studentUser._id,
      userName: "Ananya Reddy",
      route: routeMap["R1"]._id,
      routeName: routeMap["R1"].name,
      bus: busMap["NEC-01"]._id,
      rating: 5,
      comment: "Very polite driver and smooth journey every morning.",
    },
  ]);

  // Maintenance
  await Maintenance.create([
    {
      bus: busMap["NEC-06"]._id,
      busNumber: "NEC-06",
      maintenanceType: "Gearbox",
      description: "Gearbox overhaul and clutch plate servicing underway in college workshop.",
      priority: "High",
      status: "IN_PROGRESS",
      scheduledDate: today,
    },
    {
      bus: busMap["NEC-03"]._id,
      busNumber: "NEC-03",
      maintenanceType: "Insurance/Cert",
      description: "Annual commercial vehicle fitness inspection due next week.",
      priority: "Medium",
      status: "SCHEDULED",
      scheduledDate: "2026-10-15",
    },
  ]);

  // Announcements
  await Announcement.create([
    {
      title: "College Bus Schedule for Even Semester",
      message: "Morning buses will commence pickups 10 minutes earlier on Mondays for assembly.",
      priority: "Important",
      targetAudience: "All",
      publishedBy: adminUser._id,
    },
    {
      title: "Sivakasi Route Bay Update",
      message: "Sivakasi bus will use Platform 3 at the New Bus Stand starting from this Wednesday.",
      priority: "Normal",
      targetAudience: "Students",
      publishedBy: adminUser._id,
    },
  ]);

  // In-app Notification
  await Notification.create([
    {
      recipient: studentUser._id,
      recipientTag: "STU001",
      title: "Boarding Confirmed",
      message: "Ananya Reddy marked Boarded at Tirunelveli New Bus Stand (06:48).",
      type: "SUCCESS",
      category: "board",
    },
    {
      recipientTag: "all",
      title: "Campus Transport Operational",
      message: "All 5 regional routes operating normally today.",
      type: "INFO",
      category: "info",
    },
  ]);

  // Audit Log
  await AuditLog.create([
    {
      actor: adminUser._id,
      actorName: "Arvind Rao",
      actorRole: "TRANSPORT_ADMIN",
      action: "DATABASE_SEEDED",
      entityType: "System",
      entityId: "ROOT",
      metadata: { environment: "development", totalBuses: 6, totalRoutes: 4 },
    },
  ]);

  console.log("====================================================");
  console.log(" MongoDB Atlas Database Seeded Successfully!        ");
  console.log("====================================================");
  console.log(" Demo Accounts (Password for all: nec@123):         ");
  console.log(" - Admin:    admin@nec.edu.in                       ");
  console.log(" - Driver:   driver@nec.edu.in                      ");
  console.log(" - Student:  student@nec.edu.in                     ");
  console.log(" - Parent:   parent@nec.edu.in                      ");
  console.log(" - Faculty:  faculty@nec.edu.in                     ");
  console.log(" - Staff:    staff@nec.edu.in                       ");
  console.log(" - Common:   user@nec.edu.in                        ");
  console.log("====================================================");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
