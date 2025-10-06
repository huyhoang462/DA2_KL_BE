const User = require("../models/user");
const bcrypt = require("bcryptjs");
const Verification = require("../models/verification");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail } = require("../utils/mailer");

const login = async ({ email, password }) => {
  if (!email || !password) {
    const error = new Error("Email and password are required");
    error.status = 400;
    throw error;
  }

  const user = await User.findOne({ email });
  if (!user) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  const userForToken = {
    email: user.email,
    id: user._id,
    role: user.role,
  };

  const token = jwt.sign(userForToken, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });

  return {
    token,
    user: {
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };
};

const registerRequest = async ({ email, password, name, role, phone }) => {
  if (!email || !password || !name || !role || !phone) {
    const error = new Error("All fields are required");
    error.status = 400;
    throw error;
  }

  if (password.length < 6) {
    const error = new Error("Password must be at least 6 characters long");
    error.status = 400;
    throw error;
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error("User already exists");
    error.status = 400;
    throw error;
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const newVerification = new Verification({
    email,
    passwordHash,
    name,
    role: "user",
    phone,
    otp,
  });
  await newVerification.save();

  await sendVerificationEmail(email, otp);

  return {
    message: "Verification code sent to your email. Please check your inbox.",
  };
};

const verifyEmail = async ({ email, otp }) => {
  if (!email || !otp) {
    const error = new Error("Email and OTP are required");
    error.status = 400;
    throw error;
  }

  const verificationRecord = await Verification.findOne({ email });

  if (!verificationRecord) {
    const error = new Error(
      "Verification record not found. Please try registering again."
    );
    error.status = 404;
    throw error;
  }

  if (verificationRecord.otp !== otp) {
    const error = new Error("Invalid verification code.");
    error.status = 400;
    throw error;
  }

  const newUser = new User({
    email: verificationRecord.email,
    passwordHash: verificationRecord.passwordHash,
    name: verificationRecord.name,
    phone: verificationRecord.phone,
    role: verificationRecord.role,
  });

  await newUser.save();
  await Verification.findByIdAndDelete(verificationRecord._id);

  return { message: "User created and verified successfully!" };
};

module.exports = { login, registerRequest, verifyEmail };
