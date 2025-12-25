const mongoose = require("mongoose");
const Event = require("../models/event");
const User = require("../models/user");
const Order = require("../models/order");
const OrderItem = require("../models/orderItem");
const Ticket = require("../models/ticket");
const Transaction = require("../models/transaction");
const Category = require("../models/category");

/**
 * Báo cáo doanh thu theo thời gian với groupBy linh hoạt
 * @param {Date} startDate - Ngày bắt đầu
 * @param {Date} endDate - Ngày kết thúc
 * @param {String} groupBy - day, week, month, year
 */
const getRevenueReport = async (startDate, endDate, groupBy = "day") => {
  try {
    // Validate dates
    if (!startDate || !endDate) {
      const error = new Error("Start date and end date are required");
      error.status = 400;
      throw error;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // End of day

    if (start > end) {
      const error = new Error("Start date must be before end date");
      error.status = 400;
      throw error;
    }

    // Xác định format group theo yêu cầu
    let dateGroupFormat;
    let sortFormat;

    switch (groupBy) {
      case "day":
        dateGroupFormat = {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
          day: { $dayOfMonth: "$createdAt" },
        };
        sortFormat = { "_id.year": 1, "_id.month": 1, "_id.day": 1 };
        break;
      case "week":
        dateGroupFormat = {
          year: { $year: "$createdAt" },
          week: { $week: "$createdAt" },
        };
        sortFormat = { "_id.year": 1, "_id.week": 1 };
        break;
      case "month":
        dateGroupFormat = {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" },
        };
        sortFormat = { "_id.year": 1, "_id.month": 1 };
        break;
      case "year":
        dateGroupFormat = {
          year: { $year: "$createdAt" },
        };
        sortFormat = { "_id.year": 1 };
        break;
      default:
        const error = new Error(
          "Invalid groupBy. Must be: day, week, month, or year"
        );
        error.status = 400;
        throw error;
    }

    // Aggregation để tính revenue theo thời gian
    const revenueByTime = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: "success", // ✅ FIX: Đổi từ "completed" → "success"
        },
      },
      {
        $group: {
          _id: dateGroupFormat,
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          averageTransactionValue: { $avg: "$amount" },
        },
      },
      { $sort: sortFormat },
    ]);

    // Tổng doanh thu trong khoảng thời gian
    const totalStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: "success", // ✅ FIX: Đổi từ "completed" → "success"
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          averageTransactionValue: { $avg: "$amount" },
        },
      },
    ]);

    // Doanh thu theo phương thức thanh toán
    const revenueByPaymentMethod = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: "success", // ✅ FIX: Đổi từ "completed" → "success"
        },
      },
      {
        $group: {
          _id: "$paymentMethod",
          totalRevenue: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    // Doanh thu theo danh mục sự kiện
    // ✅ FIX: Order → OrderItem → TicketType → Show → Event → Category
    const revenueByCategory = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: "success",
        },
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
          from: "orderitems",
          localField: "order._id",
          foreignField: "order",
          as: "orderItems",
        },
      },
      { $unwind: "$orderItems" },
      {
        $lookup: {
          from: "tickettypes",
          localField: "orderItems.ticketType",
          foreignField: "_id",
          as: "ticketType",
        },
      },
      { $unwind: "$ticketType" },
      {
        $lookup: {
          from: "shows",
          localField: "ticketType.show",
          foreignField: "_id",
          as: "show",
        },
      },
      { $unwind: "$show" },
      {
        $lookup: {
          from: "events",
          localField: "show.event",
          foreignField: "_id",
          as: "event",
        },
      },
      { $unwind: "$event" },
      {
        $lookup: {
          from: "categories",
          localField: "event.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            categoryId: "$category._id",
            categoryName: "$category.name",
          },
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]);

    // Doanh thu theo organizer (Top 10)
    // ✅ FIX: Order → OrderItem → TicketType → Show → Event → Creator (organizer)
    const revenueByOrganizer = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: "success",
        },
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
          from: "orderitems",
          localField: "order._id",
          foreignField: "order",
          as: "orderItems",
        },
      },
      { $unwind: "$orderItems" },
      {
        $lookup: {
          from: "tickettypes",
          localField: "orderItems.ticketType",
          foreignField: "_id",
          as: "ticketType",
        },
      },
      { $unwind: "$ticketType" },
      {
        $lookup: {
          from: "shows",
          localField: "ticketType.show",
          foreignField: "_id",
          as: "show",
        },
      },
      { $unwind: "$show" },
      {
        $lookup: {
          from: "events",
          localField: "show.event",
          foreignField: "_id",
          as: "event",
        },
      },
      { $unwind: "$event" },
      {
        $lookup: {
          from: "users",
          localField: "event.creator",
          foreignField: "_id",
          as: "organizer",
        },
      },
      { $unwind: { path: "$organizer", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            organizerId: "$organizer._id",
            organizerName: "$organizer.fullName",
            organizerEmail: "$organizer.email",
          },
          totalRevenue: { $sum: "$amount" },
          totalTransactions: { $sum: 1 },
          totalEvents: { $addToSet: "$event._id" },
        },
      },
      {
        $project: {
          _id: 1,
          totalRevenue: 1,
          totalTransactions: 1,
          totalEvents: { $size: "$totalEvents" },
        },
      },
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 },
    ]);

    // Tính growth rate (so với period trước đó)
    const periodLength = end - start;
    const previousStart = new Date(start.getTime() - periodLength);
    const previousEnd = new Date(start.getTime() - 1);

    const previousPeriodStats = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: previousStart, $lte: previousEnd },
          status: "success", // ✅ FIX: Đổi từ "completed" → "success"
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
        },
      },
    ]);

    const currentRevenue = totalStats[0]?.totalRevenue || 0;
    const previousRevenue = previousPeriodStats[0]?.totalRevenue || 0;
    const growthRate =
      previousRevenue > 0
        ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
        : 0;

    return {
      success: true,
      message: "Revenue report generated successfully",
      data: {
        period: {
          startDate: start,
          endDate: end,
          groupBy,
        },
        summary: {
          totalRevenue: totalStats[0]?.totalRevenue || 0,
          totalTransactions: totalStats[0]?.totalTransactions || 0,
          averageTransactionValue: totalStats[0]?.averageTransactionValue || 0,
          growthRate: parseFloat(growthRate.toFixed(2)),
          growthAmount: currentRevenue - previousRevenue,
        },
        revenueByTime,
        revenueByCategory: revenueByCategory.map((item) => ({
          categoryId: item._id.categoryId,
          categoryName: item._id.categoryName || "Uncategorized",
          totalRevenue: item.totalRevenue,
          totalTransactions: item.totalTransactions,
        })),
        revenueByOrganizer: revenueByOrganizer.map((item) => ({
          organizerId: item._id.organizerId,
          organizerName: item._id.organizerName || "Unknown",
          organizerEmail: item._id.organizerEmail,
          totalRevenue: item.totalRevenue,
          totalTransactions: item.totalTransactions,
          totalEvents: item.totalEvents,
        })),
        revenueByPaymentMethod: revenueByPaymentMethod.map((item) => ({
          paymentMethod: item._id || "unknown",
          totalRevenue: item.totalRevenue,
          count: item.count,
        })),
      },
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Báo cáo về vé (Ticket Report)
 */
const getTicketReport = async (filters = {}) => {
  try {
    const { startDate, endDate, category, eventId, status } = filters;

    // Build match query
    const matchQuery = {};

    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      matchQuery.createdAt = { $gte: start, $lte: end };
    }

    if (status) {
      matchQuery.status = status;
    }

    // Tổng số vé đã tạo
    const totalTickets = await Ticket.countDocuments(matchQuery);

    // Vé theo status
    const ticketsByStatus = await Ticket.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Vé đã bán (pending + checkedIn + out)
    // pending = đã mua nhưng chưa check-in, checkedIn/out = đã sử dụng
    const soldTickets = await Ticket.countDocuments({
      ...matchQuery,
      status: { $in: ["pending", "checkedIn", "out"] },
    });

    // Vé đã hủy
    const cancelledTickets = await Ticket.countDocuments({
      ...matchQuery,
      status: "cancelled",
    });

    // Tỷ lệ hủy vé
    const cancellationRate =
      totalTickets > 0 ? (cancelledTickets / totalTickets) * 100 : 0;

    // Vé theo loại event (category)
    // ✅ FIX: Ticket → TicketType → Show → Event → Category
    const ticketsByCategory = await Ticket.aggregate([
      { $match: matchQuery },
      {
        $lookup: {
          from: "tickettypes",
          localField: "ticketType",
          foreignField: "_id",
          as: "ticketType",
        },
      },
      { $unwind: "$ticketType" },
      {
        $lookup: {
          from: "shows",
          localField: "ticketType.show",
          foreignField: "_id",
          as: "show",
        },
      },
      { $unwind: "$show" },
      {
        $lookup: {
          from: "events",
          localField: "show.event",
          foreignField: "_id",
          as: "event",
        },
      },
      { $unwind: "$event" },
      {
        $lookup: {
          from: "categories",
          localField: "event.category",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            categoryId: "$category._id",
            categoryName: "$category.name",
          },
          totalTickets: { $sum: 1 },
          pendingTickets: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          checkedInTickets: {
            $sum: {
              $cond: [{ $in: ["$status", ["checkedIn", "out"]] }, 1, 0],
            },
          },
          cancelledTickets: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
        },
      },
      { $sort: { totalTickets: -1 } },
    ]);

    // Top events theo số vé bán ra
    // ✅ FIX: Ticket → TicketType → Show → Event
    const topEventsByTicketSales = await Ticket.aggregate([
      {
        $match: {
          ...matchQuery,
          status: { $in: ["pending", "checkedIn", "out"] },
        },
      },
      {
        $lookup: {
          from: "tickettypes",
          localField: "ticketType",
          foreignField: "_id",
          as: "ticketType",
        },
      },
      { $unwind: "$ticketType" },
      {
        $lookup: {
          from: "shows",
          localField: "ticketType.show",
          foreignField: "_id",
          as: "show",
        },
      },
      { $unwind: "$show" },
      {
        $lookup: {
          from: "events",
          localField: "show.event",
          foreignField: "_id",
          as: "event",
        },
      },
      { $unwind: "$event" },
      {
        $group: {
          _id: {
            eventId: "$event._id",
            eventName: "$event.name",
          },
          ticketsSold: { $sum: 1 },
        },
      },
      { $sort: { ticketsSold: -1 } },
      { $limit: 10 },
    ]);

    // Thống kê vé theo thời gian (7 ngày gần nhất)
    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const ticketsByDay = await Ticket.aggregate([
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
          },
          totalTickets: { $sum: 1 },
          soldTickets: {
            $sum: {
              $cond: [
                { $in: ["$status", ["pending", "checkedIn", "out"]] },
                1,
                0,
              ],
            },
          },
          cancelledTickets: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    return {
      success: true,
      message: "Ticket report generated successfully",
      data: {
        summary: {
          totalTickets,
          soldTickets,
          cancelledTickets,
          availableTickets: totalTickets - soldTickets - cancelledTickets,
          cancellationRate: parseFloat(cancellationRate.toFixed(2)),
        },
        ticketsByStatus: ticketsByStatus.map((item) => ({
          status: item._id,
          count: item.count,
        })),
        ticketsByCategory: ticketsByCategory.map((item) => ({
          categoryId: item._id.categoryId,
          categoryName: item._id.categoryName || "Uncategorized",
          totalTickets: item.totalTickets,
          pendingTickets: item.pendingTickets,
          checkedInTickets: item.checkedInTickets,
          cancelledTickets: item.cancelledTickets,
        })),
        topEventsByTicketSales: topEventsByTicketSales.map((item) => ({
          eventId: item._id.eventId,
          eventName: item._id.eventName,
          ticketsSold: item.ticketsSold,
        })),
        ticketsByDay,
      },
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Báo cáo người dùng (User Report)
 */
const getUserReport = async (startDate, endDate) => {
  try {
    if (!startDate || !endDate) {
      const error = new Error("Start date and end date are required");
      error.status = 400;
      throw error;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Tổng số user mới trong khoảng thời gian
    const newUsers = await User.countDocuments({
      createdAt: { $gte: start, $lte: end },
    });

    // User mới theo thời gian (by day)
    const newUsersByDay = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 },
      },
    ]);

    // Tổng số user đã mua vé (buyers)
    // ✅ FIX: Order status là "paid" chứ không phải "completed"
    const totalBuyers = await Order.distinct("buyer", {
      createdAt: { $gte: start, $lte: end },
      status: "paid", // ✅ FIX: Đổi từ ["completed", "paid"] → "paid"
    });

    // Tỷ lệ chuyển đổi (conversion rate)
    // Visitors = Total users, Buyers = Users có order
    const conversionRate =
      newUsers > 0 ? (totalBuyers.length / newUsers) * 100 : 0;

    // User retention rate
    // Tính số user quay lại mua vé lần 2+
    const repeatBuyers = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: "paid", // ✅ FIX: Đổi từ ["completed", "paid"] → "paid"
        },
      },
      {
        $group: {
          _id: "$buyer", // ✅ FIX: Đổi từ "$user" → "$buyer"
          orderCount: { $sum: 1 },
        },
      },
      {
        $match: {
          orderCount: { $gt: 1 },
        },
      },
      {
        $count: "repeatBuyersCount",
      },
    ]);

    const repeatBuyersCount = repeatBuyers[0]?.repeatBuyersCount || 0;
    const retentionRate =
      totalBuyers.length > 0
        ? (repeatBuyersCount / totalBuyers.length) * 100
        : 0;

    // User theo role
    const usersByRole = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 },
        },
      },
    ]);

    // User theo status (trong period)
    const usersByStatus = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Top buyers (người mua nhiều vé nhất)
    const topBuyers = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
          status: "paid", // ✅ FIX: Đổi từ ["completed", "paid"] → "paid"
        },
      },
      {
        $group: {
          _id: "$buyer", // ✅ FIX: Đổi từ "$user" → "$buyer"
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: "$user" },
      {
        $project: {
          userId: "$user._id",
          fullName: "$user.fullName",
          email: "$user.email",
          totalOrders: 1,
          totalSpent: 1,
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
    ]);

    // User growth (so với period trước)
    const periodLength = end - start;
    const previousStart = new Date(start.getTime() - periodLength);
    const previousEnd = new Date(start.getTime() - 1);

    const previousPeriodUsers = await User.countDocuments({
      createdAt: { $gte: previousStart, $lte: previousEnd },
    });

    const userGrowthRate =
      previousPeriodUsers > 0
        ? ((newUsers - previousPeriodUsers) / previousPeriodUsers) * 100
        : 0;

    return {
      success: true,
      message: "User report generated successfully",
      data: {
        period: {
          startDate: start,
          endDate: end,
        },
        summary: {
          totalNewUsers: newUsers,
          totalBuyers: totalBuyers.length,
          repeatBuyers: repeatBuyersCount,
          conversionRate: parseFloat(conversionRate.toFixed(2)),
          retentionRate: parseFloat(retentionRate.toFixed(2)),
          userGrowthRate: parseFloat(userGrowthRate.toFixed(2)),
        },
        newUsersByDay,
        usersByRole: usersByRole.map((item) => ({
          role: item._id,
          count: item.count,
        })),
        usersByStatus: usersByStatus.map((item) => ({
          status: item._id || "unknown",
          count: item.count,
        })),
        topBuyers,
      },
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Báo cáo theo category
 */
const getCategoryReport = async () => {
  try {
    const categoryStats = await Category.aggregate([
      {
        $lookup: {
          from: "events",
          localField: "_id",
          foreignField: "category",
          as: "events",
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          slug: 1,
          totalEvents: { $size: "$events" },
          activeEvents: {
            $size: {
              $filter: {
                input: "$events",
                as: "event",
                cond: {
                  $in: ["$$event.status", ["upcoming", "ongoing", "completed"]],
                },
              },
            },
          },
          events: 1,
        },
      },
      {
        $lookup: {
          from: "shows",
          let: { eventIds: "$events._id" },
          pipeline: [
            {
              $match: {
                $expr: { $in: ["$event", "$$eventIds"] },
              },
            },
            {
              $lookup: {
                from: "tickettypes",
                localField: "_id",
                foreignField: "show",
                as: "ticketTypes",
              },
            },
            { $unwind: "$ticketTypes" },
            {
              $lookup: {
                from: "orderitems",
                localField: "ticketTypes._id",
                foreignField: "ticketType",
                as: "orderItems",
              },
            },
            { $unwind: "$orderItems" },
            {
              $group: {
                _id: null,
                totalTicketsSold: { $sum: "$orderItems.quantity" },
                totalRevenue: {
                  $sum: {
                    $multiply: [
                      "$orderItems.priceAtPurchase",
                      "$orderItems.quantity",
                    ],
                  },
                },
              },
            },
          ],
          as: "sales",
        },
      },
      {
        $unwind: { path: "$sales", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          slug: 1,
          totalEvents: 1,
          activeEvents: 1,
          totalTicketsSold: { $ifNull: ["$sales.totalTicketsSold", 0] },
          totalRevenue: { $ifNull: ["$sales.totalRevenue", 0] },
        },
      },
      { $sort: { totalRevenue: -1 } },
    ]);

    return {
      success: true,
      message: "Category report generated successfully",
      data: categoryStats,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Export báo cáo (JSON format, FE sẽ convert sang PDF/Excel)
 */
const exportReport = async (reportType, filters = {}) => {
  try {
    let reportData;

    switch (reportType) {
      case "revenue":
        reportData = await getRevenueReport(
          filters.startDate,
          filters.endDate,
          filters.groupBy || "day"
        );
        break;
      case "ticket":
        reportData = await getTicketReport(filters);
        break;
      case "user":
        reportData = await getUserReport(filters.startDate, filters.endDate);
        break;
      case "category":
        reportData = await getCategoryReport();
        break;
      default:
        const error = new Error(
          "Invalid report type. Must be: revenue, ticket, user, or category"
        );
        error.status = 400;
        throw error;
    }

    return {
      success: true,
      message: `${reportType} report exported successfully`,
      data: {
        reportType,
        generatedAt: new Date(),
        filters,
        report: reportData.data,
      },
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  getRevenueReport,
  getTicketReport,
  getUserReport,
  getCategoryReport,
  exportReport,
};
