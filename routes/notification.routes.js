const router = require("express").Router();
const notificationController = require("../controllers/notification.controller");
const { userExtractor } = require("../middlewares/authentication");

router.get("/", userExtractor, notificationController.handleGetMyNotifications);
router.get(
  "/unread-count",
  userExtractor,
  notificationController.handleGetUnreadCount,
);
router.patch(
  "/:id/read",
  userExtractor,
  notificationController.handleMarkAsRead,
);
router.patch(
  "/read-all",
  userExtractor,
  notificationController.handleMarkAllAsRead,
);

module.exports = router;
