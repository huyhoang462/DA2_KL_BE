const mongoose = require("mongoose");
const Event = require("../models/event");
const User = require("../models/user");
const Show = require("../models/show");
const TicketType = require("../models/ticketType");
const Category = require("../models/category");
const Order = require("../models/order");
const Transaction = require("../models/transaction");
const {
  sendEventApprovedEmail,
  sendEventCancelledEmail,
} = require("../utils/mailer");

/**
 * Lấy danh sách tất cả events với filters và pagination
 */
const getAllEvents = async (filters = {}, page = 1, limit = 20) => {
  try {
    const {
      search, // Tìm theo tên hoặc mô tả
      status, // Lọc theo status
      category, // Lọc theo danh mục
      format, // online/offline
      startDate, // Từ ngày
      endDate, // Đến ngày
      featured, // Chỉ lấy featured events
      sortBy = "createdAt",
      sortOrder = "desc",
    } = filters;

    // Build match query
    const matchQuery = {};

    // Search by name or description
    if (search && search.trim()) {
      matchQuery.$or = [
        { name: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Filter by status
    if (status) {
      matchQuery.status = status;
    }

    // Filter by category
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      matchQuery.category = new mongoose.Types.ObjectId(category);
    }

    // Filter by format
    if (format && ["online", "offline"].includes(format)) {
      matchQuery.format = format;
    }

    // Filter by date range
    if (startDate || endDate) {
      matchQuery.startDate = {};
      if (startDate) {
        matchQuery.startDate.$gte = new Date(startDate);
      }
      if (endDate) {
        matchQuery.startDate.$lte = new Date(endDate);
      }
    }

    // Filter by featured
    if (featured === "true" || featured === true) {
      matchQuery.featured = true;
    }

    // Aggregation pipeline
    const aggregationPipeline = [
      { $match: matchQuery },

      // Lookup creator
      {
        $lookup: {
          from: "users",
          localField: "creator",
          foreignField: "_id",
          as: "creator",
        },
      },
      {
        $unwind: { path: "$creator", preserveNullAndEmptyArrays: true },
      },

      // Lookup category
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

      // Lookup shows
      {
        $lookup: {
          from: "shows",
          localField: "_id",
          foreignField: "event",
          as: "shows",
        },
      },

      // Lookup ticket types
      {
        $lookup: {
          from: "tickettypes",
          localField: "shows._id",
          foreignField: "show",
          as: "ticketTypes",
        },
      },

      // Add computed fields
      {
        $addFields: {
          totalShows: { $size: "$shows" },
          totalTicketsSold: { $sum: "$ticketTypes.quantitySold" },
          totalTicketsAvailable: { $sum: "$ticketTypes.quantityTotal" },
          lowestPrice: { $min: "$ticketTypes.price" },
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
              $project: {
                _id: 1,
                name: 1,
                bannerImageUrl: 1,
                format: 1,
                location: 1,
                startDate: 1,
                endDate: 1,
                status: 1,
                featured: 1,
                featuredOrder: 1,
                featuredUntil: 1,
                views: 1,
                creator: {
                  id: { $toString: "$creator._id" },
                  fullName: "$creator.fullName",
                  email: "$creator.email",
                },
                category: {
                  id: { $toString: "$category._id" },
                  name: "$category.name",
                },
                totalShows: 1,
                totalTicketsSold: 1,
                totalTicketsAvailable: 1,
                lowestPrice: 1,
                createdAt: 1,
                updatedAt: 1,
              },
            },
          ],
        },
      },
    ];

    const results = await Event.aggregate(aggregationPipeline);

    const events = results[0].data;
    const totalEvents = results[0].metadata[0]?.total || 0;
    const totalPages = Math.ceil(totalEvents / parseInt(limit, 10));

    return {
      success: true,
      data: {
        events: events.map((event) => ({
          id: event._id.toString(),
          name: event.name,
          bannerImageUrl: event.bannerImageUrl,
          format: event.format,
          location: event.location,
          startDate: event.startDate,
          endDate: event.endDate,
          status: event.status,
          featured: event.featured,
          featuredOrder: event.featuredOrder,
          featuredUntil: event.featuredUntil,
          views: event.views,
          creator: event.creator,
          category: event.category,
          totalShows: event.totalShows,
          totalTicketsSold: event.totalTicketsSold,
          totalTicketsAvailable: event.totalTicketsAvailable,
          lowestPrice: event.lowestPrice,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
        })),
        pagination: {
          currentPage: parseInt(page, 10),
          totalPages,
          totalEvents,
          limit: parseInt(limit, 10),
        },
      },
    };
  } catch (error) {
    console.error("[ADMIN EVENT] Error getting all events:", error);
    throw error;
  }
};

/**
 * Lấy chi tiết event (sử dụng service có sẵn)
 */
const getEventById = async (eventId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      const error = new Error("Invalid event ID format");
      error.status = 400;
      throw error;
    }

    const { getEventById: getEventByIdService } = require("./eventService");
    return await getEventByIdService(eventId);
  } catch (error) {
    console.error("[ADMIN EVENT] Error getting event by ID:", error);
    throw error;
  }
};

/**
 * Cập nhật status của event
 * Admin có thể: approve, reject, cancel
 */
const updateEventStatus = async (eventId, newStatus, reason, adminId) => {
  try {
    console.log("[ADMIN EVENT SERVICE] Starting updateEventStatus:", {
      eventId,
      newStatus,
      hasReason: !!reason,
      adminId,
    });

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      const error = new Error("Invalid event ID format");
      error.status = 400;
      throw error;
    }

    const validStatuses = [
      "pending",
      "upcoming",
      "ongoing",
      "completed",
      "rejected",
      "cancelled",
    ];

    if (!validStatuses.includes(newStatus)) {
      const error = new Error(
        `Invalid status. Must be one of: ${validStatuses.join(", ")}`
      );
      error.status = 400;
      throw error;
    }

    console.log("[ADMIN EVENT SERVICE] Finding event...");
    const event = await Event.findById(eventId);

    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    const oldStatus = event.status;
    console.log("[ADMIN EVENT SERVICE] Event found, oldStatus:", oldStatus);

    // Logic kiểm tra status transition
    if (oldStatus === "completed") {
      const error = new Error("Cannot change status of completed event");
      error.status = 400;
      throw error;
    }

    // Update status
    event.status = newStatus;

    // Nếu reject, cần có reason
    if (newStatus === "rejected") {
      if (!reason) {
        const error = new Error("Rejection reason is required");
        error.status = 400;
        throw error;
      }
      event.rejectionReason = reason;
    }

    // Nếu cancel, có thể có reason
    if (newStatus === "cancelled") {
      event.cancelReason = reason || "admin_cancelled";
    }

    console.log("[ADMIN EVENT SERVICE] Saving event...");
    await event.save();
    console.log("[ADMIN EVENT SERVICE] Event saved successfully");

    return {
      success: true,
      message: `Event status updated from ${oldStatus} to ${newStatus} successfully`,
      data: {
        eventId: event._id.toString(),
        name: event.name,
        oldStatus,
        newStatus,
        reason: newStatus === "rejected" ? event.rejectionReason : null,
      },
    };
  } catch (error) {
    console.error("[ADMIN EVENT] Error updating event status:", error);
    throw error;
  }
};

/**
 * Set featured event
 */
const setFeaturedEvent = async (
  eventId,
  featured,
  featuredOrder = null,
  featuredUntil = null
) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      const error = new Error("Invalid event ID format");
      error.status = 400;
      throw error;
    }

    const event = await Event.findById(eventId);

    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    // Chỉ upcoming/ongoing events mới có thể featured
    if (!["upcoming", "ongoing"].includes(event.status)) {
      const error = new Error(
        "Only upcoming or ongoing events can be featured"
      );
      error.status = 400;
      throw error;
    }

    event.featured = featured;

    if (featured) {
      event.featuredOrder = featuredOrder || 1;
      // Nếu không set featuredUntil, mặc định là 30 ngày
      event.featuredUntil =
        featuredUntil || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else {
      event.featuredOrder = null;
      event.featuredUntil = null;
    }

    await event.save();

    return {
      success: true,
      message: featured
        ? "Event has been set as featured"
        : "Event featured status removed",
      data: {
        eventId: event._id.toString(),
        name: event.name,
        featured: event.featured,
        featuredOrder: event.featuredOrder,
        featuredUntil: event.featuredUntil,
      },
    };
  } catch (error) {
    console.error("[ADMIN EVENT] Error setting featured event:", error);
    throw error;
  }
};

/**
 * Xóa event (soft delete - chuyển status thành cancelled)
 * Hard delete nếu cần (nguy hiểm - có thể break foreign keys)
 */
const deleteEvent = async (eventId, adminId, hardDelete = false) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      const error = new Error("Invalid event ID format");
      error.status = 400;
      throw error;
    }

    const event = await Event.findById(eventId).populate(
      "creator",
      "email fullName"
    );

    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    // Kiểm tra xem đã có orders chưa
    const hasOrders = await Order.exists({
      _id: {
        $in: await mongoose.model("OrderItem").distinct("order", {
          ticketType: {
            $in: await TicketType.distinct("_id", {
              show: {
                $in: await Show.distinct("_id", { event: eventId }),
              },
            }),
          },
        }),
      },
      status: "paid",
    });

    if (hasOrders && hardDelete) {
      const error = new Error(
        "Cannot hard delete event with paid orders. Use soft delete instead."
      );
      error.status = 400;
      throw error;
    }

    if (hardDelete) {
      // Hard delete - XÓA HOÀN TOÀN (nguy hiểm)
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Xóa tất cả related data
        const shows = await Show.find({ event: eventId }).session(session);
        const showIds = shows.map((show) => show._id);

        await TicketType.deleteMany({ show: { $in: showIds } }).session(
          session
        );
        await Show.deleteMany({ event: eventId }).session(session);
        await Event.findByIdAndDelete(eventId).session(session);

        await session.commitTransaction();

        return {
          success: true,
          message: "Event has been permanently deleted",
        };
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } else {
      // Soft delete - Cancel event
      event.status = "cancelled";
      event.cancelReason = "admin_cancelled";
      await event.save();

      // Gửi email thông báo
      try {
        await sendEventCancelledEmail(
          event.creator.email,
          event.creator.fullName,
          event.name,
          "Event has been cancelled by admin"
        );
      } catch (emailError) {
        console.error("[ADMIN EVENT] Error sending email:", emailError);
      }

      return {
        success: true,
        message: "Event has been cancelled",
        data: {
          eventId: event._id.toString(),
          name: event.name,
          status: event.status,
        },
      };
    }
  } catch (error) {
    console.error("[ADMIN EVENT] Error deleting event:", error);
    throw error;
  }
};

/**
 * Lấy thống kê events cho admin
 */
const getEventStatistics = async () => {
  try {
    // Thống kê theo status
    const byStatus = await Event.aggregate([
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
    const byFormat = await Event.aggregate([
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

    // Thống kê theo category
    const byCategory = await Event.aggregate([
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
          as: "category",
        },
      },
      {
        $unwind: "$category",
      },
      {
        $group: {
          _id: "$category._id",
          name: { $first: "$category.name" },
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

    // Top organizers
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
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $project: {
          _id: 0,
          userId: { $toString: "$_id" },
          fullName: "$user.fullName",
          email: "$user.email",
          eventCount: 1,
        },
      },
    ]);

    // Featured events count
    const featuredCount = await Event.countDocuments({
      featured: true,
      featuredUntil: { $gte: new Date() },
    });

    return {
      success: true,
      data: {
        byStatus,
        byFormat,
        byCategory,
        topOrganizers,
        featuredCount,
      },
    };
  } catch (error) {
    console.error("[ADMIN EVENT] Error getting event statistics:", error);
    throw error;
  }
};

module.exports = {
  getAllEvents,
  getEventById,
  updateEventStatus,
  setFeaturedEvent,
  deleteEvent,
  getEventStatistics,
};
