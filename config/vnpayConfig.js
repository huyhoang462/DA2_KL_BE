const { VNPay, ProductCode, VnpLocale } = require("vnpay");

const vnpayConfig = new VNPay({
  tmnCode: process.env.VNP_TMN_CODE || "01PGM8KY",
  secureSecret:
    process.env.VNP_HASH_SECRET || "KP3TFUL26QXCE921W92JQETWEP3G0C7Q",
  vnpayHost:
    process.env.VNP_URL || "https://sandbox.vnpayment.vn/paymentv2/vpcpay.html",
  testMode: true, // true cho sandbox, false cho production
  /**
   * Hash algorithm: SHA256 hoặc SHA512
   * VNPay sandbox thường dùng SHA512
   */
  hashAlgorithm: "SHA512",
});

module.exports = { vnpayConfig, ProductCode, VnpLocale };
