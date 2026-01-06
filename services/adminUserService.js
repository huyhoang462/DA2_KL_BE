const mongoose = require("mongoose");
const User = require("../models/user");
const Order = require("../models/order");
const OrderItem = require("../models/orderItem");
const Event = require("../models/event");
const Ticket = require("../models/ticket");
const TicketType = require("../models/ticketType");
const Show = require("../models/show");
const Transaction = require("../models/transaction");
const {
  sendUserBannedEmail,
  sendUserUnbannedEmail,
} = require("../utils/mailer");

/**
 * Lấy danh sách tất cả người dùng với filters và pagination
 */
const getAllUsers = async (filters = {}, page = 1, limit = 20) => {
  try {
    const {
      search, // Tìm theo tên hoặc email
      role, // Lọc theo role
      status, // Lọc theo status
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    // Build match query
    const matchQuery = {};

    // Search by name or email
    if (search && search.trim()) {
      matchQuery.$or = [
        { fullName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by role
    if (role && ["user", "admin", "staff"].includes(role)) {
      matchQuery.role = role;
    }

    // Filter by status
    if (status && ["active", "banned", "suspended"].includes(status)) {
      matchQuery.status = status;
    }

    // Aggregation pipeline
    const aggregationPipeline = [
      { $match: matchQuery },

      // Lookup orders để tính tổng đơn hàng
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "buyer",
          as: "orders",
        },
      },

      // Lookup events để tính số event đã tạo
      {
        $lookup: {
          from: "events",
          localField: "_id",
          foreignField: "creator",
          as: "events",
        },
      },

      // Add computed fields
      {
        $addFields: {
          totalOrders: { $size: "$orders" },
          totalEvents: { $size: "$events" },
          totalSpent: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$orders",
                    cond: { $eq: ["$$this.status", "paid"] },
                  },
                },
                in: "$$this.totalAmount",
              },
            },
          },
        },
      },

      // Sort
      {
        $sort: {
          [sortBy]: sortOrder === "asc" ? 1 : -1,
        },
      },

      // Facet for pagination
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $skip: (parseInt(page, 10) - 1) * parseInt(limit, 10) },
            { $limit: parseInt(limit, 10) },
            {
              $lookup: {
                from: "users",
                localField: "bannedBy",
                foreignField: "_id",
                as: "bannedByUser",
              },
            },
            {
              $project: {
                _id: 1,
                email: 1,
                fullName: 1,
                phone: 1,
                role: 1,
                status: 1,
                walletAddress: 1,
                banReason: 1,
                bannedAt: 1,
                bannedBy: {
                  $cond: {
                    if: { $gt: [{ $size: "$bannedByUser" }, 0] },
                    then: {
                      id: {
                        $toString: { $arrayElemAt: ["$bannedByUser._id", 0] },
                      },
                      name: { $arrayElemAt: ["$bannedByUser.fullName", 0] },
                    },
                    else: null,
                  },
                },
                totalOrders: 1,
                totalEvents: 1,
                totalSpent: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
        },
      },
    ];

    const results = await User.aggregate(aggregationPipeline);

    const users = results[0].data;
    const totalUsers = results[0].metadata[0]?.total || 0;
    const totalPages = Math.ceil(totalUsers / parseInt(limit, 10));

    return {
      success: true,
      data: {
        users: users.map((user) => ({
          id: user._id.toString(),
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          status: user.status,
          walletAddress: user.walletAddress,
          banReason: user.banReason,
          bannedAt: user.bannedAt,
          bannedBy: user.bannedBy,
          totalOrders: user.totalOrders,
          totalEvents: user.totalEvents,
          totalSpent: user.totalSpent,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        })),
        pagination: {
          currentPage: parseInt(page, 10),
          totalPages,
          totalUsers,
          limit: parseInt(limit, 10),
        },
      },
    };
  } catch (error) {
    console.error("[USER MANAGEMENT] Error getting all users:", error);
    throw error;
  }
};

/**
 * Lấy thông tin chi tiết một user
 */
const getUserById = async (userId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const error = new Error("Invalid user ID format");
      error.status = 400;
      throw error;
    }

    const aggregationPipeline = [
      {
        $match: { _id: new mongoose.Types.ObjectId(userId) },
      },

      // Lookup orders
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "buyer",
          as: "orders",
        },
      },

      // Lookup events created
      {
        $lookup: {
          from: "events",
          localField: "_id",
          foreignField: "creator",
          as: "eventsCreated",
        },
      },

      // Lookup tickets owned
      {
        $lookup: {
          from: "tickets",
          localField: "_id",
          foreignField: "owner",
          as: "tickets",
        },
      },

      // Lookup banned by user
      {
        $lookup: {
          from: "users",
          localField: "bannedBy",
          foreignField: "_id",
          as: "bannedByUser",
        },
      },

      // Add computed fields
      {
        $addFields: {
          totalOrders: { $size: "$orders" },
          totalEventsCreated: { $size: "$eventsCreated" },
          totalTickets: { $size: "$tickets" },
          totalSpent: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$orders",
                    cond: { $eq: ["$$this.status", "paid"] },
                  },
                },
                in: "$$this.totalAmount",
              },
            },
          },
        },
      },

      // Project
      {
        $project: {
          _id: 1,
          email: 1,
          fullName: 1,
          phone: 1,
          role: 1,
          status: 1,
          walletAddress: 1,
          banReason: 1,
          bannedAt: 1,
          bannedBy: {
            $cond: {
              if: { $gt: [{ $size: "$bannedByUser" }, 0] },
              then: {
                id: { $toString: { $arrayElemAt: ["$bannedByUser._id", 0] } },
                name: { $arrayElemAt: ["$bannedByUser.fullName", 0] },
                email: { $arrayElemAt: ["$bannedByUser.email", 0] },
              },
              else: null,
            },
          },
          totalOrders: 1,
          totalEventsCreated: 1,
          totalTickets: 1,
          totalSpent: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ];

    const results = await User.aggregate(aggregationPipeline);

    if (results.length === 0) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    const user = results[0];

    // Get recent orders (last 5)
    const recentOrders = await Order.find({ buyer: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("orderCode totalAmount status createdAt")
      .lean();

    // Get recent events (last 5)
    const recentEvents = await Event.find({ creator: userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name status startDate createdAt")
      .lean();

    return {
      success: true,
      data: {
        user: {
          id: user._id.toString(),
          email: user.email,
          fullName: user.fullName,
          phone: user.phone,
          role: user.role,
          status: user.status,
          walletAddress: user.walletAddress,
          banReason: user.banReason,
          bannedAt: user.bannedAt,
          bannedBy: user.bannedBy,
          totalOrders: user.totalOrders,
          totalEventsCreated: user.totalEventsCreated,
          totalTickets: user.totalTickets,
          totalSpent: user.totalSpent,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        recentOrders: recentOrders.map((order) => ({
          id: order._id.toString(),
          orderCode: order.orderCode,
          totalAmount: order.totalAmount,
          status: order.status,
          createdAt: order.createdAt,
        })),
        recentEvents: recentEvents.map((event) => ({
          id: event._id.toString(),
          name: event.name,
          status: event.status,
          startDate: event.startDate,
          createdAt: event.createdAt,
        })),
      },
    };
  } catch (error) {
    console.error("[USER MANAGEMENT] Error getting user by ID:", error);
    throw error;
  }
};

/**
 * Cập nhật role của user
 */
const updateUserRole = async (userId, newRole, adminId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const error = new Error("Invalid user ID format");
      error.status = 400;
      throw error;
    }

    if (!["user", "staff", "admin"].includes(newRole)) {
      const error = new Error("Invalid role. Must be: user, staff, or admin");
      error.status = 400;
      throw error;
    }

    const user = await User.findById(userId);

    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    // Không cho phép tự thay đổi role của chính mình
    if (user._id.toString() === adminId.toString()) {
      const error = new Error("Cannot change your own role");
      error.status = 403;
      throw error;
    }

    const oldRole = user.role;
    user.role = newRole;
    await user.save();

    return {
      success: true,
      message: `User role updated from ${oldRole} to ${newRole} successfully`,
      data: {
        userId: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        oldRole,
        newRole,
      },
    };
  } catch (error) {
    console.error("[USER MANAGEMENT] Error updating user role:", error);
    throw error;
  }
};

/**
 * Ban user
 */
const banUser = async (userId, reason, adminId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const error = new Error("Invalid user ID format");
      error.status = 400;
      throw error;
    }

    if (!reason || reason.trim() === "") {
      const error = new Error("Ban reason is required");
      error.status = 400;
      throw error;
    }

    const user = await User.findById(userId);

    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    // Không cho phép ban admin
    if (user.role === "admin") {
      const error = new Error("Cannot ban admin users");
      error.status = 403;
      throw error;
    }

    // Không cho phép tự ban mình
    if (user._id.toString() === adminId.toString()) {
      const error = new Error("Cannot ban yourself");
      error.status = 403;
      throw error;
    }

    // Kiểm tra đã bị ban chưa
    if (user.status === "banned") {
      const error = new Error("User is already banned");
      error.status = 400;
      throw error;
    }

    // Update user
    user.status = "banned";
    user.banReason = reason;
    user.bannedAt = new Date();
    user.bannedBy = adminId;
    await user.save();

    // Gửi email thông báo
    try {
      await sendUserBannedEmail(user.email, user.fullName, reason);
    } catch (emailError) {
      console.error("[USER MANAGEMENT] Error sending ban email:", emailError);
      // Không throw error để không làm fail toàn bộ request
    }

    return {
      success: true,
      message: "User has been banned successfully",
      data: {
        userId: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        status: user.status,
        banReason: user.banReason,
        bannedAt: user.bannedAt,
      },
    };
  } catch (error) {
    console.error("[USER MANAGEMENT] Error banning user:", error);
    throw error;
  }
};

/**
 * Unban user
 */
const unbanUser = async (userId, adminId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const error = new Error("Invalid user ID format");
      error.status = 400;
      throw error;
    }

    const user = await User.findById(userId);

    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    // Kiểm tra có đang bị ban không
    if (user.status !== "banned") {
      const error = new Error("User is not currently banned");
      error.status = 400;
      throw error;
    }

    // Update user
    const previousBanReason = user.banReason;
    user.status = "active";
    user.banReason = null;
    user.bannedAt = null;
    user.bannedBy = null;
    await user.save();

    // Gửi email thông báo
    try {
      await sendUserUnbannedEmail(user.email, user.fullName);
    } catch (emailError) {
      console.error("[USER MANAGEMENT] Error sending unban email:", emailError);
    }

    return {
      success: true,
      message: "User has been unbanned successfully",
      data: {
        userId: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        status: user.status,
        previousBanReason,
      },
    };
  } catch (error) {
    console.error("[USER MANAGEMENT] Error unbanning user:", error);
    throw error;
  }
};

/**
 * Xóa user (soft delete - chuyển status thành deleted)
 * Hoặc hard delete nếu cần
 */
const deleteUser = async (userId, adminId, hardDelete = false) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const error = new Error("Invalid user ID format");
      error.status = 400;
      throw error;
    }

    const user = await User.findById(userId);

    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    // Không cho phép xóa admin
    if (user.role === "admin") {
      const error = new Error("Cannot delete admin users");
      error.status = 403;
      throw error;
    }

    // Không cho phép tự xóa mình
    if (user._id.toString() === adminId.toString()) {
      const error = new Error("Cannot delete yourself");
      error.status = 403;
      throw error;
    }

    if (hardDelete) {
      // Hard delete - xóa hoàn toàn khỏi database
      // CHÚ Ý: Điều này có thể gây lỗi với foreign keys
      await User.findByIdAndDelete(userId);
      return {
        success: true,
        message: "User has been permanently deleted",
      };
    } else {
      // Soft delete - chỉ cập nhật status (recommend)
      user.status = "suspended";
      await user.save();
      return {
        success: true,
        message: "User has been suspended",
        data: {
          userId: user._id.toString(),
          fullName: user.fullName,
          email: user.email,
          status: user.status,
        },
      };
    }
  } catch (error) {
    console.error("[USER MANAGEMENT] Error deleting user:", error);
    throw error;
  }
};

/**
 * Lấy danh sách đơn hàng của user với phân trang và thống kê chi tiết
 */
const getUserOrders = async (userId, page = 1, limit = 10, filters = {}) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const error = new Error("Invalid user ID format");
      error.status = 400;
      throw error;
    }

    const user = await User.findById(userId);
    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    // Build match query
    const matchQuery = { buyer: new mongoose.Types.ObjectId(userId) };

    // Filter by status
    if (
      filters.status &&
      ["pending", "paid", "cancelled", "refunded"].includes(filters.status)
    ) {
      matchQuery.status = filters.status;
    }

    // Date range filter
    if (filters.startDate || filters.endDate) {
      matchQuery.createdAt = {};
      if (filters.startDate) {
        matchQuery.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        matchQuery.createdAt.$lte = new Date(filters.endDate);
      }
    }

    // Aggregation pipeline for statistics
    const statsAggregation = await Order.aggregate([
      { $match: { buyer: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
        },
      },
    ]);

    // Calculate spending by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const spendingByMonth = await Order.aggregate([
      {
        $match: {
          buyer: new mongoose.Types.ObjectId(userId),
          status: "paid",
          createdAt: { $gte: sixMonthsAgo },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          totalSpent: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 },
      },
    ]);

    // Get orders with pagination
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const orders = await Order.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    // Get order items to find event info for each order
    const orderIds = orders.map((o) => o._id);
    const orderItems = await OrderItem.find({ order: { $in: orderIds } })
      .populate({
        path: "ticketType",
        populate: {
          path: "show",
          populate: {
            path: "event",
            select: "name startDate endDate location",
          },
        },
      })
      .lean();

    // Map orderItems to orders (get first item's event for each order)
    const orderEventMap = {};
    orderItems.forEach((item) => {
      const orderId = item.order.toString();
      if (!orderEventMap[orderId] && item.ticketType?.show?.event) {
        orderEventMap[orderId] = item.ticketType.show.event;
      }
    });

    // Get transaction info for each order
    const transactions = await Transaction.find({ order: { $in: orderIds } })
      .select(
        "order amount paymentMethod transactionCode status refundAmount refundReason refundedAt createdAt"
      )
      .lean();

    // Map transactions to orders
    const orderTransactionMap = {};
    transactions.forEach((txn) => {
      orderTransactionMap[txn.order.toString()] = txn;
    });

    const totalOrders = await Order.countDocuments(matchQuery);
    const totalPages = Math.ceil(totalOrders / parseInt(limit, 10));

    // Format statistics
    const statistics = {
      total: 0,
      pending: { count: 0, amount: 0 },
      paid: { count: 0, amount: 0 },
      cancelled: { count: 0, amount: 0 },
      refunded: { count: 0, amount: 0 },
    };

    statsAggregation.forEach((stat) => {
      const status = stat._id;
      statistics[status] = {
        count: stat.count,
        amount: stat.totalAmount,
      };
      statistics.total += stat.count;
    });

    return {
      success: true,
      data: {
        orders: orders.map((order) => {
          const orderId = order._id.toString();
          const event = orderEventMap[orderId];
          const transaction = orderTransactionMap[orderId];

          return {
            id: orderId,
            orderCode: order.orderCode,
            event: event
              ? {
                  id: event._id.toString(),
                  name: event.name,
                  startDate: event.startDate,
                  endDate: event.endDate,
                  location: event.location?.address,
                }
              : null,
            totalAmount: order.totalAmount,
            status: order.status,
            transaction: transaction
              ? {
                  id: transaction._id.toString(),
                  amount: transaction.amount,
                  paymentMethod: transaction.paymentMethod,
                  transactionCode: transaction.transactionCode,
                  status: transaction.status,
                  refundAmount: transaction.refundAmount,
                  refundReason: transaction.refundReason,
                  refundedAt: transaction.refundedAt,
                  paidAt: transaction.createdAt,
                }
              : null,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          };
        }),
        statistics,
        spendingByMonth: spendingByMonth.map((item) => ({
          year: item._id.year,
          month: item._id.month,
          totalSpent: item.totalSpent,
          orderCount: item.orderCount,
        })),
        pagination: {
          currentPage: parseInt(page, 10),
          totalPages,
          totalOrders,
          limit: parseInt(limit, 10),
        },
      },
    };
  } catch (error) {
    console.error("[USER MANAGEMENT] Error getting user orders:", error);
    throw error;
  }
};

/**
 * Lấy danh sách sự kiện đã tạo bởi user với phân trang và thống kê
 */
const getUserEvents = async (userId, page = 1, limit = 10, filters = {}) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      const error = new Error("Invalid user ID format");
      error.status = 400;
      throw error;
    }

    const user = await User.findById(userId);
    if (!user) {
      const error = new Error("User not found");
      error.status = 404;
      throw error;
    }

    // Build match query
    const matchQuery = { creator: new mongoose.Types.ObjectId(userId) };

    // Filter by status
    if (
      filters.status &&
      ["draft", "published", "ongoing", "completed", "cancelled"].includes(
        filters.status
      )
    ) {
      matchQuery.status = filters.status;
    }

    // Date range filter
    if (filters.startDate || filters.endDate) {
      matchQuery.createdAt = {};
      if (filters.startDate) {
        matchQuery.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        matchQuery.createdAt.$lte = new Date(filters.endDate);
      }
    }

    // Statistics aggregation
    const statsAggregation = await Event.aggregate([
      { $match: { creator: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Get revenue from events
    const revenueAggregation = await OrderItem.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "order",
          foreignField: "_id",
          as: "orderData",
        },
      },
      {
        $unwind: "$orderData",
      },
      {
        $match: {
          "orderData.status": "paid",
        },
      },
      {
        $lookup: {
          from: "tickettypes",
          localField: "ticketType",
          foreignField: "_id",
          as: "ticketTypeData",
        },
      },
      {
        $unwind: "$ticketTypeData",
      },
      {
        $lookup: {
          from: "shows",
          localField: "ticketTypeData.show",
          foreignField: "_id",
          as: "showData",
        },
      },
      {
        $unwind: "$showData",
      },
      {
        $lookup: {
          from: "events",
          localField: "showData.event",
          foreignField: "_id",
          as: "eventData",
        },
      },
      {
        $unwind: "$eventData",
      },
      {
        $match: {
          "eventData.creator": new mongoose.Types.ObjectId(userId),
        },
      },
      {
        $group: {
          _id: "$showData.event",
          totalRevenue: {
            $sum: { $multiply: ["$quantity", "$priceAtPurchase"] },
          },
          orderCount: { $sum: 1 },
        },
      },
    ]);

    const totalRevenue = revenueAggregation.reduce(
      (sum, item) => sum + item.totalRevenue,
      0
    );
    const totalSoldTickets = revenueAggregation.reduce(
      (sum, item) => sum + item.orderCount,
      0
    );

    // Get events with pagination
    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const events = await Event.find(matchQuery)
      .populate("category", "name")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    // Get ticket sales for each event
    const eventIds = events.map((e) => e._id);
    const ticketSales = await OrderItem.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "order",
          foreignField: "_id",
          as: "orderData",
        },
      },
      {
        $unwind: "$orderData",
      },
      {
        $match: {
          "orderData.status": "paid",
        },
      },
      {
        $lookup: {
          from: "tickettypes",
          localField: "ticketType",
          foreignField: "_id",
          as: "ticketTypeData",
        },
      },
      {
        $unwind: "$ticketTypeData",
      },
      {
        $lookup: {
          from: "shows",
          localField: "ticketTypeData.show",
          foreignField: "_id",
          as: "showData",
        },
      },
      {
        $unwind: "$showData",
      },
      {
        $match: {
          "showData.event": { $in: eventIds },
        },
      },
      {
        $group: {
          _id: "$showData.event",
          revenue: { $sum: { $multiply: ["$quantity", "$priceAtPurchase"] } },
          ticketsSold: { $sum: "$quantity" },
        },
      },
    ]);

    const salesMap = {};
    ticketSales.forEach((sale) => {
      salesMap[sale._id.toString()] = {
        revenue: sale.revenue,
        ticketsSold: sale.ticketsSold,
      };
    });

    const totalEvents = await Event.countDocuments(matchQuery);
    const totalPages = Math.ceil(totalEvents / parseInt(limit, 10));

    // Format statistics
    const statistics = {
      total: 0,
      draft: 0,
      published: 0,
      ongoing: 0,
      completed: 0,
      cancelled: 0,
      totalRevenue,
      totalSoldTickets,
    };

    statsAggregation.forEach((stat) => {
      statistics[stat._id] = stat.count;
      statistics.total += stat.count;
    });

    return {
      success: true,
      data: {
        events: events.map((event) => {
          const eventId = event._id.toString();
          const sales = salesMap[eventId] || { revenue: 0, ticketsSold: 0 };

          return {
            id: eventId,
            name: event.name,
            slug: event.slug,
            category: event.category
              ? {
                  id: event.category._id.toString(),
                  name: event.category.name,
                }
              : null,
            status: event.status,
            startDate: event.startDate,
            endDate: event.endDate,
            location: event.location?.address,
            bannerImage: event.bannerImage,
            revenue: sales.revenue,
            ticketsSold: sales.ticketsSold,
            createdAt: event.createdAt,
            updatedAt: event.updatedAt,
          };
        }),
        statistics,
        pagination: {
          currentPage: parseInt(page, 10),
          totalPages,
          totalEvents,
          limit: parseInt(limit, 10),
        },
      },
    };
  } catch (error) {
    console.error("[USER MANAGEMENT] Error getting user events:", error);
    throw error;
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  updateUserRole,
  banUser,
  unbanUser,
  deleteUser,
  getUserOrders,
  getUserEvents,
};
