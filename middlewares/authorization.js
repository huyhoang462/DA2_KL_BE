// middlewares/authorization.js
const Event = require("../models/event");
const mongoose = require("mongoose");

// Middleware để kiểm tra xem user có phải là người tạo Event không
const checkEventOwnership = async (request, response, next) => {
  const user = request.user; // Lấy user đã được xác thực từ middleware trước
  const eventId = request.params.id; // Lấy eventId từ URL

  try {
    // --- Validation cơ bản ---
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      const error = new Error("Invalid event ID format");
      error.status = 400;
      return next(error);
    }

    // --- Tìm tài nguyên (Event) ---
    const event = await Event.findById(eventId);
    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      return next(error);
    }

    // --- KIỂM TRA QUYỀN SỞ HỮU ---
    // So sánh ID của người tạo event với ID của người dùng đang thực hiện request
    if (event.user.toString() !== user._id.toString()) {
      const error = new Error(
        "Forbidden: You do not have permission to perform this action"
      );
      error.status = 403; // 403 Forbidden là mã lỗi chuẩn
      return next(error);
    }

    // Nếu tất cả kiểm tra đều qua, cho phép request đi tiếp
    next();
  } catch (error) {
    // Chuyển các lỗi không mong muốn cho error handler
    next(error);
  }
};

module.exports = {
  checkEventOwnership,
};
