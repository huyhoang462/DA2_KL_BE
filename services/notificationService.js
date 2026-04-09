const mongoose = require("mongoose");
const Notification = require("../models/notification");

const validatePositiveInteger = (value, fieldName) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    const error = new Error(`${fieldName} must be a positive integer`);
    error.status = 400;
    throw error;
  }

  return parsedValue;
};

const mapNotification = (notification) => ({
  id: notification._id.toString(),
  recipient: notification.recipient?.toString?.() || notification.recipient,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  priority: notification.priority,
  channels: notification.channels,
  isRead: notification.isRead,
  readAt: notification.readAt,
  metadata: notification.metadata || {},
  createdBy: notification.createdBy
    ? notification.createdBy.toString?.() || notification.createdBy
    : null,
  createdAt: notification.createdAt,
  updatedAt: notification.updatedAt,
});

const createNotification = async ({
  recipientId,
  type,
  title,
  message,
  metadata = {},
  priority = "medium",
  channels = ["in_app"],
  createdBy = null,
}) => {
  if (!recipientId || !mongoose.Types.ObjectId.isValid(recipientId)) {
    const error = new Error("Invalid recipientId format");
    error.status = 400;
    throw error;
  }

  if (!type || !title || !message) {
    const error = new Error("type, title and message are required");
    error.status = 400;
    throw error;
  }

  const notification = await Notification.create({
    recipient: recipientId,
    type,
    title,
    message,
    metadata,
    priority,
    channels,
    createdBy,
  });

  return mapNotification(notification);
};

const createNotificationSafe = async (payload) => {
  try {
    return await createNotification(payload);
  } catch (error) {
    console.error("[NOTIFICATION] Failed to create notification:", error);
    return null;
  }
};

const getMyNotifications = async ({ userId, page = 1, limit = 20, isRead }) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid userId format");
    error.status = 400;
    throw error;
  }

  const parsedPage = validatePositiveInteger(page, "page");
  const parsedLimit = validatePositiveInteger(limit, "limit");

  if (parsedLimit > 100) {
    const error = new Error("limit must be less than or equal to 100");
    error.status = 400;
    throw error;
  }

  const query = { recipient: userId };
  if (isRead !== undefined) {
    if (isRead === "true" || isRead === true) {
      query.isRead = true;
    } else if (isRead === "false" || isRead === false) {
      query.isRead = false;
    }
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const [notifications, totalItems] = await Promise.all([
    Notification.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit),
    Notification.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalItems / parsedLimit) || 1;

  return {
    message: "Notifications fetched successfully",
    data: notifications.map(mapNotification),
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalItems,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPrevPage: parsedPage > 1,
    },
  };
};

const getUnreadCount = async ({ userId }) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid userId format");
    error.status = 400;
    throw error;
  }

  const unreadCount = await Notification.countDocuments({
    recipient: userId,
    isRead: false,
  });

  return {
    message: "Unread count fetched successfully",
    data: { unreadCount },
  };
};

const markAsRead = async ({ notificationId, userId }) => {
  if (!mongoose.Types.ObjectId.isValid(notificationId)) {
    const error = new Error("Invalid notificationId format");
    error.status = 400;
    throw error;
  }

  const notification = await Notification.findOne({
    _id: notificationId,
    recipient: userId,
  });

  if (!notification) {
    const error = new Error("Notification not found");
    error.status = 404;
    throw error;
  }

  if (!notification.isRead) {
    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();
  }

  return {
    message: "Notification marked as read",
    data: mapNotification(notification),
  };
};

const markAllAsRead = async ({ userId }) => {
  await Notification.updateMany(
    { recipient: userId, isRead: false },
    { $set: { isRead: true, readAt: new Date() } },
  );

  return {
    message: "All notifications marked as read",
  };
};

module.exports = {
  createNotification,
  createNotificationSafe,
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
