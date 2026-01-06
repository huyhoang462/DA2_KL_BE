const mongoose = require("mongoose");
const User = require("../models/user");
const Event = require("../models/event");
const Order = require("../models/order");
const Transaction = require("../models/transaction");
const Ticket = require("../models/ticket");
const Category = require("../models/category");
const TicketType = require("../models/ticketType");
const Show = require("../models/show");

/**
 * Lấy tổng quan Dashboard cho Admin
 * Bao gồm: thống kê tổng quan, biểu đồ, hoạt động gần đây
 */
const getDashboardOverview = async () => {
  try {
    // Lấy ngày hiện tại và các mốc thời gian
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfThisWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfThisYear = new Date(now.getFullYear(), 0, 1);

    // 1. THỐNG KÊ TỔNG QUAN (Overview Cards)
    const [
      totalUsers,
      totalOrganizers,
      totalEvents,
      pendingEvents,
      upcomingEvents,
      ongoingEvents,
      completedEvents,
      rejectedEvents,
      totalRevenue,
      todayRevenue,
      weekRevenue,
      monthRevenue,
      totalTicketsSold,
      todayTicketsSold,
    ] = await Promise.all([
      // Người dùng
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: { $in: ["staff", "admin"] } }),

      // Sự kiện
      Event.countDocuments(),
      Event.countDocuments({ status: "pending" }),
      Event.countDocuments({ status: "upcoming" }),
      Event.countDocuments({ status: "ongoing" }),
      Event.countDocuments({ status: "completed" }),
      Event.countDocuments({ status: "rejected" }),

      // Doanh thu
      Transaction.aggregate([
        { $match: { status: "success" } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((res) => res[0]?.total || 0),

      Transaction.aggregate([
        { $match: { status: "success", createdAt: { $gte: startOfToday } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((res) => res[0]?.total || 0),

      Transaction.aggregate([
        { $match: { status: "success", createdAt: { $gte: startOfThisWeek } } },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((res) => res[0]?.total || 0),

      Transaction.aggregate([
        {
          $match: { status: "success", createdAt: { $gte: startOfThisMonth } },
        },
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]).then((res) => res[0]?.total || 0),

      // Vé đã bán
      Ticket.countDocuments({ status: { $ne: "cancelled" } }),
      Ticket.countDocuments({
        status: { $ne: "cancelled" },
        createdAt: { $gte: startOfToday },
      }),
    ]);

    // 2. BIỂU ĐỒ DOANH THU 7 NGÀY GẦN NHẤT (Revenue Chart)
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      last7Days.push(date);
    }

    const revenueChartData = await Promise.all(
      last7Days.map(async (date) => {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        const dayRevenue = await Transaction.aggregate([
          {
            $match: {
              status: "success",
              createdAt: { $gte: date, $lt: nextDay },
            },
          },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ]);

        const dayTickets = await Ticket.countDocuments({
          status: { $ne: "cancelled" },
          createdAt: { $gte: date, $lt: nextDay },
        });

        return {
          date: date.toISOString().split("T")[0],
          revenue: dayRevenue[0]?.total || 0,
          ticketsSold: dayTickets,
        };
      })
    );

    // 3. BIỂU ĐỒ PHÂN BỐ SỰ KIỆN THEO DANH MỤC (Category Distribution)
    const categoryDistribution = await Event.aggregate([
      {
        $match: {
          status: { $in: ["upcoming", "ongoing", "completed"] },
        },
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "categoryInfo",
        },
      },
      {
        $unwind: "$categoryInfo",
      },
      {
        $group: {
          _id: "$categoryInfo._id",
          name: { $first: "$categoryInfo.name" },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $project: {
          _id: 0,
          categoryId: { $toString: "$_id" },
          name: 1,
          count: 1,
        },
      },
    ]);

    // 4. NGƯỜI DÙNG MỚI ĐĂNG KÝ 7 NGÀY (User Registration Chart)
    const userRegistrationData = await Promise.all(
      last7Days.map(async (date) => {
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        const count = await User.countDocuments({
          createdAt: { $gte: date, $lt: nextDay },
        });

        return {
          date: date.toISOString().split("T")[0],
          count,
        };
      })
    );

    // 5. HOẠT ĐỘNG GẦN ĐÂY (Recent Activities)

    // 5.1. Sự kiện mới chờ duyệt (top 5)
    const recentPendingEvents = await Event.find({ status: "pending" })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("creator", "fullName email")
      .populate("category", "name")
      .select("name bannerImageUrl startDate creator category createdAt")
      .lean();

    // 5.2. Giao dịch mới nhất (top 5)
    const recentTransactions = await Transaction.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate({
        path: "order",
        populate: { path: "buyer", select: "fullName email" },
      })
      .select("amount paymentMethod status createdAt")
      .lean();

    // 5.3. Người dùng mới đăng ký (top 5)
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("fullName email role createdAt")
      .lean();

    // 6. CẢNH BÁO & THÔNG BÁO (Alerts)
    const alerts = [];

    // 6.1. Sự kiện chờ duyệt
    if (pendingEvents > 0) {
      alerts.push({
        type: "warning",
        priority: "high",
        message: `Bạn có ${pendingEvents} sự kiện đang chờ duyệt`,
        action: "Xem sự kiện chờ duyệt",
        link: "/admin/events/pending",
      });
    }

    // 6.2. Giao dịch thất bại trong 24h
    const failedTransactionsToday = await Transaction.countDocuments({
      status: "failed",
      createdAt: { $gte: startOfToday },
    });

    if (failedTransactionsToday > 0) {
      alerts.push({
        type: "error",
        priority: "medium",
        message: `${failedTransactionsToday} giao dịch thất bại trong hôm nay`,
        action: "Xem giao dịch",
        link: "/admin/transactions",
      });
    }

    // 6.3. Sự kiện sắp diễn ra trong 3 ngày
    const threeDaysLater = new Date();
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);

    const upcomingSoonEvents = await Event.countDocuments({
      status: "upcoming",
      startDate: { $lte: threeDaysLater, $gte: new Date() },
    });

    if (upcomingSoonEvents > 0) {
      alerts.push({
        type: "info",
        priority: "low",
        message: `${upcomingSoonEvents} event(s) starting within 3 days`,
        action: "View upcoming events",
        link: "/admin/events",
      });
    }

    // 7. TOP EVENTS (Sự kiện bán chạy)
    const topSellingEvents = await Event.aggregate([
      {
        $match: {
          status: { $in: ["upcoming", "ongoing"] },
        },
      },
      {
        $lookup: {
          from: "shows",
          localField: "_id",
          foreignField: "event",
          as: "shows",
        },
      },
      {
        $lookup: {
          from: "tickettypes",
          localField: "shows._id",
          foreignField: "show",
          as: "ticketTypes",
        },
      },
      {
        $addFields: {
          totalSold: { $sum: "$ticketTypes.quantitySold" },
          totalAvailable: { $sum: "$ticketTypes.quantityTotal" },
        },
      },
      {
        $match: {
          totalSold: { $gt: 0 },
        },
      },
      {
        $sort: { totalSold: -1 },
      },
      {
        $limit: 5,
      },
      {
        $lookup: {
          from: "categories",
          localField: "category",
          foreignField: "_id",
          as: "category",
        },
      },
      {
        $unwind: { path: "$category", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          bannerImageUrl: 1,
          startDate: 1,
          totalSold: 1,
          totalAvailable: 1,
          sellRate: {
            $multiply: [{ $divide: ["$totalSold", "$totalAvailable"] }, 100],
          },
          category: {
            id: { $toString: "$category._id" },
            name: "$category.name",
          },
        },
      },
    ]);

    // 8. THỐNG KÊ GIAO DỊCH
    const [successTransactions, pendingTransactions, failedTransactions] =
      await Promise.all([
        Transaction.countDocuments({ status: "success" }),
        Transaction.countDocuments({ status: "pending" }),
        Transaction.countDocuments({ status: "failed" }),
      ]);

    // 9. SO SÁNH VỚI THÁNG TRƯỚC
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(
      now.getFullYear(),
      now.getMonth(),
      0,
      23,
      59,
      59
    );

    const lastMonthRevenue = await Transaction.aggregate([
      {
        $match: {
          status: "success",
          createdAt: { $gte: lastMonthStart, $lte: lastMonthEnd },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]).then((res) => res[0]?.total || 0);

    const revenueGrowth =
      lastMonthRevenue > 0
        ? (
            ((monthRevenue - lastMonthRevenue) / lastMonthRevenue) *
            100
          ).toFixed(2)
        : 0;

    // FORMAT RESPONSE
    return {
      success: true,
      data: {
        // Thống kê tổng quan
        overview: {
          users: {
            total: totalUsers,
            organizers: totalOrganizers,
          },
          events: {
            total: totalEvents,
            pending: pendingEvents,
            upcoming: upcomingEvents,
            ongoing: ongoingEvents,
            completed: completedEvents,
            rejected: rejectedEvents,
          },
          revenue: {
            total: totalRevenue,
            today: todayRevenue,
            thisWeek: weekRevenue,
            thisMonth: monthRevenue,
            lastMonth: lastMonthRevenue,
            growth: parseFloat(revenueGrowth),
          },
          tickets: {
            total: totalTicketsSold,
            today: todayTicketsSold,
          },
          transactions: {
            success: successTransactions,
            pending: pendingTransactions,
            failed: failedTransactions,
          },
        },

        // Biểu đồ
        charts: {
          revenue: revenueChartData,
          userRegistration: userRegistrationData,
          categoryDistribution,
        },

        // Top events
        topSellingEvents: topSellingEvents.map((event) => ({
          id: event._id.toString(),
          name: event.name,
          bannerImageUrl: event.bannerImageUrl,
          startDate: event.startDate,
          totalSold: event.totalSold,
          totalAvailable: event.totalAvailable,
          sellRate: parseFloat(event.sellRate.toFixed(2)),
          category: event.category,
        })),

        // Hoạt động gần đây
        recentActivities: {
          pendingEvents: recentPendingEvents.map((event) => ({
            id: event._id.toString(),
            name: event.name,
            bannerImageUrl: event.bannerImageUrl,
            startDate: event.startDate,
            creator: event.creator
              ? {
                  id: event.creator._id.toString(),
                  name: event.creator.fullName,
                  email: event.creator.email,
                }
              : null,
            category: event.category
              ? {
                  id: event.category._id.toString(),
                  name: event.category.name,
                }
              : null,
            createdAt: event.createdAt,
          })),
          transactions: recentTransactions.map((tx) => ({
            id: tx._id.toString(),
            amount: tx.amount,
            paymentMethod: tx.paymentMethod,
            status: tx.status,
            buyer: tx.order?.buyer
              ? {
                  id: tx.order.buyer._id.toString(),
                  name: tx.order.buyer.fullName,
                  email: tx.order.buyer.email,
                }
              : null,
            createdAt: tx.createdAt,
          })),
          newUsers: recentUsers.map((user) => ({
            id: user._id.toString(),
            fullName: user.fullName,
            email: user.email,
            role: user.role,
            createdAt: user.createdAt,
          })),
        },

        // Cảnh báo
        alerts,
      },
    };
  } catch (error) {
    console.error("[DASHBOARD] Error getting overview:", error);
    throw error;
  }
};

/**
 * Lấy thống kê người dùng chi tiết
 */
const getUserStatistics = async () => {
  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

    // Thống kê theo role
    const usersByRole = await User.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          role: "$_id",
          count: 1,
        },
      },
    ]);

    // Người dùng mới 30 ngày
    const newUsersLast30Days = await User.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
    });

    // Top users mua nhiều vé nhất
    const topBuyers = await Order.aggregate([
      {
        $match: { status: "paid" },
      },
      {
        $group: {
          _id: "$buyer",
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
        },
      },
      {
        $sort: { totalSpent: -1 },
      },
      {
        $limit: 10,
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $unwind: "$userInfo",
      },
      {
        $project: {
          _id: 0,
          userId: { $toString: "$_id" },
          fullName: "$userInfo.fullName",
          email: "$userInfo.email",
          totalOrders: 1,
          totalSpent: 1,
        },
      },
    ]);

    return {
      success: true,
      data: {
        byRole: usersByRole,
        newUsersLast30Days,
        topBuyers,
      },
    };
  } catch (error) {
    console.error("[DASHBOARD] Error getting user statistics:", error);
    throw error;
  }
};

/**
 * Lấy thống kê sự kiện chi tiết
 */
const getEventStatistics = async () => {
  try {
    // Thống kê theo status
    const eventsByStatus = await Event.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          status: "$_id",
          count: 1,
        },
      },
    ]);

    // Thống kê theo format
    const eventsByFormat = await Event.aggregate([
      {
        $match: {
          status: { $in: ["upcoming", "ongoing", "completed"] },
        },
      },
      {
        $group: {
          _id: "$format",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          format: "$_id",
          count: 1,
        },
      },
    ]);

    // Top organizers (người tạo nhiều event nhất)
    const topOrganizers = await Event.aggregate([
      {
        $match: {
          status: { $in: ["upcoming", "ongoing", "completed"] },
        },
      },
      {
        $group: {
          _id: "$creator",
          eventCount: { $sum: 1 },
        },
      },
      {
        $sort: { eventCount: -1 },
      },
      {
        $limit: 10,
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "userInfo",
        },
      },
      {
        $unwind: "$userInfo",
      },
      {
        $project: {
          _id: 0,
          userId: { $toString: "$_id" },
          fullName: "$userInfo.fullName",
          email: "$userInfo.email",
          eventCount: 1,
        },
      },
    ]);

    return {
      success: true,
      data: {
        byStatus: eventsByStatus,
        byFormat: eventsByFormat,
        topOrganizers,
      },
    };
  } catch (error) {
    console.error("[DASHBOARD] Error getting event statistics:", error);
    throw error;
  }
};

module.exports = {
  getDashboardOverview,
  getUserStatistics,
  getEventStatistics,
};
