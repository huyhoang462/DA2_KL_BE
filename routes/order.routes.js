const router = require("express").Router();
const orderController = require("../controllers/order.controller");
const { userExtractor } = require("../middlewares/authentication");

// Tạo order và payment URL
router.post(
  "/create-payment",
  userExtractor,
  orderController.handleCreatePayment
);

// Kiểm tra trạng thái order
router.get("/:orderId/status", orderController.handleGetOrderStatus);

module.exports = router;
