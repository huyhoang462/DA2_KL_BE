const {
  getAllEvents,
  createEvent,
  getEventById,
  deleteEvent,
  cleanupOrphanedData,
  getEventsByUserId,
  getPendingEvents,
  getUpcomingEventsByUserId,
  updateEventStatus,
  updateEvent,
  startEventMinting,
  finalizeEventMinting,
  getDashboardOverview,
  getRevenueAnalytics,
} = require("../services/eventService");

const handleCleanupData = async (req, res, next) => {
  try {
    const result = await cleanupOrphanedData();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleGetPendingEvents = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const result = await getPendingEvents(page, limit);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleGetEventsByUserId = async (req, res, next) => {
  try {
    const { id: userId } = req.params;
    const result = await getEventsByUserId(userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleGetAllEvents = async (req, res, next) => {
  try {
    const result = await getAllEvents();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleGetEventById = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const result = await getEventById(eventId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleGetUpcomingEventsByUserId = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const result = await getUpcomingEventsByUserId(userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleCreateEvent = async (req, res, next) => {
  try {
    const data = req.body;
    const creatorId = req.user._id;
    const result = await createEvent(data, creatorId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const handleUpdateEvent = async (req, res, next) => {
  try {
    const data = req.body;
    const eventId = req.params.id;
    const result = await updateEvent(eventId, data);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const handleUpdateEventStatus = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const { status, reason } = req.body;
    const result = await updateEventStatus(eventId, status, reason);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleStartEventMinting = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const organizerId = req.user?._id || null;
    const result = await startEventMinting(eventId, organizerId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleFinalizeEventMinting = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const organizerId = req.user?._id || null;
    const { isSuccess, failureReason } = req.body;
    const result = await finalizeEventMinting(
      eventId,
      isSuccess,
      failureReason,
      organizerId,
    );
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleDeleteEvent = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const result = await deleteEvent(eventId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy dashboard overview của event
 * GET /api/events/:id/dashboard/overview
 */
const handleGetDashboardOverview = async (req, res, next) => {
  try {
    const { id: eventId } = req.params;

    console.log("[GET DASHBOARD OVERVIEW] Request:", { eventId });

    const result = await getDashboardOverview(eventId);

    res.status(200).json(result);
  } catch (error) {
    console.error("[GET DASHBOARD OVERVIEW] Error:", error);
    next(error);
  }
};

/**
 * Lấy revenue analytics của event
 * GET /api/events/:id/dashboard/revenue-chart
 */
const handleGetRevenueAnalytics = async (req, res, next) => {
  try {
    const { id: eventId } = req.params;
    const { startDate, endDate, groupBy = "day" } = req.query;

    console.log("[GET REVENUE ANALYTICS] Request:", {
      eventId,
      startDate,
      endDate,
      groupBy,
    });

    const result = await getRevenueAnalytics(
      eventId,
      startDate,
      endDate,
      groupBy,
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("[GET REVENUE ANALYTICS] Error:", error);
    next(error);
  }
};

const handleUpdateMintingStatus = async (req, res, next) => {
  try {
    const { id } = req.params; // _id của MongoDB
    const { txHash } = req.body;

    if (!txHash) return res.status(400).json({ error: "Missing txHash" });

    // 1. Tìm event và kiểm tra trạng thái
    const Event = require("../models/event"); // import Event
    const event = await Event.findById(id);
    if (!event || event.status !== "approved") {
      return res.status(400).json({ error: "Event is not ready for minting" });
    }

    // 2. Cập nhật trạng thái
    event.status = "minting";
    await event.save();

    return res.status(200).json({
      message: "Transaction received. Worker is verifying...",
      status: "minting",
    });
  } catch (error) {
    next(error);
  }
};

const handleSettleEvent = async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      txHash,
      organizerAmount,
      adminAmount,
      organizerAddress,
      adminTreasuryAddress,
    } = req.body;
    const organizerId = req.user._id;

    if (!txHash || organizerAmount == null || adminAmount == null) {
      const error = new Error("Missing settlement data");
      error.status = 400;
      throw error;
    }

    const settlementData = {
      txHash,
      organizerAmount,
      adminAmount,
      organizerAddress,
      adminTreasuryAddress,
    };

    // Use the adminEventService logic or move it. For now, require it from adminEventService
    const result = await require("../services/adminEventService").settleEvent(
      id,
      settlementData,
      organizerId,
    );
    res.status(200).json(result);
  } catch (error) {
    console.error("[EVENT] Error settling event:", error);
    next(error);
  }
};

module.exports = {
  handleCleanupData,
  handleGetAllEvents,
  handleGetPendingEvents,
  handleGetEventById,
  handleGetEventsByUserId,  
  handleGetUpcomingEventsByUserId,
  handleCreateEvent,
  handleUpdateEvent,
  handleUpdateEventStatus,
  handleStartEventMinting,
  handleFinalizeEventMinting,
  handleDeleteEvent,
  handleGetDashboardOverview,
  handleGetRevenueAnalytics,
  handleUpdateMintingStatus,
  handleSettleEvent,
};
