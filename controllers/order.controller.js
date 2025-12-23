const {
  createOrder,
  getOrderStatus,
  getOrdersByUserId,
  getOrdersByEventId,
  getOrderDetails,
  cancelOrder,
  resendPaymentLink,
} = require("../services/orderService");
const { vnpayConfig, ProductCode } = require("../config/vnpayConfig");

const handleCreatePayment = async (req, res, next) => {
  try {
    const buyerId = req.user.id;
    const { eventId, showId, items } = req.body;

    // console.log("[CREATE PAYMENT] Request:", {
    //   buyerId,
    //   eventId,
    //   showId,
    //   items,
    // });

    // Tạo order
    const orderResult = await createOrder({ eventId, showId, items }, buyerId);
    //console.log("[CREATE PAYMENT] Order created:", orderResult.orderId);

    // Tạo payment URL với VNPay package
    const ipnUrl =
      process.env.VNP_IPN_URL ||
      `${process.env.SERVER_URL}/api/payment/vnpay-ipn`;

    const returnUrl =
      process.env.VNP_RETURN_URL || "http://localhost:5173/payment/result";

    const paymentUrl = vnpayConfig.buildPaymentUrl({
      vnp_Amount: orderResult.totalAmount, // Số tiền (VNPay tự nhân 100)
      vnp_IpAddr: "127.0.0.1",
      vnp_TxnRef: orderResult.orderId, // Mã đơn hàng
      vnp_OrderInfo: `ThanhToanDonHang${orderResult.orderId}`, // Thông tin đơn hàng
      vnp_OrderType: ProductCode.Other, // Loại đơn hàng
      vnp_ReturnUrl: returnUrl, // URL return sau khi thanh toán
      // vnp_IpnUrl: ipnUrl,
      vnp_Locale: "vn", // Ngôn ngữ (vn hoặc en)
      vnp_BankCode: "NCB",
    });

    // console.log("[CREATE PAYMENT] Payment URL created:", paymentUrl);

    res.status(201).json({
      success: true,
      orderId: orderResult.orderId,
      paymentUrl,
      totalAmount: orderResult.totalAmount,
      expiresAt: orderResult.expiresAt,
      message: "Order created successfully",
    });
  } catch (error) {
    console.error("[CREATE PAYMENT] Error:", error);
    next(error);
  }
};

const handleGetOrderStatus = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const orderStatus = await getOrderStatus(orderId);

    res.status(200).json({
      success: true,
      ...orderStatus,
    });
  } catch (error) {
    next(error);
  }
};

const handleGetMyOrders = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const orders = await getOrdersByUserId(userId);

    res.status(200).json({
      success: true,
      orders,
      total: orders.length,
    });
  } catch (error) {
    console.error("[GET MY ORDERS] Error:", error);
    next(error);
  }
};

/**
 * Lấy danh sách orders của event
 * GET /api/events/:eventId/orders
 */
const handleGetEventOrders = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const queryParams = req.query;

    console.log("[GET EVENT ORDERS] Request:", { eventId, queryParams });

    const result = await getOrdersByEventId(eventId, queryParams);

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("[GET EVENT ORDERS] Error:", error);
    next(error);
  }
};

/**
 * Lấy chi tiết order
 * GET /api/orders/:orderId/details
 */
const handleGetOrderDetails = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    console.log("[GET ORDER DETAILS] Request:", { orderId });

    const orderDetails = await getOrderDetails(orderId);

    res.status(200).json({
      success: true,
      order: orderDetails,
    });
  } catch (error) {
    console.error("[GET ORDER DETAILS] Error:", error);
    next(error);
  }
};

/**
 * Cancel order
 * POST /api/orders/:orderId/cancel
 */
const handleCancelOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    console.log("[CANCEL ORDER] Request:", { orderId });

    const result = await cancelOrder(orderId);

    res.status(200).json(result);
  } catch (error) {
    console.error("[CANCEL ORDER] Error:", error);
    next(error);
  }
};

/**
 * Resend payment link
 * POST /api/orders/:orderId/resend-payment
 */
const handleResendPaymentLink = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    console.log("[RESEND PAYMENT LINK] Request:", { orderId });

    const result = await resendPaymentLink(orderId);

    res.status(200).json(result);
  } catch (error) {
    console.error("[RESEND PAYMENT LINK] Error:", error);
    next(error);
  }
};

module.exports = {
  handleCreatePayment,
  handleGetOrderStatus,
  handleGetMyOrders,
  handleGetEventOrders,
  handleGetOrderDetails,
  handleCancelOrder,
  handleResendPaymentLink,
};
