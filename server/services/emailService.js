const config = require("../config");
const EmailNotification = require("../models/EmailNotification");

/**
 * Dispatches an email via EmailJS REST API and records the audit record in MongoDB.
 */
async function sendEmail({ toEmail, recipientName, templateId, subject, templateParams = {} }) {
  const isEmailJsConfigured =
    config.emailJsServiceId &&
    config.emailJsTemplateId &&
    config.emailJsPublicKey &&
    config.emailJsPublicKey !== "placeholder_public_key";

  const emailRecord = new EmailNotification({
    toEmail,
    recipientName: recipientName || "Valued Member",
    templateId: templateId || config.emailJsTemplateId,
    subject,
    templateParams,
    status: "QUEUED",
  });

  if (!isEmailJsConfigured) {
    // In development or when keys are placeholders, log to server console and record as sent
    console.log(`[EMAIL DISPATCH] To: ${toEmail} | Subject: ${subject}`);
    console.log(`[EMAIL PARAMS]`, templateParams);
    emailRecord.status = "SENT";
    await emailRecord.save();
    return { success: true, simulated: true };
  }

  try {
    const payload = {
      service_id: config.emailJsServiceId,
      template_id: templateId || config.emailJsTemplateId,
      user_id: config.emailJsPublicKey,
      accessToken: config.emailJsPrivateKey,
      template_params: {
        to_email: toEmail,
        to_name: recipientName,
        subject: subject,
        ...templateParams,
      },
    };

    const response = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      emailRecord.status = "SENT";
      await emailRecord.save();
      return { success: true };
    } else {
      const errText = await response.text();
      emailRecord.status = "FAILED";
      emailRecord.errorDetails = errText;
      await emailRecord.save();
      console.error("[EmailJS Error]:", errText);
      return { success: false, error: errText };
    }
  } catch (error) {
    emailRecord.status = "FAILED";
    emailRecord.errorDetails = error.message;
    await emailRecord.save();
    console.error("[EmailJS Exception]:", error.message);
    return { success: false, error: error.message };
  }
}

// ----------------- Typed Email Helpers -----------------

async function notifyRegistrationApproved({ toEmail, name, routeName, busNumber, seatNumber }) {
  return sendEmail({
    toEmail,
    recipientName: name,
    subject: "SmartMove — Transport Registration Approved!",
    templateParams: {
      student_name: name,
      route_name: routeName,
      bus_number: busNumber,
      seat_number: seatNumber,
      message: `Your transport registration for ${routeName} has been approved. You have been assigned Bus ${busNumber}, Seat ${seatNumber}. Your digital pass is now active.`,
    },
  });
}

async function notifyRegistrationRejected({ toEmail, name, reason }) {
  return sendEmail({
    toEmail,
    recipientName: name,
    subject: "SmartMove — Transport Registration Update",
    templateParams: {
      student_name: name,
      message: `Your transport registration could not be approved at this time.${reason ? ` Reason: ${reason}` : ""} Please contact the transport office or submit a revised request.`,
    },
  });
}

async function notifyStudentBoarded({ toEmail, parentName, studentName, busNumber, stopName, time }) {
  return sendEmail({
    toEmail,
    recipientName: parentName,
    subject: `SmartMove — ${studentName} has Boarded Bus ${busNumber}`,
    templateParams: {
      student_name: studentName,
      bus_number: busNumber,
      stop_name: stopName,
      time: time || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      message: `${studentName} has safely boarded College Bus ${busNumber} at ${stopName}.`,
    },
  });
}

async function notifyStudentDropped({ toEmail, parentName, studentName, busNumber, stopName, time }) {
  return sendEmail({
    toEmail,
    recipientName: parentName,
    subject: `SmartMove — ${studentName} has Reached ${stopName}`,
    templateParams: {
      student_name: studentName,
      bus_number: busNumber,
      stop_name: stopName,
      time: time || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
      message: `${studentName} has safely alighted from College Bus ${busNumber} at ${stopName}.`,
    },
  });
}

async function notifyBusDelay({ toEmail, name, busNumber, delayMins, routeName }) {
  return sendEmail({
    toEmail,
    recipientName: name,
    subject: `SmartMove Alert: Bus ${busNumber} Delayed by ~${delayMins} Mins`,
    templateParams: {
      bus_number: busNumber,
      route_name: routeName,
      delay_minutes: String(delayMins),
      message: `Bus ${busNumber} on route ${routeName} is running approximately ${delayMins} minutes behind schedule due to transit conditions.`,
    },
  });
}

async function notifyEmergencySOS({ toEmail, name, busNumber, description }) {
  return sendEmail({
    toEmail,
    recipientName: name,
    subject: `URGENT: Emergency Alert Reported for Bus ${busNumber}`,
    templateParams: {
      bus_number: busNumber,
      message: `An emergency alert has been broadcast for Bus ${busNumber}: "${description}". The transport office has dispatched immediate assistance.`,
    },
  });
}

async function notifyRegistrationReceived({ toEmail, name, requestedRole }) {
  return sendEmail({
    toEmail,
    recipientName: name,
    subject: "SmartMove Registration Received",
    templateParams: {
      student_name: name,
      message: `Your registration request for role ${requestedRole} has been received and is under review by the National Engineering College Transport Office. You will receive an update once reviewed.`,
    },
  });
}

async function notifyAccountApproved({ toEmail, name, role }) {
  return sendEmail({
    toEmail,
    recipientName: name,
    subject: "SmartMove Registration Approved",
    templateParams: {
      student_name: name,
      message: `Congratulations! Your SmartMove account (${role}) has been approved and activated. You can now sign in using your verified Google account or institutional credentials.`,
    },
  });
}

async function notifyAccountRejected({ toEmail, name, reason }) {
  return sendEmail({
    toEmail,
    recipientName: name,
    subject: "SmartMove Registration Update",
    templateParams: {
      student_name: name,
      message: `Your SmartMove account registration could not be approved at this time.${reason ? ` Reason: ${reason}` : ""} Please contact the Transport Office for clarification.`,
    },
  });
}

module.exports = {
  sendEmail,
  notifyRegistrationApproved,
  notifyRegistrationRejected,
  notifyStudentBoarded,
  notifyStudentDropped,
  notifyBusDelay,
  notifyEmergencySOS,
  notifyRegistrationReceived,
  notifyAccountApproved,
  notifyAccountRejected,
};

