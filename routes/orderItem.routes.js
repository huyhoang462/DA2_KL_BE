const router = require("express").Router();
const orderItemController = require("../controllers/orderItem.controller");
const { userExtractor } = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization"); // ← SỬA: import từ authorization

// Lấy order items theo order ID
router.get(
  "/order/:orderId",
  userExtractor,
  orderItemController.handleGetOrderItemsByOrderId
);

// Lấy một order item theo ID
router.get(
  "/:orderItemId",
  userExtractor,
  orderItemController.handleGetOrderItemById
);

// Xóa order item (chỉ admin)
router.delete(
  "/:orderItemId",
  userExtractor,
  requireAdmin,
  orderItemController.handleDeleteOrderItem
);

module.exports = router;
