const crypto = require("crypto");
const querystring = require("qs");
const moment = require("moment");

// VNPay Configuration
const VNP_TMN_CODE = process.env.VNP_TMN_CODE;
const VNP_HASH_SECRET = process.env.VNP_HASH_SECRET;
const VNP_URL = process.env.VNP_URL;
const VNP_RETURN_URL = process.env.VNP_RETURN_URL;
const VNP_IPN_URL = process.env.VNP_IPN_URL;

const createPaymentUrl = (orderData, ipAddr) => {
  const { orderId, amount, orderInfo } = orderData;
  const createDate = moment().format("YYYYMMDDHHmmss");

  let vnpParams = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: VNP_TMN_CODE,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: "other",
    vnp_Amount: amount * 100,
    vnp_ReturnUrl: VNP_RETURN_URL,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };

  // DEBUG: Log params trước khi sign
  console.log("VNPay Params before signing:", vnpParams);
  console.log("VNP_TMN_CODE:", VNP_TMN_CODE);
  console.log("VNP_HASH_SECRET:", VNP_HASH_SECRET?.substring(0, 10) + "...");

  vnpParams = sortObject(vnpParams);
  const signData = querystring.stringify(vnpParams, { encode: false });

  console.log("Sign Data:", signData);

  const hmac = crypto.createHmac("sha512", VNP_HASH_SECRET);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  vnpParams["vnp_SecureHash"] = signed;

  const finalUrl =
    VNP_URL + "?" + querystring.stringify(vnpParams, { encode: false });

  console.log("Final Payment URL:", finalUrl);

  return finalUrl;
};

const verifyIpnCall = (vnpParams) => {
  const secureHash = vnpParams["vnp_SecureHash"];

  delete vnpParams["vnp_SecureHash"];
  delete vnpParams["vnp_SecureHashType"];

  vnpParams = sortObject(vnpParams);

  const signData = querystring.stringify(vnpParams, { encode: false });

  const hmac = crypto.createHmac("sha512", VNP_HASH_SECRET);
  const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  return {
    isValid: secureHash === signed,
    orderId: vnpParams.vnp_TxnRef,
    responseCode: vnpParams.vnp_ResponseCode,
    transactionId: vnpParams.vnp_TransactionNo,
    amount: vnpParams.vnp_Amount / 100,
    orderInfo: vnpParams.vnp_OrderInfo,
    payDate: vnpParams.vnp_PayDate,
  };
};

function sortObject(obj) {
  const sorted = {};
  const keys = Object.keys(obj).sort();
  keys.forEach((key) => {
    sorted[key] = obj[key];
  });
  return sorted;
}

module.exports = {
  createPaymentUrl,
  verifyIpnCall,
};
