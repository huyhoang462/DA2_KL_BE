const router = require("express").Router();
const orderController = require("../controllers/order.controller");
const { userExtractor } = require("../middlewares/authentication");

// Tạo order và payment URL
router.post(
  "/create-payment",
  userExtractor,
  orderController.handleCreatePayment
);

// Lấy danh sách orders của user hiện tại
router.get("/my-orders", userExtractor, orderController.handleGetMyOrders);

// Kiểm tra trạng thái order
router.get("/:orderId/status", orderController.handleGetOrderStatus);

module.exports = router;
