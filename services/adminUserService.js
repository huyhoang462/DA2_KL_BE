const mongoose = require("mongoose");
const User = require("../models/user");
const Order = require("../models/order");
const Event = require("../models/event");
const Ticket = require("../models/ticket");
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

module.exports = {
  getAllUsers,
  getUserById,
  updateUserRole,
  banUser,
  unbanUser,
  deleteUser,
};
