const express = require("express");
const router = express.Router();
const {
  handleGetAllEvents,
  handleGetEventById,
  handleUpdateEventStatus,
  handleSetFeaturedEvent,
  handleDeleteEvent,
  handleGetEventStatistics,
} = require("../controllers/adminEvent.controller");
const { userExtractor } = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization");

/**
 * ============================================================
 * ADMIN EVENT MANAGEMENT API
 * ============================================================
 * Trang quản lý sự kiện duy nhất cho admin, bao gồm:
 * - Xem danh sách tất cả events (filter, search, pagination)
 * - Xem chi tiết event
 * - DUYỆT/TỪ CHỐI events (approve/reject với lý do)
 * - Đánh dấu featured events
 * - Xóa events (soft/hard delete)
 * - Xem thống kê tổng quan
 *
 * NOTE: Trang "Duyệt sự kiện" riêng đã được GỘP vào đây
 * ============================================================
 */

/**
 * @route   GET /api/admin/events/statistics
 * @desc    Lấy thống kê events
 * @access  Admin only
 * NOTE: Phải đặt trước route /:id để không bị conflict
 */
router.get(
  "/statistics",
  userExtractor,
  requireAdmin,
  handleGetEventStatistics
);

/**
 * @route   GET /api/admin/events
 * @desc    Lấy danh sách tất cả events với filters và pagination
 * @query   search (string) - Tìm kiếm theo tên hoặc mô tả
 * @query   status (string) - Lọc theo status: pending, upcoming, ongoing, completed, rejected, cancelled
 * @query   category (string) - Lọc theo category ID
 * @query   format (string) - Lọc theo format: online, offline
 * @query   startDate (string) - Lọc từ ngày (YYYY-MM-DD)
 * @query   endDate (string) - Lọc đến ngày (YYYY-MM-DD)
 * @query   featured (boolean) - Chỉ lấy featured events
 * @query   sortBy (string) - Sắp xếp theo field (default: createdAt)
 * @query   sortOrder (string) - asc hoặc desc (default: desc)
 * @query   page (number) - Số trang (default: 1)
 * @query   limit (number) - Số lượng per page (default: 20)
 * @access  Admin only
 */
router.get("/", userExtractor, requireAdmin, handleGetAllEvents);

/**
 * @route   GET /api/admin/events/:id
 * @desc    Lấy thông tin chi tiết một event
 * @access  Admin only
 */
router.get("/:id", userExtractor, requireAdmin, handleGetEventById);

/**
 * @route   PATCH /api/admin/events/:id/status
 * @desc    DUYỆT/TỪ CHỐI/HUỶ sự kiện (Event Approval)
 * @body    status (string) - Status mới:
 *          - "approved" = Duyệt sự kiện (gửi email thông báo cho organizer)
 *          - "rejected" = Từ chối (BẮT BUỘC có reason)
 *          - "cancelled" = Hủy sự kiện (BẮT BUỘC có reason)
 * @body    reason (string) - Lý do từ chối/hủy (required nếu status = rejected hoặc cancelled)
 * @access  Admin only
 * @note    Đây là nơi admin DUYỆT sự kiện - chức năng chính của trang "Quản lý sự kiện"
 */
router.patch(
  "/:id/status",
  userExtractor,
  requireAdmin,
  handleUpdateEventStatus
);

/**
 * @route   PATCH /api/admin/events/:id/featured
 * @desc    Set/unset featured event
 * @body    featured (boolean) - true để set featured, false để bỏ
 * @body    featuredOrder (number) - Thứ tự hiển thị (1-5)
 * @body    featuredUntil (string) - Ngày hết hạn featured (ISO date)
 * @access  Admin only
 */
router.patch(
  "/:id/featured",
  userExtractor,
  requireAdmin,
  handleSetFeaturedEvent
);

/**
 * @route   DELETE /api/admin/events/:id
 * @desc    Xóa event (soft delete mặc định, hard delete nếu ?hardDelete=true)
 * @query   hardDelete (boolean) - true nếu muốn xóa hoàn toàn
 * @access  Admin only
 */
router.delete("/:id", userExtractor, requireAdmin, handleDeleteEvent);

module.exports = router;
