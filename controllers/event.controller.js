const {
  getAllEvents,
  createEvent,
  getEventById,
  deleteEvent,
  cleanupOrphanedData,
  getEventsByUserId,
  getSearchSuggestions,
  searchEvents,
  getPendingEvents,
  updateEventStatus,
  updateEvent,
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

const handleSearchSuggestions = async (req, res, next) => {
  try {
    const query = req.query.q || "";
    const result = await getSearchSuggestions(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleSearchEvents = async (req, res, next) => {
  try {
    const queryParams = req.query;
    console.log("[PARAM]: ", queryParams);

    const result = await searchEvents(queryParams);
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

const handleGetEventsByUserId = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const result = await getEventsByUserId(userId);
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
      groupBy
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("[GET REVENUE ANALYTICS] Error:", error);
    next(error);
  }
};

module.exports = {
  handleCleanupData,
  handleSearchSuggestions,
  handleSearchEvents,
  handleGetAllEvents,
  handleGetPendingEvents,
  handleGetEventById,
  handleGetEventsByUserId,
  handleCreateEvent,
  handleUpdateEvent,
  handleUpdateEventStatus,
  handleDeleteEvent,
  handleGetDashboardOverview,
  handleGetRevenueAnalytics,
};
