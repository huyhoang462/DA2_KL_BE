const express = require("express");
const router = express.Router();
const adminTransactionController = require("../controllers/adminTransaction.controller");
const {
  authenticate,
  userExtractor,
} = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization");

// Tất cả routes yêu cầu authentication và admin role
router.use(authenticate, requireAdmin);

/**
 * @route   GET /api/admin/transactions/statistics
 * @desc    Lấy thống kê về giao dịch
 * @access  Admin
 * @query   startDate, endDate
 */
router.get("/statistics", adminTransactionController.getTransactionStatistics);

/**
 * @route   GET /api/admin/transactions
 * @desc    Lấy danh sách tất cả giao dịch
 * @access  Admin
 * @query   status, paymentMethod, searchTerm, startDate, endDate, userId, eventId, page, limit, sortBy, sortOrder
 */
router.get("/", adminTransactionController.getAllTransactions);

/**
 * @route   GET /api/admin/transactions/:id
 * @desc    Lấy chi tiết một giao dịch
 * @access  Admin
 */
router.get("/:id", adminTransactionController.getTransactionById);

/**
 * @route   POST /api/admin/transactions/:id/refund
 * @desc    Hoàn tiền cho một giao dịch
 * @access  Admin
 * @body    { reason: String }
 */
router.post(
  "/:id/refund",
  userExtractor,
  requireAdmin,
  adminTransactionController.refundTransaction
);

module.exports = router;
