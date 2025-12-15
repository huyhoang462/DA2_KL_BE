const router = require("express").Router();
const staffPermissionController = require("../controllers/staffPermission.controller");
const {
  tokenExtractor,
  userExtractor,
} = require("../middlewares/authentication");

// ========== ORGANIZER ROUTES ==========

// Phân công staff cho event (chỉ organizer của event)
router.post(
  "/assign",
  userExtractor,

  staffPermissionController.handleAssignStaff
);

// Phân công nhiều staff cùng lúc cho 1 event
router.post(
  "/assign-multiple-staffs",
  userExtractor,

  staffPermissionController.handleAssignMultipleStaff
);

// Phân công 1 staff cho nhiều events cùng lúc
router.post(
  "/assign-multiple-events",
  userExtractor,
  staffPermissionController.handleAssignStaffToMultipleEvents
);

// Gỡ staff khỏi event
router.delete(
  "/remove",
  userExtractor,

  staffPermissionController.handleRemoveStaff
);

// Gỡ nhiều staff khỏi event
router.delete(
  "/remove-multiple-staffs",
  userExtractor,

  staffPermissionController.handleRemoveMultipleStaff
);

// Gỡ staff khỏi nhiều events
router.delete(
  "/remove-multiple-events",
  userExtractor,

  staffPermissionController.handleRemoveStaffFromMultipleEvents
);

// Gỡ tất cả staff khỏi event
router.delete(
  "/event/:eventId/remove-all",
  userExtractor,

  staffPermissionController.handleRemoveAllStaff
);

// Lấy danh sách staff của event (organizer hoặc admin)
router.get(
  "/event/:eventId",
  userExtractor,
  staffPermissionController.handleGetStaffsByEvent
);

// ========== STAFF ROUTES ==========

// Staff xem danh sách events mà mình được phân công
router.get(
  "/my-events",
  userExtractor,
  staffPermissionController.handleGetEventsByStaff
);

// Kiểm tra quyền của staff với event (staff tự kiểm tra)
router.get(
  "/check/:eventId",
  userExtractor,
  staffPermissionController.handleCheckPermission
);

// ========== ADMIN/ORGANIZER ROUTES ==========

// Xem events của staff khác (admin/organizer)
router.get(
  "/staff/:staffId",
  userExtractor,
  staffPermissionController.handleGetEventsByStaff
);

// Kiểm tra quyền của staff khác (admin/organizer)
router.get(
  "/check/:eventId/:staffId",
  userExtractor,
  staffPermissionController.handleCheckPermission
);

module.exports = router;
