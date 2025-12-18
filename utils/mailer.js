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

module.exports = { sendVerificationEmail, sendResetPasswordCode };
