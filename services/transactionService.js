const Transaction = require("../models/transaction");
const mongoose = require("mongoose");

/**
 * Tạo transaction record
 * @param {Object} data - Transaction data
 * @param {mongoose.ClientSession} session - MongoDB session
 * @returns {Promise<Object>} Created transaction
 */
const createTransaction = async (data, session = null) => {
  const { orderId, amount, paymentMethod, transactionCode, status } = data;

  if (!orderId || !amount || !paymentMethod || !status) {
    throw new Error("Missing required transaction fields");
  }

  const transactionData = {
    order: orderId,
    amount,
    paymentMethod,
    transactionCode: transactionCode || null,
    status,
  };

  const options = session ? { session } : {};

  const transaction = await Transaction.create([transactionData], options);

  console.log(`💰 Transaction record created: ${transaction[0]._id}`);

  return transaction[0];
};

/**
 * Lấy transactions theo order
 */
const getTransactionsByOrder = async (orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    throw new Error("Invalid order ID");
  }

  const transactions = await Transaction.find({ order: orderId })
    .sort({ createdAt: -1 })
    .lean();

  return transactions;
};

/**
 * Lấy transactions theo user (qua order)
 */
const getTransactionsByUser = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const transactions = await Transaction.find()
    .populate({
      path: "order",
      match: { buyer: userId },
    })
    .sort({ createdAt: -1 })
    .lean();

  // Filter out null orders
  return transactions.filter((t) => t.order !== null);
};

/**
 * Kiểm tra order đã có transaction thành công chưa
 */
const hasSuccessfulTransaction = async (orderId) => {
  const transaction = await Transaction.findOne({
    order: orderId,
    status: "success",
  });

  return !!transaction;
};

module.exports = {
  createTransaction,
  getTransactionsByOrder,
  getTransactionsByUser,
  hasSuccessfulTransaction,
};
