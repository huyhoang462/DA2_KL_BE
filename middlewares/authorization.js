const Event = require("../models/event");
const mongoose = require("mongoose");

// Kiểm tra xem user có phải là người tạo Event không
const checkEventOwnership = async (request, response, next) => {
  const user = request.user;
  const eventId = request.params.id;

  try {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      const error = new Error("Invalid event ID format");
      error.status = 400;
      return next(error);
    }

    const event = await Event.findById(eventId).select("creator");
    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      return next(error);
    }

    const ownerId = event.creator ? event.creator.toString() : null;
    const userId = user._id ? user._id.toString() : null;
    if (!ownerId) {
      const error = new Error("Event has no owner information");
      error.status = 500;
      return next(error);
    }
    if (ownerId === userId) {
      return next();
    }

    const error = new Error(
      "Forbidden: You do not have permission to perform this action"
    );
    error.status = 403;
    return next(error);
  } catch (error) {
    next(error);
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user) {
    const error = new Error("Authentication required");
    error.status = 401;
    return next(error);
  }

  if (req.user.role !== "admin") {
    const error = new Error("Access denied. Admin role required");
    error.status = 403;
    return next(error);
  }

  next();
};

module.exports = {
  checkEventOwnership,
  requireAdmin,
};
