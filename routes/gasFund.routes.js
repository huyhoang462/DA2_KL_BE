const router = require("express").Router();
const gasFundController = require("../controllers/gasFund.controller");

/**
 * Bước 1+2+3: FE gửi request -> BE lọc rác + enqueue job -> return jobId
 * POST /api/gas/fund
 * Body: { walletAddress: "0x..." }
 * Response: { success, message, jobId, status }
 */
router.post("/fund", gasFundController.requestGasFund);

/**
 * Bước 3: FE polling để check status
 * GET /api/gas/fund/status/:jobId
 * Response: { success, data: { jobId, status, walletAddress, txHash?, errorMessage?, ... } }
 */
router.get("/status/:jobId", gasFundController.getGasFundStatus);

module.exports = router;
