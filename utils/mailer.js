const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendVerificationEmail = async (toEmail, verificationCode) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Your Verification Code for Ticketbox Clone",
    html: `
      <h1>Email Verification</h1>
      <p>Thank you for registering. Please use the following code to verify your email address:</p>
      <h2><strong>${verificationCode}</strong></h2>
      <p>This code will expire in 10 minutes.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Verification email sent successfully to", toEmail);
    console.log("Verification code:", verificationCode);
  } catch (error) {
    console.error("Error sending verification email:", error);
    throw new Error("Could not send verification email");
  }
};
const sendResetPasswordCode = async (toEmail, resetCode) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Your Password Reset Code for Shine Ticket",
    html: `
      <h1>Password Reset</h1>
      <p>You requested to reset your password. Please use the following code to reset your password:</p>
      <h2><strong>${resetCode}</strong></h2>
      <p>This code will expire in 10 minutes. If you did not request a password reset, please ignore this email.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Reset password email sent successfully to", toEmail);
  } catch (error) {
    console.error("Error sending reset password email:", error);
    throw new Error("Could not send reset password email");
  }
};

const sendEventRejectionEmail = async (
  toEmail,
  userName,
  eventName,
  reason
) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Event Submission Rejected - Shine Ticket",
    html: `
      <h1>Event Submission Rejected</h1>
      <p>Dear ${userName},</p>
      <p>We regret to inform you that your event submission "<strong>${eventName}</strong>" has been rejected.</p>
      <h3>Reason for Rejection:</h3>
      <p>${reason}</p>
      <p>If you have any questions or would like to resubmit your event with corrections, please contact our support team or update your event details and resubmit.</p>
      <br>
      <p>Best regards,</p>
      <p>Shine Ticket Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Event rejection email sent successfully to", toEmail);
  } catch (error) {
    console.error("Error sending event rejection email:", error);
    throw new Error("Could not send event rejection email");
  }
};

const sendUserBannedEmail = async (toEmail, userName, reason) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Account Suspended - Shine Ticket",
    html: `
      <h1>Account Suspended</h1>
      <p>Dear ${userName},</p>
      <p>Your account has been suspended by our administrative team.</p>
      <h3>Reason:</h3>
      <p>${reason}</p>
      <p>You will not be able to access your account until this suspension is lifted.</p>
      <p>If you believe this is a mistake or would like to appeal this decision, please contact our support team.</p>
      <br>
      <p>Best regards,</p>
      <p>Shine Ticket Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("User banned email sent successfully to", toEmail);
  } catch (error) {
    console.error("Error sending user banned email:", error);
    throw new Error("Could not send user banned email");
  }
};

const sendUserUnbannedEmail = async (toEmail, userName) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Account Reactivated - Shine Ticket",
    html: `
      <h1>Account Reactivated</h1>
      <p>Dear ${userName},</p>
      <p>Good news! Your account has been reactivated.</p>
      <p>You can now log in and access all features of Shine Ticket.</p>
      <p>If you have any questions, please contact our support team.</p>
      <br>
      <p>Best regards,</p>
      <p>Shine Ticket Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("User unbanned email sent successfully to", toEmail);
  } catch (error) {
    console.error("Error sending user unbanned email:", error);
    throw new Error("Could not send user unbanned email");
  }
};

const sendEventApprovedEmail = async (toEmail, userName, eventName) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Event Approved - Shine Ticket",
    html: `
      <h1>Event Approved!</h1>
      <p>Dear ${userName},</p>
      <p>Great news! Your event "<strong>${eventName}</strong>" has been approved and is now live on Shine Ticket.</p>
      <p>Your event is now visible to all users and they can start purchasing tickets.</p>
      <p>You can manage your event and view ticket sales from your dashboard.</p>
      <br>
      <p>Best regards,</p>
      <p>Shine Ticket Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Event approved email sent successfully to", toEmail);
  } catch (error) {
    console.error("Error sending event approved email:", error);
    throw new Error("Could not send event approved email");
  }
};

const sendEventCancelledEmail = async (
  toEmail,
  userName,
  eventName,
  reason
) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: toEmail,
    subject: "Event Cancelled - Shine Ticket",
    html: `
      <h1>Event Cancelled</h1>
      <p>Dear ${userName},</p>
      <p>We regret to inform you that your event "<strong>${eventName}</strong>" has been cancelled.</p>
      <h3>Reason:</h3>
      <p>${reason}</p>
      <p>If you have any questions or concerns, please contact our support team.</p>
      <br>
      <p>Best regards,</p>
      <p>Shine Ticket Team</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Event cancelled email sent successfully to", toEmail);
  } catch (error) {
    console.error("Error sending event cancelled email:", error);
    throw new Error("Could not send event cancelled email");
  }
};

module.exports = {
  sendVerificationEmail,
  sendResetPasswordCode,
  sendEventRejectionEmail,
  sendUserBannedEmail,
  sendUserUnbannedEmail,
  sendEventApprovedEmail,
  sendEventCancelledEmail,
};
