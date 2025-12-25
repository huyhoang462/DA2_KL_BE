const {
  getSearchSuggestions,
  getPopularSearches,
  searchEvents,
  trackSearchQuery,
} = require("../services/searchService");

/**
 * Handler: GET /api/search/suggestions?q=query
 * Lấy gợi ý khi user đang gõ search (autocomplete)
 */
const handleSearchSuggestions = async (req, res, next) => {
  try {
    const query = req.query.q || "";
    const result = await getSearchSuggestions(query);

    // Track search query nếu có query và có kết quả
    if (query && result.events && result.events.length > 0) {
      // Fire and forget - không cần await
      trackSearchQuery(query, result.events.length, req.user?._id).catch(
        (err) => console.error("[TRACK ERROR]:", err)
      );
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Handler: GET /api/search/popular
 * Lấy top 5 sự kiện popular & keywords (hiển thị khi focus search bar)
 */
const handleGetPopularSearches = async (req, res, next) => {
  try {
    const result = await getPopularSearches();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * Handler: GET /api/search/events
 * Tìm kiếm sự kiện với filters đầy đủ (Search Results Page)
 * Query params: q, category, city, startDate, endDate, minPrice, maxPrice, sortBy, page, limit
 */
const handleSearchEvents = async (req, res, next) => {
  try {
    const queryParams = req.query;
    console.log("[SEARCH CONTROLLER]: Params =", queryParams);

    const result = await searchEvents(queryParams);

    // Track search query nếu có query
    if (queryParams.q && result.data) {
      // Fire and forget
      trackSearchQuery(
        queryParams.q,
        result.pagination?.total || 0,
        req.user?._id
      ).catch((err) => console.error("[TRACK ERROR]:", err));
    }

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleSearchSuggestions,
  handleGetPopularSearches,
  handleSearchEvents,
};
