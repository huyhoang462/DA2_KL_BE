const User = require("../models/user");
const bcrypt = require("bcryptjs");
const Verification = require("../models/verification");
const jwt = require("jsonwebtoken");
const {
  sendVerificationEmail,
  sendResetPasswordCode,
} = require("../utils/mailer");

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

  const accessTokenPayload = {
    id: user._id,
    email: user.email,
    role: user.role,
  };
  const accessToken = jwt.sign(
    accessTokenPayload,
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "15m",
    }
  );

  const refreshTokenPayload = {
    id: user._id,
  };
  const refreshToken = jwt.sign(
    refreshTokenPayload,
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "7d",
    }
  );

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
    },
  };
};

const refreshToken = async (token) => {
  if (!token) {
    const error = new Error("Refresh token is required");
    error.status = 401;
    throw error;
  }

  try {
    //  Xác thực Refresh Token
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      const error = new Error("User not found");
      error.status = 403;
      throw error;
    }

    // Tạo Access Token mới
    const accessTokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };
    const newAccessToken = jwt.sign(
      accessTokenPayload,
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "15m",
      }
    );

    // Trả về Access Token mới
    return { accessToken: newAccessToken };
  } catch (err) {
    const error = new Error("Invalid refresh token");
    error.status = 403;
    throw error;
  }
};

const registerRequest = async ({ email, password, fullName, role, phone }) => {
  if (!email || !password || !fullName || !role || !phone) {
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
    fullName,
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
    fullName: verificationRecord.fullName,
    phone: verificationRecord.phone,
    role: verificationRecord.role,
  });

  await newUser.save();
  await Verification.findByIdAndDelete(verificationRecord._id);

  return { message: "User created and verified successfully!" };
};

const forgotPassword = async ({ email }) => {
  if (!email) {
    const error = new Error("Email is required");
    error.status = 400;
    throw error;
  }
  const user = await User.findOne({ email });
  if (user) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordCode = code;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 10;
    await user.save();

    await sendResetPasswordCode(email, code);
  }
  return {
    message:
      "We have sent a verification code to your email. Please check your inbox.",
  };
};

const verifyResetCode = async ({ email, code }) => {
  if (!email || !code) {
    const error = new Error("Email and code are required");
    error.status = 400;
    throw error;
  }
  const user = await User.findOne({ email });

  if (
    !user ||
    user.resetPasswordCode !== code ||
    !user.resetPasswordExpires ||
    user.resetPasswordExpires < Date.now()
  ) {
    const error = new Error("Invalid or expired code");
    error.status = 400;
    throw error;
  }
  return { message: "Code verified. You can now reset your password." };
};

const resetPassword = async ({ email, code, newPassword }) => {
  if (!email || !code || !newPassword) {
    const error = new Error("All fields are required");
    error.status = 400;
    throw error;
  }
  const user = await User.findOne({ email });
  if (
    !user ||
    user.resetPasswordCode !== code ||
    !user.resetPasswordExpires ||
    user.resetPasswordExpires < Date.now()
  ) {
    const error = new Error("Invalid or expired code");
    error.status = 400;
    throw error;
  }
  if (newPassword.length < 6) {
    const error = new Error("Password must be at least 6 characters");
    error.status = 400;
    throw error;
  }
  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(newPassword, salt);
  user.resetPasswordCode = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  return { message: "Password reset successfully!" };
};

const changePassword = async ({ userId, oldPassword, newPassword }) => {
  if (!userId || !oldPassword || !newPassword) {
    const error = new Error("All fields are required");
    error.status = 400;
    throw error;
  }

  if (oldPassword === newPassword) {
    const error = new Error("New password must be different from old password");
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!isMatch) {
    const error = new Error("Old password is incorrect");
    error.status = 400;
    throw error;
  }

  if (newPassword.length < 6) {
    const error = new Error("New password must be at least 6 characters");
    error.status = 400;
    throw error;
  }

  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(newPassword, salt);
  await user.save();

  return { message: "Password changed successfully!" };
};

const editProfile = async ({ userId, fullName, phone }) => {
  if (!userId || !fullName || !phone) {
    const error = new Error("All fields are required");
    error.status = 400;
    throw error;
  }
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  user.fullName = fullName;
  user.phone = phone;
  await user.save();
  return {
    message: "Profile updated successfully!",
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
    },
  };
};

module.exports = {
  login,
  refreshToken,
  registerRequest,
  verifyEmail,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  changePassword,
  editProfile,
};
