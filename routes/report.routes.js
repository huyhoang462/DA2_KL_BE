const express = require("express");
const router = express.Router();
const {
  handleGetRevenueReport,
  handleGetTicketReport,
  handleGetUserReport,
  handleGetCategoryReport,
  handleExportReport,
} = require("../controllers/report.controller");
const { userExtractor } = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization");

/**
 * ============================================================
 * ADMIN REPORTS & ANALYTICS API
 * ============================================================
 * Trang báo cáo và thống kê chi tiết cho admin
 * Phân tích sâu về: Doanh thu, Vé, Người dùng, Danh mục
 * ============================================================
 */

/**
 * @route   GET /api/admin/reports/revenue
 * @desc    Báo cáo doanh thu theo thời gian
 * @query   startDate (string) - Ngày bắt đầu (YYYY-MM-DD) - REQUIRED
 * @query   endDate (string) - Ngày kết thúc (YYYY-MM-DD) - REQUIRED
 * @query   groupBy (string) - Nhóm theo: day, week, month, year (default: day)
 * @access  Admin only
 */
router.get("/revenue", userExtractor, requireAdmin, handleGetRevenueReport);

/**
 * @route   GET /api/admin/reports/tickets
 * @desc    Báo cáo về vé (tickets sold, cancelled, by category, etc.)
 * @query   startDate (string) - Ngày bắt đầu (YYYY-MM-DD)
 * @query   endDate (string) - Ngày kết thúc (YYYY-MM-DD)
 * @query   category (string) - Lọc theo category ID
 * @query   eventId (string) - Lọc theo event ID
 * @query   status (string) - Lọc theo status: active, used, cancelled, transferred
 * @access  Admin only
 */
router.get("/tickets", userExtractor, requireAdmin, handleGetTicketReport);

/**
 * @route   GET /api/admin/reports/users
 * @desc    Báo cáo người dùng (new users, conversion rate, retention, etc.)
 * @query   startDate (string) - Ngày bắt đầu (YYYY-MM-DD) - REQUIRED
 * @query   endDate (string) - Ngày kết thúc (YYYY-MM-DD) - REQUIRED
 * @access  Admin only
 */
router.get("/users", userExtractor, requireAdmin, handleGetUserReport);

/**
 * @route   GET /api/admin/reports/categories
 * @desc    Báo cáo theo danh mục (events, revenue, tickets by category)
 * @access  Admin only
 */
router.get("/categories", userExtractor, requireAdmin, handleGetCategoryReport);

/**
 * @route   POST /api/admin/reports/export
 * @desc    Export báo cáo (JSON format - FE convert to PDF/Excel)
 * @body    reportType (string) - Loại báo cáo: revenue, ticket, user, category - REQUIRED
 * @body    startDate (string) - Ngày bắt đầu (nếu áp dụng)
 * @body    endDate (string) - Ngày kết thúc (nếu áp dụng)
 * @body    groupBy (string) - Group by (cho revenue report)
 * @body    ...other filters
 * @access  Admin only
 */
router.post("/export", userExtractor, requireAdmin, handleExportReport);

module.exports = router;
