const mongoose = require("mongoose");
const Transaction = require("../models/transaction");
const Order = require("../models/order");
const OrderItem = require("../models/orderItem");
const Ticket = require("../models/ticket");
const User = require("../models/user");

/**
 * Lấy danh sách tất cả giao dịch với filters và pagination
 * @param {Object} filters - { status, paymentMethod, searchTerm, startDate, endDate }
 * @param {Object} pagination - { page, limit, sortBy, sortOrder }
 */
const getAllTransactions = async (filters = {}, pagination = {}) => {
  try {
    const {
      status,
      paymentMethod,
      searchTerm,
      startDate,
      endDate,
      userId,
      eventId,
    } = filters;

    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = pagination;

    const skip = (page - 1) * limit;
    const sortOptions = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Build match query
    const matchQuery = {};

    if (status) {
      matchQuery.status = status;
    }

    if (paymentMethod) {
      matchQuery.paymentMethod = paymentMethod;
    }

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        matchQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = end;
      }
    }

    // Aggregation pipeline
    const pipeline = [
      { $match: matchQuery },
      {
        $lookup: {
          from: "orders",
          localField: "order",
          foreignField: "_id",
          as: "order",
        },
      },
      { $unwind: "$order" },
      {
        $lookup: {
          from: "users",
          localField: "order.buyer",
          foreignField: "_id",
          as: "buyer",
        },
      },
      { $unwind: { path: "$buyer", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "orderitems",
          localField: "order._id",
          foreignField: "order",
          as: "orderItems",
        },
      },
    ];

    // Filter by userId if provided
    if (userId) {
      pipeline.push({
        $match: { "order.buyer": new mongoose.Types.ObjectId(userId) },
      });
    }

    // Search by transaction code, order code, or user email
    if (searchTerm) {
      pipeline.push({
        $match: {
          $or: [
            { transactionCode: { $regex: searchTerm, $options: "i" } },
            { "order.orderCode": { $regex: searchTerm, $options: "i" } },
            { "buyer.email": { $regex: searchTerm, $options: "i" } },
            { "buyer.fullName": { $regex: searchTerm, $options: "i" } },
          ],
        },
      });
    }

    // Filter by event (through orderItems -> ticketType -> show -> event)
    if (eventId) {
      pipeline.push(
        {
          $lookup: {
            from: "tickettypes",
            localField: "orderItems.ticketType",
            foreignField: "_id",
            as: "ticketTypes",
          },
        },
        {
          $lookup: {
            from: "shows",
            localField: "ticketTypes.show",
            foreignField: "_id",
            as: "shows",
          },
        },
        {
          $match: {
            "shows.event": new mongoose.Types.ObjectId(eventId),
          },
        }
      );
    }

    // Project final shape
    pipeline.push({
      $project: {
        _id: 1,
        amount: 1,
        paymentMethod: 1,
        transactionCode: 1,
        status: 1,
        refundAmount: 1,
        refundReason: 1,
        refundedAt: 1,
        refundedBy: 1,
        createdAt: 1,
        updatedAt: 1,
        order: {
          _id: "$order._id",
          orderCode: "$order.orderCode",
          totalAmount: "$order.totalAmount",
          status: "$order.status",
          createdAt: "$order.createdAt",
        },
        buyer: {
          _id: "$buyer._id",
          fullName: "$buyer.fullName",
          email: "$buyer.email",
          phone: "$buyer.phone",
        },
        orderItemsCount: { $size: "$orderItems" },
      },
    });

    // Get total count before pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResult = await Transaction.aggregate(countPipeline);
    const total = countResult[0]?.total || 0;

    // Apply sort and pagination
    pipeline.push({ $sort: sortOptions }, { $skip: skip }, { $limit: limit });

    const transactions = await Transaction.aggregate(pipeline);

    return {
      success: true,
      message: "Transactions retrieved successfully",
      data: {
        transactions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit,
        },
      },
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Lấy chi tiết một giao dịch theo ID
 * @param {String} transactionId - Transaction ID
 */
const getTransactionById = async (transactionId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      const error = new Error("Invalid transaction ID");
      error.status = 400;
      throw error;
    }

    const transaction = await Transaction.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(transactionId) },
      },
      {
        $lookup: {
          from: "orders",
          localField: "order",
          foreignField: "_id",
          as: "order",
        },
      },
      { $unwind: "$order" },
      {
        $lookup: {
          from: "users",
          localField: "order.buyer",
          foreignField: "_id",
          as: "buyer",
        },
      },
      { $unwind: { path: "$buyer", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "orderitems",
          localField: "order._id",
          foreignField: "order",
          as: "orderItems",
        },
      },
      {
        $lookup: {
          from: "tickettypes",
          localField: "orderItems.ticketType",
          foreignField: "_id",
          as: "ticketTypes",
        },
      },
      {
        $lookup: {
          from: "shows",
          localField: "ticketTypes.show",
          foreignField: "_id",
          as: "shows",
        },
      },
      {
        $lookup: {
          from: "events",
          localField: "shows.event",
          foreignField: "_id",
          as: "events",
        },
      },
      {
        $lookup: {
          from: "tickets",
          localField: "order._id",
          foreignField: "order",
          as: "tickets",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "refundedBy",
          foreignField: "_id",
          as: "refundedByUser",
        },
      },
      {
        $unwind: {
          path: "$refundedByUser",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          amount: 1,
          paymentMethod: 1,
          transactionCode: 1,
          status: 1,
          refundAmount: 1,
          refundReason: 1,
          refundedAt: 1,
          createdAt: 1,
          updatedAt: 1,
          order: {
            _id: "$order._id",
            orderCode: "$order.orderCode",
            totalAmount: "$order.totalAmount",
            status: "$order.status",
            walletAddress: "$order.walletAddress",
            txHash: "$order.txHash",
            expiresAt: "$order.expiresAt",
            createdAt: "$order.createdAt",
          },
          buyer: {
            _id: "$buyer._id",
            fullName: "$buyer.fullName",
            email: "$buyer.email",
            phone: "$buyer.phone",
            walletAddress: "$buyer.walletAddress",
          },
          orderItems: {
            $map: {
              input: "$orderItems",
              as: "item",
              in: {
                _id: "$$item._id",
                quantity: "$$item.quantity",
                priceAtPurchase: "$$item.priceAtPurchase",
                subtotal: {
                  $multiply: ["$$item.quantity", "$$item.priceAtPurchase"],
                },
                ticketType: {
                  $arrayElemAt: [
                    {
                      $filter: {
                        input: "$ticketTypes",
                        as: "tt",
                        cond: { $eq: ["$$tt._id", "$$item.ticketType"] },
                      },
                    },
                    0,
                  ],
                },
              },
            },
          },
          events: 1,
          tickets: 1,
          refundedBy: {
            _id: "$refundedByUser._id",
            fullName: "$refundedByUser.fullName",
            email: "$refundedByUser.email",
          },
        },
      },
    ]);

    if (!transaction || transaction.length === 0) {
      const error = new Error("Transaction not found");
      error.status = 404;
      throw error;
    }

    return {
      success: true,
      message: "Transaction details retrieved successfully",
      data: transaction[0],
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Hoàn tiền cho một giao dịch
 * @param {String} transactionId - Transaction ID
 * @param {String} reason - Refund reason
 * @param {String} adminId - Admin user ID who processed refund
 */
const refundTransaction = async (transactionId, reason, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(transactionId)) {
      const error = new Error("Invalid transaction ID");
      error.status = 400;
      throw error;
    }

    // Find transaction
    const transaction = await Transaction.findById(transactionId)
      .populate("order")
      .session(session);

    if (!transaction) {
      const error = new Error("Transaction not found");
      error.status = 404;
      throw error;
    }

    // Check if transaction can be refunded
    if (transaction.status !== "success") {
      const error = new Error("Only successful transactions can be refunded");
      error.status = 400;
      throw error;
    }

    if (transaction.status === "refunded") {
      const error = new Error("Transaction already refunded");
      error.status = 400;
      throw error;
    }

    // Update transaction status to refunded
    transaction.status = "refunded";
    transaction.refundAmount = transaction.amount;
    transaction.refundReason = reason;
    transaction.refundedAt = new Date();
    transaction.refundedBy = adminId;
    await transaction.save({ session });

    // Update order status to cancelled
    const order = await Order.findById(transaction.order._id).session(session);
    if (order) {
      order.status = "cancelled";
      await order.save({ session });
    }

    // Cancel all tickets associated with this order
    await Ticket.updateMany(
      { order: transaction.order._id },
      { status: "cancelled" },
      { session }
    );

    await session.commitTransaction();

    return {
      success: true,
      message: "Transaction refunded successfully",
      data: {
        transactionId: transaction._id,
        status: transaction.status,
        refundAmount: transaction.refundAmount,
        refundedAt: transaction.refundedAt,
      },
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Lấy thống kê về giao dịch
 * @param {Object} filters - { startDate, endDate }
 */
const getTransactionStatistics = async (filters = {}) => {
  try {
    const { startDate, endDate } = filters;

    const matchQuery = {};

    if (startDate || endDate) {
      matchQuery.createdAt = {};
      if (startDate) {
        matchQuery.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        matchQuery.createdAt.$lte = end;
      }
    }

    // Tổng số giao dịch theo status
    const transactionsByStatus = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    // Tổng tiền theo phương thức thanh toán
    const transactionsByPaymentMethod = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$paymentMethod",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]);

    // Tổng giao dịch
    const totalStats = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalRefunded: {
            $sum: {
              $cond: [{ $eq: ["$status", "refunded"] }, "$refundAmount", 0],
            },
          },
        },
      },
    ]);

    // Tính tỷ lệ thành công/thất bại
    const statusMap = transactionsByStatus.reduce((acc, item) => {
      acc[item._id] = item;
      return acc;
    }, {});

    const successCount = statusMap.success?.count || 0;
    const failedCount = statusMap.failed?.count || 0;
    const pendingCount = statusMap.pending?.count || 0;
    const refundedCount = statusMap.refunded?.count || 0;
    const totalCount = totalStats[0]?.totalTransactions || 0;

    const successRate = totalCount > 0 ? (successCount / totalCount) * 100 : 0;
    const failureRate = totalCount > 0 ? (failedCount / totalCount) * 100 : 0;
    const refundRate = totalCount > 0 ? (refundedCount / totalCount) * 100 : 0;

    // Giao dịch theo ngày (7 ngày gần nhất)
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const transactionsByDay = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: last7Days },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
            status: "$status",
          },
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    return {
      success: true,
      message: "Transaction statistics retrieved successfully",
      data: {
        summary: {
          totalTransactions: totalStats[0]?.totalTransactions || 0,
          totalAmount: totalStats[0]?.totalAmount || 0,
          totalRefunded: totalStats[0]?.totalRefunded || 0,
          successCount,
          failedCount,
          pendingCount,
          refundedCount,
          successRate: parseFloat(successRate.toFixed(2)),
          failureRate: parseFloat(failureRate.toFixed(2)),
          refundRate: parseFloat(refundRate.toFixed(2)),
        },
        transactionsByStatus: transactionsByStatus.map((item) => ({
          status: item._id,
          count: item.count,
          totalAmount: item.totalAmount,
        })),
        transactionsByPaymentMethod: transactionsByPaymentMethod.map(
          (item) => ({
            paymentMethod: item._id,
            count: item.count,
            totalAmount: item.totalAmount,
          })
        ),
        transactionsByDay,
      },
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getAllTransactions,
  getTransactionById,
  refundTransaction,
  getTransactionStatistics,
};
