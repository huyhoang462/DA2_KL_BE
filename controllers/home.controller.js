const {
  incrementEventView,
  getFeaturedEvents,
  getEventsByCategory,
  getNewEvents,
  getThisWeekendEvents,
  getTrendingEvents,
  getSellingFastEvents,
} = require("../services/eventService");

/**
 * POST /api/events/:id/view
 * Tăng view count cho event
 */
const handleIncrementView = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await incrementEventView(id);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/home/featured
 * Lấy sự kiện nổi bật cho banner (5 events)
 */
const handleGetFeatured = async (req, res, next) => {
  try {
    const events = await getFeaturedEvents();
    res.json({
      success: true,
      data: events,
      count: events.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/home/category/:categoryId
 * Lấy sự kiện theo category
 */
const handleGetByCategory = async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    const { limit = 12 } = req.query;

    const events = await getEventsByCategory(categoryId, limit);

    res.json({
      success: true,
      data: events,
      count: events.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/home/new-events
 * Lấy sự kiện mới nhất
 */
const handleGetNewEvents = async (req, res, next) => {
  try {
    const { limit = 12 } = req.query;
    const events = await getNewEvents(limit);

    res.json({
      success: true,
      data: events,
      count: events.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/home/this-weekend
 * Lấy sự kiện cuối tuần này
 */
const handleGetThisWeekend = async (req, res, next) => {
  try {
    const { limit = 12 } = req.query;
    const events = await getThisWeekendEvents(limit);

    res.json({
      success: true,
      data: events,
      count: events.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/home/trending
 * Lấy sự kiện đang thịnh hành
 */
const handleGetTrending = async (req, res, next) => {
  try {
    const { limit = 12 } = req.query;
    const events = await getTrendingEvents(limit);

    res.json({
      success: true,
      data: events,
      count: events.length,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/home/selling-fast
 * Lấy sự kiện sắp hết vé
 */
const handleGetSellingFast = async (req, res, next) => {
  try {
    const { limit = 12 } = req.query;
    const events = await getSellingFastEvents(limit);

    res.json({
      success: true,
      data: events,
      count: events.length,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleIncrementView,
  handleGetFeatured,
  handleGetByCategory,
  handleGetNewEvents,
  handleGetThisWeekend,
  handleGetTrending,
  handleGetSellingFast,
};
