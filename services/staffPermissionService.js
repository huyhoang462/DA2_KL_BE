const StaffPermission = require("../models/staffPermission");
const User = require("../models/user");
const Event = require("../models/event");
const Show = require("../models/show");
const mongoose = require("mongoose");
const { createPaginationMetadata } = require("../utils/pagination");

/**
 * Phân công staff cho event
 * @param {String} staffId - ID của staff
 * @param {String} eventId - ID của event
 * @param {String} organizerId - ID của organizer (để kiểm tra quyền)
 * @returns {Object} Staff permission đã tạo
 */
const assignStaffToEvent = async (staffId, eventId, organizerId) => {
  if (
    !mongoose.Types.ObjectId.isValid(staffId) ||
    !mongoose.Types.ObjectId.isValid(eventId) ||
    !mongoose.Types.ObjectId.isValid(organizerId)
  ) {
    const error = new Error("Invalid ID format");
    error.status = 400;
    throw error;
  }

  try {
    // Kiểm tra staff có tồn tại và role = 'staff'
    const staff = await User.findById(staffId);
    if (!staff) {
      const error = new Error("Staff not found");
      error.status = 404;
      throw error;
    }

    if (staff.role !== "staff") {
      const error = new Error("User is not a staff member");
      error.status = 400;
      throw error;
    }

    // Kiểm tra event có tồn tại và thuộc organizer
    const event = await Event.findById(eventId);
    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    if (event.creator.toString() !== organizerId) {
      const error = new Error(
        "You don't have permission to assign staff to this event"
      );
      error.status = 403;
      throw error;
    }

    // Kiểm tra xem đã được phân công chưa
    const existingPermission = await StaffPermission.findOne({
      staff: staffId,
      event: eventId,
    });

    if (existingPermission) {
      const error = new Error("Staff already assigned to this event");
      error.status = 409;
      throw error;
    }

    // Tạo permission mới
    const permission = new StaffPermission({
      staff: staffId,
      event: eventId,
    });

    await permission.save();

    // Populate để trả về đầy đủ thông tin
    await permission.populate([
      { path: "staff", select: "fullName email avatar" },
      { path: "event", select: "name startDate endDate location" },
    ]);

    return permission;
  } catch (error) {
    console.error("Error in assignStaffToEvent:", error);
    throw error;
  }
};

/**
 * Phân công nhiều staff cho event cùng lúc
 * @param {Array} staffIds - Mảng IDs của staff
 * @param {String} eventId - ID của event
 * @param {String} organizerId - ID của organizer
 * @returns {Object} Kết quả phân công
 */
const assignMultipleStaff = async (staffIds, eventId, organizerId) => {
  if (
    !Array.isArray(staffIds) ||
    staffIds.length === 0 ||
    !mongoose.Types.ObjectId.isValid(eventId) ||
    !mongoose.Types.ObjectId.isValid(organizerId)
  ) {
    const error = new Error("Invalid input format");
    error.status = 400;
    throw error;
  }

  // Validate tất cả staffIds
  for (const id of staffIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error(`Invalid staff ID: ${id}`);
      error.status = 400;
      throw error;
    }
  }

  try {
    // Kiểm tra event
    const event = await Event.findById(eventId);
    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    if (event.creator.toString() !== organizerId) {
      const error = new Error(
        "You don't have permission to assign staff to this event"
      );
      error.status = 403;
      throw error;
    }

    // Kiểm tra tất cả staff
    const staffs = await User.find({ _id: { $in: staffIds }, role: "staff" });
    if (staffs.length !== staffIds.length) {
      const error = new Error("Some staff IDs are invalid or not staff role");
      error.status = 400;
      throw error;
    }

    // Lấy danh sách đã được phân công
    const existingPermissions = await StaffPermission.find({
      staff: { $in: staffIds },
      event: eventId,
    });

    const existingStaffIds = existingPermissions.map((p) => p.staff.toString());

    // Lọc ra những staff chưa được phân công
    const newStaffIds = staffIds.filter((id) => !existingStaffIds.includes(id));

    if (newStaffIds.length === 0) {
      return {
        success: true,
        message: "All staff already assigned to this event",
        assigned: 0,
        skipped: existingStaffIds.length,
      };
    }

    // Tạo permissions mới
    const permissionsData = newStaffIds.map((staffId) => ({
      staff: staffId,
      event: eventId,
    }));

    const permissions = await StaffPermission.insertMany(permissionsData);

    return {
      success: true,
      message: `Successfully assigned ${permissions.length} staff members`,
      assigned: permissions.length,
      skipped: existingStaffIds.length,
      permissions,
    };
  } catch (error) {
    console.error("Error in assignMultipleStaff:", error);
    throw error;
  }
};

/**
 * Phân công staff cho nhiều events cùng lúc
 * @param {String} staffId - ID của staff
 * @param {Array} eventIds - Mảng IDs của events
 * @param {String} organizerId - ID của organizer
 * @returns {Object} Kết quả phân công
 */
const assignStaffToMultipleEvents = async (staffId, eventIds, organizerId) => {
  if (
    !mongoose.Types.ObjectId.isValid(staffId) ||
    !Array.isArray(eventIds) ||
    eventIds.length === 0 ||
    !mongoose.Types.ObjectId.isValid(organizerId)
  ) {
    const error = new Error("Invalid input format");
    error.status = 400;
    throw error;
  }

  // Validate tất cả eventIds
  for (const id of eventIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error(`Invalid event ID: ${id}`);
      error.status = 400;
      throw error;
    }
  }

  try {
    // Kiểm tra staff có tồn tại và role = 'staff'
    const staff = await User.findById(staffId);
    if (!staff) {
      const error = new Error("Staff not found");
      error.status = 404;
      throw error;
    }

    if (staff.role !== "staff") {
      const error = new Error("User is not a staff member");
      error.status = 400;
      throw error;
    }

    // Kiểm tra tất cả events và chỉ lấy events thuộc organizer
    const events = await Event.find({
      _id: { $in: eventIds },
      creator: organizerId,
    });

    if (events.length === 0) {
      const error = new Error(
        "No valid events found or you don't have permission"
      );
      error.status = 404;
      throw error;
    }

    const validEventIds = events.map((e) => e._id.toString());
    const invalidEventIds = eventIds.filter(
      (id) => !validEventIds.includes(id)
    );

    // Lấy danh sách đã được phân công
    const existingPermissions = await StaffPermission.find({
      staff: staffId,
      event: { $in: validEventIds },
    });

    const existingEventIds = existingPermissions.map((p) => p.event.toString());

    // Lọc ra những events chưa được phân công
    const newEventIds = validEventIds.filter(
      (id) => !existingEventIds.includes(id)
    );

    if (newEventIds.length === 0) {
      return {
        success: true,
        message: "Staff already assigned to all valid events",
        assigned: 0,
        skipped: existingEventIds.length,
        invalid: invalidEventIds.length,
      };
    }

    // Tạo permissions mới
    const permissionsData = newEventIds.map((eventId) => ({
      staff: staffId,
      event: eventId,
    }));

    const permissions = await StaffPermission.insertMany(permissionsData);

    return {
      success: true,
      message: `Successfully assigned staff to ${permissions.length} events`,
      assigned: permissions.length,
      skipped: existingEventIds.length,
      invalid: invalidEventIds.length,
      permissions,
    };
  } catch (error) {
    console.error("Error in assignStaffToMultipleEvents:", error);
    throw error;
  }
};

/**
 * Gỡ staff khỏi event
 * @param {String} staffId - ID của staff
 * @param {String} eventId - ID của event
 * @param {String} organizerId - ID của organizer
 * @returns {Object} Kết quả xóa
 */
const removeStaffFromEvent = async (staffId, eventId, organizerId) => {
  if (
    !mongoose.Types.ObjectId.isValid(staffId) ||
    !mongoose.Types.ObjectId.isValid(eventId) ||
    !mongoose.Types.ObjectId.isValid(organizerId)
  ) {
    const error = new Error("Invalid ID format");
    error.status = 400;
    throw error;
  }

  try {
    // Kiểm tra event thuộc organizer
    const event = await Event.findById(eventId);
    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    if (event.creator.toString() !== organizerId) {
      const error = new Error(
        "You don't have permission to remove staff from this event"
      );
      error.status = 403;
      throw error;
    }

    // Xóa permission
    const result = await StaffPermission.findOneAndDelete({
      staff: staffId,
      event: eventId,
    });

    if (!result) {
      const error = new Error("Staff permission not found");
      error.status = 404;
      throw error;
    }

    return {
      success: true,
      message: "Staff removed from event successfully",
    };
  } catch (error) {
    console.error("Error in removeStaffFromEvent:", error);
    throw error;
  }
};

/**
 * Gỡ nhiều staff khỏi event cùng lúc
 * @param {Array} staffIds - Mảng IDs của staff
 * @param {String} eventId - ID của event
 * @param {String} organizerId - ID của organizer
 * @returns {Object} Kết quả xóa
 */
const removeMultipleStaffFromEvent = async (staffIds, eventId, organizerId) => {
  if (
    !Array.isArray(staffIds) ||
    staffIds.length === 0 ||
    !mongoose.Types.ObjectId.isValid(eventId) ||
    !mongoose.Types.ObjectId.isValid(organizerId)
  ) {
    const error = new Error("Invalid input format");
    error.status = 400;
    throw error;
  }

  // Validate tất cả staffIds
  for (const id of staffIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error(`Invalid staff ID: ${id}`);
      error.status = 400;
      throw error;
    }
  }

  try {
    // Kiểm tra event thuộc organizer
    const event = await Event.findById(eventId);
    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    if (event.creator.toString() !== organizerId) {
      const error = new Error(
        "You don't have permission to remove staff from this event"
      );
      error.status = 403;
      throw error;
    }

    // Xóa permissions
    const result = await StaffPermission.deleteMany({
      staff: { $in: staffIds },
      event: eventId,
    });

    return {
      success: true,
      message: `Removed ${result.deletedCount} staff members from event`,
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    console.error("Error in removeMultipleStaffFromEvent:", error);
    throw error;
  }
};

/**
 * Gỡ staff khỏi nhiều events cùng lúc
 * @param {String} staffId - ID của staff
 * @param {Array} eventIds - Mảng IDs của events
 * @param {String} organizerId - ID của organizer
 * @returns {Object} Kết quả xóa
 */
const removeStaffFromMultipleEvents = async (
  staffId,
  eventIds,
  organizerId
) => {
  if (
    !mongoose.Types.ObjectId.isValid(staffId) ||
    !Array.isArray(eventIds) ||
    eventIds.length === 0 ||
    !mongoose.Types.ObjectId.isValid(organizerId)
  ) {
    const error = new Error("Invalid input format");
    error.status = 400;
    throw error;
  }

  // Validate tất cả eventIds
  for (const id of eventIds) {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error(`Invalid event ID: ${id}`);
      error.status = 400;
      throw error;
    }
  }

  try {
    // Kiểm tra tất cả events thuộc organizer
    const events = await Event.find({
      _id: { $in: eventIds },
      creator: organizerId,
    });

    if (events.length === 0) {
      const error = new Error(
        "No valid events found or you don't have permission"
      );
      error.status = 404;
      throw error;
    }

    const validEventIds = events.map((e) => e._id.toString());
    const invalidEventIds = eventIds.filter(
      (id) => !validEventIds.includes(id)
    );

    // Xóa permissions
    const result = await StaffPermission.deleteMany({
      staff: staffId,
      event: { $in: validEventIds },
    });

    return {
      success: true,
      message: `Removed staff from ${result.deletedCount} events`,
      deletedCount: result.deletedCount,
      invalid: invalidEventIds.length,
    };
  } catch (error) {
    console.error("Error in removeStaffFromMultipleEvents:", error);
    throw error;
  }
};

/**
 * Lấy danh sách staff của 1 event
 * @param {String} eventId - ID của event
 * @returns {Array} Danh sách staff
 */
const getStaffsByEvent = async (eventId) => {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    const error = new Error("Invalid event ID format");
    error.status = 400;
    throw error;
  }

  try {
    const permissions = await StaffPermission.find({ event: eventId })
      .populate({
        path: "staff",
        select: "fullName email avatar phoneNumber",
      })
      .sort({ createdAt: -1 })
      .lean();

    return permissions.map((p) => ({
      permissionId: p._id.toString(),
      staff: p.staff,
      assignedAt: p.createdAt,
    }));
  } catch (error) {
    console.error("Error in getStaffsByEvent:", error);
    throw error;
  }
};

/**
 * Lấy danh sách events mà staff được phân công
 * @param {String} staffId - ID của staff
 * @returns {Array} Mảng eventId
 */
const getEventsByStaff = async (staffId) => {
  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    const error = new Error("Invalid staff ID format");
    error.status = 400;
    throw error;
  }

  try {
    const permissions = await StaffPermission.find({ staff: staffId })
      .select("event")
      .lean();

    return permissions.map((p) => p.event.toString());
  } catch (error) {
    console.error("Error in getEventsByStaff:", error);
    throw error;
  }
};

/**
 * Kiểm tra xem staff có quyền với event không
 * @param {String} staffId - ID của staff
 * @param {String} eventId - ID của event
 * @returns {Boolean} True nếu có quyền
 */
const checkStaffPermission = async (staffId, eventId) => {
  if (
    !mongoose.Types.ObjectId.isValid(staffId) ||
    !mongoose.Types.ObjectId.isValid(eventId)
  ) {
    return false;
  }

  try {
    const permission = await StaffPermission.findOne({
      staff: staffId,
      event: eventId,
    });

    return !!permission;
  } catch (error) {
    console.error("Error in checkStaffPermission:", error);
    return false;
  }
};

/**
 * Gỡ tất cả staff khỏi event (khi xóa event hoặc cleanup)
 * @param {String} eventId - ID của event
 * @param {String} organizerId - ID của organizer
 * @returns {Object} Kết quả xóa
 */
const removeAllStaffFromEvent = async (eventId, organizerId) => {
  if (
    !mongoose.Types.ObjectId.isValid(eventId) ||
    !mongoose.Types.ObjectId.isValid(organizerId)
  ) {
    const error = new Error("Invalid ID format");
    error.status = 400;
    throw error;
  }

  try {
    // Kiểm tra quyền
    const event = await Event.findById(eventId);
    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    if (event.creator.toString() !== organizerId) {
      const error = new Error(
        "You don't have permission to modify staff for this event"
      );
      error.status = 403;
      throw error;
    }

    const result = await StaffPermission.deleteMany({ event: eventId });

    return {
      success: true,
      message: `Removed ${result.deletedCount} staff members from event`,
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    console.error("Error in removeAllStaffFromEvent:", error);
    throw error;
  }
};

module.exports = {
  assignStaffToEvent,
  assignMultipleStaff,
  assignStaffToMultipleEvents,
  removeStaffFromEvent,
  removeMultipleStaffFromEvent,
  removeStaffFromMultipleEvents,
  getStaffsByEvent,
  getEventsByStaff,
  checkStaffPermission,
  removeAllStaffFromEvent,
};
