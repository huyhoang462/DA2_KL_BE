const router = require("express").Router();
const contentReportController = require("../controllers/contentReport.controller");
const { userExtractor } = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization");

/**
 * ============================================================
 * CONTENT REPORT API
 * ============================================================
 * Cho phép user báo cáo posts và comments
 * Admin có thể review, approve, và thực hiện actions
 * ============================================================
 */

/**
 * @route   GET /api/reports
 * @desc    Lấy danh sách reports (mặc định pending + reviewing)
 * @query   page (number) - Trang hiện tại (default: 1)
 * @query   limit (number) - Số reports trên trang (default: 20, max: 100)
 * @query   status (string) - Lọc by status: pending, reviewing, resolved, dismissed
 * @query   targetType (string) - Lọc by type: post, comment
 * @access  Admin only
 */
router.get(
  "/",
  userExtractor,
  requireAdmin,
  contentReportController.handleGetReports,
);

/**
 * @route   POST /api/reports
 * @desc    Tạo report mới (user report post/comment)
 * @body    targetType (string) - post hoặc comment - REQUIRED
 * @body    targetId (string) - ID của post/comment - REQUIRED
 * @body    reason (string) - spam, inappropriate, scam, harassment, other - REQUIRED
 * @body    description (string) - Mô tả chi tiết (max 500 chars) - OPTIONAL
 * @access  User (authenticated)
 */
router.post("/", userExtractor, contentReportController.handleCreateReport);

/**
 * @route   GET /api/reports/:reportId
 * @desc    Lấy report chi tiết
 * @access  Admin only
 */
router.get(
  "/:reportId",
  userExtractor,
  requireAdmin,
  contentReportController.handleGetReportById,
);

/**
 * @route   PUT /api/reports/:reportId/review
 * @desc    Admin review report và thực hiện action
 * @body    status (string) - pending, reviewing, resolved, dismissed - REQUIRED
 * @body    action (string) - remove_content, warn_user, ban_user, no_action - OPTIONAL
 * @body    reviewNote (string) - Ghi chú của admin - OPTIONAL
 * @access  Admin only
 */
router.put(
  "/:reportId/review",
  userExtractor,
  requireAdmin,
  contentReportController.handleReviewReport,
);

/**
 * @route   DELETE /api/reports/:reportId
 * @desc    Xóa report
 * @access  Admin only
 */
router.delete(
  "/:reportId",
  userExtractor,
  requireAdmin,
  contentReportController.handleDeleteReport,
);

module.exports = router;
