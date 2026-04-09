const notificationService = require("../services/notificationService");

const handleGetMyNotifications = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, isRead } = req.query;

    const result = await notificationService.getMyNotifications({
      userId: req.user._id,
      page,
      limit,
      isRead,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleGetUnreadCount = async (req, res, next) => {
  try {
    const result = await notificationService.getUnreadCount({
      userId: req.user._id,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleMarkAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await notificationService.markAsRead({
      notificationId: id,
      userId: req.user._id,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleMarkAllAsRead = async (req, res, next) => {
  try {
    const result = await notificationService.markAllAsRead({
      userId: req.user._id,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleGetMyNotifications,
  handleGetUnreadCount,
  handleMarkAsRead,
  handleMarkAllAsRead,
};
