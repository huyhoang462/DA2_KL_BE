const bcrypt = require("bcryptjs");
const User = require("../models/user");
const mongoose = require("mongoose");

const createStaffAccount = async (staffData, creator) => {
  const { email, password, fullName, phone } = staffData;

  if (!email || !password || !fullName) {
    const error = new Error("Email, password, and fullName are required.");
    error.status = 400;
    throw error;
  }
  if (password.length < 6) {
    const error = new Error("Password must be at least 6 characters long.");
    error.status = 400;
    throw error;
  }
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error("Email is already in use.");
    error.status = 409;
    throw error;
  }

  const saltRounds = 10;
  const passwordHash = await bcrypt.hash(password, saltRounds);

  const newStaff = new User({
    email,
    passwordHash,
    fullName,
    phone,
    role: "staff",
    createdBy: creator._id,
  });

  const savedStaff = await newStaff.save();
  return savedStaff.toJSON();
};

const getStaffByCreator = async (creator) => {
  const staffAccounts = await User.find({
    role: "staff",
    createdBy: creator._id,
  });
  return staffAccounts.map((staff) => staff.toJSON());
};

const updateStaffAccount = async (staffId, updateData, creator) => {
  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    const error = new Error("Invalid Staff ID format");
    error.status = 400;
    throw error;
  }

  const staffToUpdate = await User.findById(staffId);

  if (!staffToUpdate || staffToUpdate.role !== "staff") {
    const error = new Error("Staff account not found.");
    error.status = 404;
    throw error;
  }

  if (staffToUpdate.createdBy.toString() !== creator._id.toString()) {
    const error = new Error(
      "Forbidden: You do not have permission to update this account."
    );
    error.status = 403;
    throw error;
  }

  if (updateData.fullName) {
    staffToUpdate.fullName = updateData.fullName;
  }
  if (updateData.phone) {
    staffToUpdate.phone = updateData.phone;
  }

  if (updateData.password) {
    if (updateData.password.length < 6) {
      const error = new Error(
        "New password must be at least 6 characters long."
      );
      error.status = 400;
      throw error;
    }
    const saltRounds = 10;
    staffToUpdate.passwordHash = await bcrypt.hash(
      updateData.password,
      saltRounds
    );
  }

  const updatedStaff = await staffToUpdate.save();
  return updatedStaff.toJSON();
};

const deleteStaffAccount = async (staffId, creator) => {
  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    const error = new Error("Invalid Staff ID format");
    error.status = 400;
    throw error;
  }

  const staffToDelete = await User.findById(staffId);

  if (!staffToDelete || staffToDelete.role !== "staff") {
    const error = new Error("Staff account not found.");
    error.status = 404;
    throw error;
  }

  if (staffToDelete.createdBy.toString() !== creator._id.toString()) {
    const error = new Error(
      "Forbidden: You do not have permission to delete this account."
    );
    error.status = 403;
    throw error;
  }

  await User.findByIdAndDelete(staffId);
  return true;
};

module.exports = {
  createStaffAccount,
  getStaffByCreator,
  updateStaffAccount,
  deleteStaffAccount,
};
