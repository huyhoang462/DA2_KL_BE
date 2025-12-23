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

// Lấy chi tiết order
router.get("/:orderId/details", orderController.handleGetOrderDetails);

// Kiểm tra trạng thái order
router.get("/:orderId/status", orderController.handleGetOrderStatus);

// Cancel order
router.post("/:orderId/cancel", orderController.handleCancelOrder);

// Resend payment link
router.post(
  "/:orderId/resend-payment",
  orderController.handleResendPaymentLink
);

module.exports = router;
