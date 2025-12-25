const {
  getAllEvents,
  getEventById,
  updateEventStatus,
  setFeaturedEvent,
  deleteEvent,
  getEventStatistics,
} = require("../services/adminEventService");

/**
 * GET /api/admin/events
 * Lấy danh sách tất cả events với filters và pagination
 */
const handleGetAllEvents = async (req, res, next) => {
  try {
    const {
      search,
      status,
      category,
      format,
      startDate,
      endDate,
      featured,
      sortBy,
      sortOrder,
      page = 1,
      limit = 20,
    } = req.query;

    const filters = {
      search,
      status,
      category,
      format,
      startDate,
      endDate,
      featured,
      sortBy,
      sortOrder,
    };

    console.log("[ADMIN EVENT] Getting all events with filters:", filters);

    const result = await getAllEvents(filters, page, limit);
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN EVENT] Error getting all events:", error);
    next(error);
  }
};

/**
 * GET /api/admin/events/:id
 * Lấy thông tin chi tiết một event
 */
const handleGetEventById = async (req, res, next) => {
  try {
    const { id } = req.params;

    console.log("[ADMIN EVENT] Getting event by ID:", id);

    const result = await getEventById(id);
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN EVENT] Error getting event by ID:", error);
    next(error);
  }
};

/**
 * PATCH /api/admin/events/:id/status
 * Cập nhật status của event
 */
const handleUpdateEventStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    const adminId = req.user._id;

    console.log("[ADMIN EVENT] Updating event status:", {
      id,
      status,
      reason,
      adminId,
    });

    if (!status) {
      const error = new Error("Status is required");
      error.status = 400;
      throw error;
    }

    const result = await updateEventStatus(id, status, reason, adminId);
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN EVENT] Error updating event status:", error);
    next(error);
  }
};

/**
 * PATCH /api/admin/events/:id/featured
 * Set/unset featured event
 */
const handleSetFeaturedEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { featured, featuredOrder, featuredUntil } = req.body;

    console.log("[ADMIN EVENT] Setting featured event:", {
      id,
      featured,
      featuredOrder,
      featuredUntil,
    });

    if (featured === undefined) {
      const error = new Error("Featured flag is required");
      error.status = 400;
      throw error;
    }

    const result = await setFeaturedEvent(
      id,
      featured,
      featuredOrder,
      featuredUntil
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN EVENT] Error setting featured event:", error);
    next(error);
  }
};

/**
 * DELETE /api/admin/events/:id
 * Xóa event (soft delete hoặc hard delete)
 */
const handleDeleteEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { hardDelete = false } = req.query;
    const adminId = req.user._id;

    console.log("[ADMIN EVENT] Deleting event:", { id, hardDelete, adminId });

    const result = await deleteEvent(id, adminId, hardDelete === "true");
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN EVENT] Error deleting event:", error);
    next(error);
  }
};

/**
 * GET /api/admin/events/statistics
 * Lấy thống kê events
 */
const handleGetEventStatistics = async (req, res, next) => {
  try {
    console.log("[ADMIN EVENT] Getting event statistics...");

    const result = await getEventStatistics();
    res.status(200).json(result);
  } catch (error) {
    console.error("[ADMIN EVENT] Error getting event statistics:", error);
    next(error);
  }
};

module.exports = {
  handleGetAllEvents,
  handleGetEventById,
  handleUpdateEventStatus,
  handleSetFeaturedEvent,
  handleDeleteEvent,
  handleGetEventStatistics,
};
