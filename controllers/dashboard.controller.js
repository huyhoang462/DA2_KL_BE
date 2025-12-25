const {
  getDashboardOverview,
  getUserStatistics,
  getEventStatistics,
} = require("../services/dashboardService");

/**
 * GET /api/admin/dashboard/overview
 * Lấy tổng quan dashboard
 */
const handleGetDashboardOverview = async (req, res, next) => {
  try {
    console.log("[DASHBOARD] Getting overview...");
    const result = await getDashboardOverview();
    res.status(200).json(result);
  } catch (error) {
    console.error("[DASHBOARD] Error getting overview:", error);
    next(error);
  }
};

/**
 * GET /api/admin/dashboard/users/statistics
 * Lấy thống kê người dùng chi tiết
 */
const handleGetUserStatistics = async (req, res, next) => {
  try {
    console.log("[DASHBOARD] Getting user statistics...");
    const result = await getUserStatistics();
    res.status(200).json(result);
  } catch (error) {
    console.error("[DASHBOARD] Error getting user statistics:", error);
    next(error);
  }
};

/**
 * GET /api/admin/dashboard/events/statistics
 * Lấy thống kê sự kiện chi tiết
 */
const handleGetEventStatistics = async (req, res, next) => {
  try {
    console.log("[DASHBOARD] Getting event statistics...");
    const result = await getEventStatistics();
    res.status(200).json(result);
  } catch (error) {
    console.error("[DASHBOARD] Error getting event statistics:", error);
    next(error);
  }
};

module.exports = {
  handleGetDashboardOverview,
  handleGetUserStatistics,
  handleGetEventStatistics,
};
