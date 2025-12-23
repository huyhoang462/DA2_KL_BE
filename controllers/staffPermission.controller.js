const {
  assignStaffToEvent,
  assignMultipleStaff,
  assignStaffToMultipleEvents,
  removeStaffFromEvent,
  removeMultipleStaffFromEvent,
  removeStaffFromMultipleEvents,
  getStaffsByEvent,
  getEventsByStaff,
  getShowsByStaff,
  checkStaffPermission,
  removeAllStaffFromEvent,
} = require("../services/staffPermissionService");

/**
 * Phân công staff cho event
 * POST /api/staff-permissions/assign
 * Body: { staffId, eventId }
 */
const handleAssignStaff = async (req, res, next) => {
  try {
    const organizerId = req.user.id;
    const { staffId, eventId } = req.body;

    if (!staffId || !eventId) {
      const error = new Error("Missing required fields: staffId, eventId");
      error.status = 400;
      throw error;
    }

    const permission = await assignStaffToEvent(staffId, eventId, organizerId);

    res.status(201).json({
      success: true,
      message: "Staff assigned to event successfully",
      permission,
    });
  } catch (error) {
    console.error("[ASSIGN STAFF] Error:", error);
    next(error);
  }
};

/**
 * Phân công nhiều staff cho event
 * POST /api/staff-permissions/assign-multiple
 * Body: { staffIds: [], eventId }
 */
const handleAssignMultipleStaff = async (req, res, next) => {
  try {
    const organizerId = req.user.id;
    const { staffIds, eventId } = req.body;

    if (!staffIds || !Array.isArray(staffIds) || !eventId) {
      const error = new Error(
        "Missing required fields: staffIds (array), eventId"
      );
      error.status = 400;
      throw error;
    }

    const result = await assignMultipleStaff(staffIds, eventId, organizerId);

    res.status(201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[ASSIGN MULTIPLE STAFF] Error:", error);
    next(error);
  }
};

/**
 * Phân công staff cho nhiều events cùng lúc
 * POST /api/staff-permissions/assign-to-multiple-events
 * Body: { staffId, eventIds: [] }
 */
const handleAssignStaffToMultipleEvents = async (req, res, next) => {
  try {
    const organizerId = req.user.id;
    const { staffId, eventIds } = req.body;

    if (!staffId || !eventIds || !Array.isArray(eventIds)) {
      const error = new Error(
        "Missing required fields: staffId, eventIds (array)"
      );
      error.status = 400;
      throw error;
    }

    const result = await assignStaffToMultipleEvents(
      staffId,
      eventIds,
      organizerId
    );

    res.status(201).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[ASSIGN STAFF TO MULTIPLE EVENTS] Error:", error);
    next(error);
  }
};

/**
 * Gỡ staff khỏi event
 * DELETE /api/staff-permissions/remove
 * Body: { staffId, eventId }
 */
const handleRemoveStaff = async (req, res, next) => {
  try {
    const organizerId = req.user.id;
    const { staffId, eventId } = req.body;

    if (!staffId || !eventId) {
      const error = new Error("Missing required fields: staffId, eventId");
      error.status = 400;
      throw error;
    }

    const result = await removeStaffFromEvent(staffId, eventId, organizerId);

    res.status(200).json(result);
  } catch (error) {
    console.error("[REMOVE STAFF] Error:", error);
    next(error);
  }
};

/**
 * Gỡ nhiều staff khỏi event
 * DELETE /api/staff-permissions/remove-multiple
 * Body: { staffIds: [], eventId }
 */
const handleRemoveMultipleStaff = async (req, res, next) => {
  try {
    const organizerId = req.user.id;
    const { staffIds, eventId } = req.body;

    if (!staffIds || !Array.isArray(staffIds) || !eventId) {
      const error = new Error(
        "Missing required fields: staffIds (array), eventId"
      );
      error.status = 400;
      throw error;
    }

    const result = await removeMultipleStaffFromEvent(
      staffIds,
      eventId,
      organizerId
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("[REMOVE MULTIPLE STAFF] Error:", error);
    next(error);
  }
};

/**
 * Gỡ staff khỏi nhiều events
 * DELETE /api/staff-permissions/remove-from-multiple-events
 * Body: { staffId, eventIds: [] }
 */
const handleRemoveStaffFromMultipleEvents = async (req, res, next) => {
  try {
    const organizerId = req.user.id;
    const { staffId, eventIds } = req.body;
    console.log("REMOVE MULTIPLE EVENTS - PARAMS ", staffId);

    if (!staffId || !eventIds || !Array.isArray(eventIds)) {
      const error = new Error(
        "Missing required fields: staffId, eventIds (array)"
      );
      error.status = 400;
      throw error;
    }

    const result = await removeStaffFromMultipleEvents(
      staffId,
      eventIds,
      organizerId
    );

    res.status(200).json(result);
  } catch (error) {
    console.error("[REMOVE STAFF FROM MULTIPLE EVENTS] Error:", error);
    next(error);
  }
};

/**
 * Lấy danh sách staff của event
 * GET /api/staff-permissions/event/:eventId
 */
const handleGetStaffsByEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    const staffs = await getStaffsByEvent(eventId);

    res.status(200).json({
      success: true,
      total: staffs.length,
      staffs,
    });
  } catch (error) {
    console.error("[GET STAFFS BY EVENT] Error:", error);
    next(error);
  }
};

/**
 * Lấy danh sách events mà staff được phân công
 * GET /api/staff-permissions/my-events (cho staff)
 * GET /api/staff-permissions/staff/:staffId (cho organizer/admin)
 */
const handleGetEventsByStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    // Nếu không có staffId trong params, lấy của chính user hiện tại
    const targetStaffId = staffId || currentUserId;

    // Kiểm tra quyền: chỉ staff tự xem của mình hoặc admin/organizer xem của người khác
    if (
      targetStaffId !== currentUserId &&
      currentUserRole !== "admin" &&
      currentUserRole !== "user"
    ) {
      const error = new Error(
        "You don't have permission to view this staff's events"
      );
      error.status = 403;
      throw error;
    }

    const events = await getEventsByStaff(targetStaffId);

    res.status(200).json({
      success: true,
      total: events.length,
      events,
    });
  } catch (error) {
    console.error("[GET EVENTS BY STAFF] Error:", error);
    next(error);
  }
};

/**
 * Kiểm tra quyền của staff với event
 * GET /api/staff-permissions/check/:eventId
 * Hoặc GET /api/staff-permissions/check/:eventId/:staffId (cho admin/organizer)
 */
const handleCheckPermission = async (req, res, next) => {
  try {
    const { eventId, staffId } = req.params;
    const currentUserId = req.user.id;

    // Nếu không có staffId, kiểm tra của chính user hiện tại
    const targetStaffId = staffId || currentUserId;

    const hasPermission = await checkStaffPermission(targetStaffId, eventId);

    res.status(200).json({
      success: true,
      hasPermission,
      staffId: targetStaffId,
      eventId,
    });
  } catch (error) {
    console.error("[CHECK PERMISSION] Error:", error);
    next(error);
  }
};

/**
 * Gỡ tất cả staff khỏi event
 * DELETE /api/staff-permissions/event/:eventId/remove-all
 */
const handleRemoveAllStaff = async (req, res, next) => {
  try {
    const organizerId = req.user.id;
    const { eventId } = req.params;

    const result = await removeAllStaffFromEvent(eventId, organizerId);

    res.status(200).json(result);
  } catch (error) {
    console.error("[REMOVE ALL STAFF] Error:", error);
    next(error);
  }
};

/**
 * Lấy danh sách shows mà staff được phân công (dùng cho App)
 * GET /api/staff-permissions/my-shows (staff tự xem)
 * GET /api/staff-permissions/staff/:staffId/shows (admin/organizer)
 */
const handleGetShowsByStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { page = 1, limit = 6 } = req.query;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    const targetStaffId = staffId || currentUserId;

    if (
      targetStaffId !== currentUserId &&
      currentUserRole !== "admin" &&
      currentUserRole !== "user"
    ) {
      const error = new Error(
        "You don't have permission to view this staff's shows"
      );
      error.status = 403;
      throw error;
    }

    const { shows, pagination } = await getShowsByStaff(
      targetStaffId,
      Number(page) || 1,
      Number(limit) || 6
    );

    res.status(200).json({
      success: true,
      total: pagination.totalItems,
      pagination,
      shows,
    });
  } catch (error) {
    console.error("[GET SHOWS BY STAFF] Error:", error);
    next(error);
  }
};

module.exports = {
  handleAssignStaff,
  handleAssignMultipleStaff,
  handleAssignStaffToMultipleEvents,
  handleRemoveStaff,
  handleRemoveMultipleStaff,
  handleRemoveStaffFromMultipleEvents,
  handleGetStaffsByEvent,
  handleGetEventsByStaff,
  handleCheckPermission,
  handleRemoveAllStaff,
  handleGetShowsByStaff,
};
