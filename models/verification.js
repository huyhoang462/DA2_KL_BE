// models/verification.js
const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema({
  email: { type: String, required: true },
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  role: { type: String, required: true },
  passwordHash: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: "10m" }, // Tự động xóa sau 10 phút
});

module.exports = mongoose.model("Verification", verificationSchema);
