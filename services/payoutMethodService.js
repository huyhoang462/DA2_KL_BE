const PayoutMethod = require("../models/payoutMethod");
const mongoose = require("mongoose");

const createPayoutMethod = async (user, data) => {
  const { methodType, bankDetails, momoDetails } = data;

  if (!methodType) {
    const error = new Error("Method type is required");
    error.status = 400;
    throw error;
  }

  const newPayoutMethod = new PayoutMethod({
    user: user._id,
    methodType,
    bankDetails: methodType === "bank_account" ? bankDetails : undefined,
    momoDetails: methodType === "momo" ? momoDetails : undefined,
  });

  const savedMethod = await newPayoutMethod.save();
  return savedMethod.toJSON();
};

const getMyPayoutMethods = async (user) => {
  const methods = await PayoutMethod.find({ user: user._id });
  return methods.map((method) => method.toJSON());
};

const deletePayoutMethod = async (methodId, user) => {
  if (!mongoose.Types.ObjectId.isValid(methodId)) {
    const error = new Error("Invalid PayoutMethod ID format");
    error.status = 400;
    throw error;
  }

  const method = await PayoutMethod.findById(methodId);

  if (!method) {
    const error = new Error("Payout method not found");
    error.status = 404;
    throw error;
  }

  if (method.user.toString() !== user._id.toString()) {
    const error = new Error(
      "Forbidden: You do not have permission to delete this method"
    );
    error.status = 403;
    throw error;
  }

  await PayoutMethod.findByIdAndDelete(methodId);
  return true;
};

module.exports = {
  createPayoutMethod,
  getMyPayoutMethods,
  deletePayoutMethod,
};
