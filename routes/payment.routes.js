const router = require("express").Router();
const paymentController = require("../controllers/payment.controller");
const { userExtractor } = require("../middlewares/authentication");
// VNPay IPN (server-to-server callback)
router.get("/vnpay_ipn", paymentController.handleVnpayIpn);

// VNPay Return URL (user redirect sau khi thanh toán) - THÊM MỚI
router.get("/vnpay-return", paymentController.handleVnpayReturn);

router.post(
  "/finalize-order",
  userExtractor,
  paymentController.handleFinalizeOrder
);

module.exports = router;
