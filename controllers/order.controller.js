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
    const { eventId, showId, exchangeRateVndPerUsdt, items } = req.body;


    // Tạo order
    const orderResult = await createOrder(
      { eventId, showId, exchangeRateVndPerUsdt, items },
      buyerId,
    );

    // Tạo payment URL với VNPay package
    const ipnUrl =
      process.env.VNP_IPN_URL ||
      `${process.env.SERVER_URL}/api/payment/vnpay-ipn`;

    const returnUrl =
      process.env.VNP_RETURN_URL ||
      "http://localhost:5173/payment/vnpay-return";

    const paymentUrl = vnpayConfig.buildPaymentUrl({
      vnp_Amount:
        orderResult.totalAmount * orderResult.exchangeRateVndPerUsdt , // Số tiền (VNPay tự nhân 100)
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
      totalAmountVnd:
        orderResult.totalAmount * orderResult.exchangeRateVndPerUsdt,
      exchangeRateVndPerUsdt: orderResult.exchangeRateVndPerUsdt,
      expiresAt: orderResult.expiresAt,
      message: "Order created successfully",
    });
  } catch (error) {
    console.error("[CREATE PAYMENT] Error:", error);
    next(error);
  }
};

const handleCreatePaymentMomo = async (req, res, next) => {

//https://developers.momo.vn/#/docs/en/aiov2/?id=payment-method
//parameters
var accessKey = 'F8BBA842ECF85';
var secretKey = 'K951B6PE1waDMi640xX08PD3vg6EkVlz';
var orderInfo = 'pay with MoMo';
var partnerCode = 'MOMO';
var redirectUrl = 'https://webhook.site/b3088a6a-2d17-4f8d-a383-71389a6c600b';
var ipnUrl = 'https://webhook.site/b3088a6a-2d17-4f8d-a383-71389a6c600b';
var requestType = "payWithMethod";
var amount = '50000';
var orderId = partnerCode + new Date().getTime();
var requestId = orderId;
var extraData ='';
var paymentCode = 'T8Qii53fAXyUftPV3m9ysyRhEanUs9KlOPfHgpMR0ON50U10Bh+vZdpJU7VY4z+Z2y77fJHkoDc69scwwzLuW5MzeUKTwPo3ZMaB29imm6YulqnWfTkgzqRaion+EuD7FN9wZ4aXE1+mRt0gHsU193y+yxtRgpmY7SDMU9hCKoQtYyHsfFR5FUAOAKMdw2fzQqpToei3rnaYvZuYaxolprm9+/+WIETnPUDlxCYOiw7vPeaaYQQH0BF0TxyU3zu36ODx980rJvPAgtJzH1gUrlxcSS1HQeQ9ZaVM1eOK/jl8KJm6ijOwErHGbgf/hVymUQG65rHU2MWz9U8QUjvDWA==';
var orderGroupId ='';
var autoCapture =true;
var lang = 'vi';

//before sign HMAC SHA256 with format
//accessKey=$accessKey&amount=$amount&extraData=$extraData&ipnUrl=$ipnUrl&orderId=$orderId&orderInfo=$orderInfo&partnerCode=$partnerCode&redirectUrl=$redirectUrl&requestId=$requestId&requestType=$requestType
var rawSignature = "accessKey=" + accessKey + "&amount=" + amount + "&extraData=" + extraData + "&ipnUrl=" + ipnUrl + "&orderId=" + orderId + "&orderInfo=" + orderInfo + "&partnerCode=" + partnerCode + "&redirectUrl=" + redirectUrl + "&requestId=" + requestId + "&requestType=" + requestType;
//puts raw signature
console.log("--------------------RAW SIGNATURE----------------")
console.log(rawSignature)
//signature
const crypto = require('crypto');
var signature = crypto.createHmac('sha256', secretKey)
    .update(rawSignature)
    .digest('hex');
console.log("--------------------SIGNATURE----------------")
console.log(signature)

//json object send to MoMo endpoint
const requestBody = JSON.stringify({
    partnerCode : partnerCode,
    partnerName : "Test",
    storeId : "MomoTestStore",
    requestId : requestId,
    amount : amount,
    orderId : orderId,
    orderInfo : orderInfo,
    redirectUrl : redirectUrl,
    ipnUrl : ipnUrl,
    lang : lang,
    requestType: requestType,
    autoCapture: autoCapture,
    extraData : extraData,
    orderGroupId: orderGroupId,
    signature : signature
});
//Create the HTTPS objects
const https = require('https');
const options = {
    hostname: 'test-payment.momo.vn',
    port: 443,
    path: '/v2/gateway/api/create',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody)
    }
}
//Send the request and get the response
const req = https.request(options, res => {
    console.log(`Status: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(res.headers)}`);
    res.setEncoding('utf8');
    res.on('data', (body) => {
        console.log('Body: ');
        console.log(body);
        console.log('resultCode: ');
        console.log(JSON.parse(body).resultCode);
    });
    res.on('end', () => {
        console.log('No more data in response.');
    });
})

req.on('error', (e) => {
    console.log(`problem with request: ${e.message}`);
});
// write data to request body
console.log("Sending....")
req.write(requestBody);
req.end();
  
}
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
