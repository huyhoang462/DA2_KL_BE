const User = require("../models/user");
const bcrypt = require("bcryptjs");
const Verification = require("../models/verification");
const jwt = require("jsonwebtoken");
const { sendVerificationEmail } = require("../utils/mailer");

const handleLogin = async (req, res) => {
  const { email, password } = req.body;
  console.log(email, password);

  try {
    const user = await User.findOne({ email });
    if (!user) {
      console.log("User  found");

      return res.status(401).json({ message: "Invalid email or password" });
    }
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password " });
    }

    const userForToken = {
      email: user.email,
      id: user._id,
      role: user.role,
    };

    const token = jwt.sign(userForToken, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({
      token,
      user: {
        email: user.email,
        name: user.name,
        role: user.role,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const handleRegisterRequest = async (req, res) => {
  const { email, password, name, role, phone } = req.body;
  if (!email || !password || !name || !role || !phone) {
    return res.status(400).json({ message: "All fields are required" });
  }

  if (password.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters long" });
  }
  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
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

    res.status(200).json({
      message: "Verification code sent to your email. Please check your inbox.",
    });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

const handleVerifyEmail = async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ message: "Email and OTP are required" });
  }

  try {
    const verificationRecord = await Verification.findOne({ email });

    if (!verificationRecord) {
      return res.status(404).json({
        message: "Verification record not found. Please try registering again.",
      });
    }

    if (verificationRecord.otp !== otp) {
      return res.status(400).json({ message: "Invalid verification code." });
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

    res
      .status(201)
      .json({ message: "User created and verified successfully!" });
  } catch (err) {
    console.error("Verify Email Error:", err);
    res.status(500).json({ message: "An unexpected error occurred" });
  }
};
module.exports = {
  login: handleLogin,
  register: handleRegisterRequest,
  verifyEmail: handleVerifyEmail,
};
