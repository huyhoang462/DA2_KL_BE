const express = require("express");
const router = express.Router();
const {
  handleGetDashboardOverview,
  handleGetUserStatistics,
  handleGetEventStatistics,
} = require("../controllers/dashboard.controller");
const { userExtractor } = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization");

/**
 * @route   GET /api/admin/dashboard/overview
 * @desc    Lấy tổng quan dashboard (overview cards, charts, recent activities, alerts)
 * @access  Admin only
 */
router.get(
  "/overview",
  userExtractor,
  requireAdmin,
  handleGetDashboardOverview
);

/**
 * @route   GET /api/admin/dashboard/users/statistics
 * @desc    Lấy thống kê người dùng chi tiết
 * @access  Admin only
 */
router.get(
  "/users/statistics",
  userExtractor,
  requireAdmin,
  handleGetUserStatistics
);

/**
 * @route   GET /api/admin/dashboard/events/statistics
 * @desc    Lấy thống kê sự kiện chi tiết
 * @access  Admin only
 */
router.get(
  "/events/statistics",
  userExtractor,
  requireAdmin,
  handleGetEventStatistics
);

module.exports = router;
