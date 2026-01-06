const express = require("express");
const router = express.Router();
const {
  handleGetAllUsers,
  handleGetUserById,
  handleUpdateUserRole,
  handleBanUser,
  handleUnbanUser,
  handleDeleteUser,
  handleGetUserOrders,
  handleGetUserEvents,
} = require("../controllers/adminUser.controller");
const { userExtractor } = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization");

/**
 * @route   GET /api/admin/users
 * @desc    Lấy danh sách tất cả users với filters và pagination
 * @query   search (string) - Tìm theo tên hoặc email
 * @query   role (string) - Lọc theo role: user, admin, staff
 * @query   status (string) - Lọc theo status: active, banned, suspended
 * @query   sortBy (string) - Sắp xếp theo field (default: createdAt)
 * @query   sortOrder (string) - asc hoặc desc (default: desc)
 * @query   page (number) - Số trang (default: 1)
 * @query   limit (number) - Số lượng per page (default: 20)
 * @access  Admin only
 */
router.get("/", userExtractor, requireAdmin, handleGetAllUsers);

/**
 * @route   GET /api/admin/users/:id
 * @desc    Lấy thông tin chi tiết một user
 * @access  Admin only
 */
router.get("/:id", userExtractor, requireAdmin, handleGetUserById);

/**
 * @route   PATCH /api/admin/users/:id/role
 * @desc    Cập nhật role của user
 * @body    role (string) - Role mới: user, staff, hoặc admin
 * @access  Admin only
 */
router.patch("/:id/role", userExtractor, requireAdmin, handleUpdateUserRole);

/**
 * @route   POST /api/admin/users/:id/ban
 * @desc    Ban user
 * @body    reason (string) - Lý do ban
 * @access  Admin only
 */
router.post("/:id/ban", userExtractor, requireAdmin, handleBanUser);

/**
 * @route   POST /api/admin/users/:id/unban
 * @desc    Unban user
 * @access  Admin only
 */
router.post("/:id/unban", userExtractor, requireAdmin, handleUnbanUser);

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Xóa user (soft delete mặc định, hard delete nếu ?hardDelete=true)
 * @query   hardDelete (boolean) - true nếu muốn xóa hoàn toàn
 * @access  Admin only
 */
router.delete("/:id", userExtractor, requireAdmin, handleDeleteUser);

/**
 * @route   GET /api/admin/users/:id/orders
 * @desc    Lấy danh sách đơn hàng của user với phân trang và thống kê chi tiết
 * @query   page (number) - Số trang (default: 1)
 * @query   limit (number) - Số lượng per page (default: 10)
 * @query   status (string) - Lọc theo status: pending, paid, cancelled, refunded
 * @query   startDate (string) - Lọc từ ngày (ISO format)
 * @query   endDate (string) - Lọc đến ngày (ISO format)
 * @access  Admin only
 */
router.get("/:id/orders", userExtractor, requireAdmin, handleGetUserOrders);

/**
 * @route   GET /api/admin/users/:id/events
 * @desc    Lấy danh sách sự kiện đã tạo bởi user với phân trang và thống kê
 * @query   page (number) - Số trang (default: 1)
 * @query   limit (number) - Số lượng per page (default: 10)
 * @query   status (string) - Lọc theo status: draft, published, ongoing, completed, cancelled
 * @query   startDate (string) - Lọc từ ngày (ISO format)
 * @query   endDate (string) - Lọc đến ngày (ISO format)
 * @access  Admin only
 */
router.get("/:id/events", userExtractor, requireAdmin, handleGetUserEvents);

module.exports = router;
