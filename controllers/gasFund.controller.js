const gasFundService = require("../services/gasFundService");

/**
 * Bước 1 + 2 + 3: FE gửi request, BE lọc rác, enqueue job, return jobId
 * POST /api/gas/fund
 */
const requestGasFund = async (req, res) => {
  try {
    console.log("\n=== 🔥 GAS FUND REQUEST ===");
    console.log("Timestamp:", new Date().toISOString());

    const { walletAddress } = req.body;

    if (!walletAddress) {
      console.warn("[GAS FUND] Missing walletAddress in request body");
      return res.status(400).json({
        success: false,
        message: "Missing required field: walletAddress",
      });
    }

    // Validate & enqueue job
    const result = await gasFundService.initiateGasFund(walletAddress);

    // Nếu có lỗi validation
    if (result.status === "duplicate") {
      console.warn("[GAS FUND] Duplicate request detected", {
        walletAddress,
        existingJobId: result.existingJobId,
      });
      return res.status(409).json({
        success: false,
        message: result.message,
        existingJobId: result.existingJobId,
      });
    }

    console.log("[GAS FUND] Job created successfully", {
      jobId: result.jobId,
      walletAddress,
    });

    // Bước 4: Return response với jobId để FE có thể poll
    return res.status(200).json({
      success: true,
      message: result.message,
      jobId: result.jobId,
      status: result.status,
      estimatedTime: "1-5 minutes",
    });
  } catch (error) {
    console.error("[GAS FUND] Error requesting gas fund:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to request gas fund",
    });
  }
};

/**
 * Bước 3: FE polling để check trạng thái job
 * GET /api/gas/fund/status/:jobId
 */
const getGasFundStatus = async (req, res) => {
  try {
    console.log("\n=== 📊 GAS FUND STATUS CHECK ===");
    const { jobId } = req.params;

    if (!jobId) {
      console.warn("[GAS FUND] Missing jobId in request");
      return res.status(400).json({
        success: false,
        message: "Missing required parameter: jobId",
      });
    }

    const statusData = await gasFundService.getGasFundStatus(jobId);

    console.log("[GAS FUND] Status checked", {
      jobId,
      status: statusData.status,
    });

    // Nếu job không tìm thấy hoặc hết hạn
    if (statusData.status === "not_found") {
      return res.status(404).json({
        success: false,
        message: statusData.message,
      });
    }

    return res.status(200).json({
      success: true,
      data: statusData,
    });
  } catch (error) {
    console.error("[GAS FUND] Error getting status:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to get gas fund status",
    });
  }
};

/**
 * Bước 4: Worker callback - báo cáo kết quả
 * POST /api/webhook/gas-callback
 * Body: {jobId, status, txHash?, errorMessage?}
 */
const handleGasFundCallback = async (req, res) => {
  try {
    console.log("\n=== 🔁 GAS FUND CALLBACK ===");
    console.log("Timestamp:", new Date().toISOString());

    const { jobId, status, txHash, errorMessage } = req.body;

    if (!jobId || !status) {
      console.warn("[GAS FUND CALLBACK] Missing required fields", {
        jobId,
        status,
      });
      return res.status(400).json({
        success: false,
        message: "Missing required fields: jobId, status",
      });
    }

    // Validate status
    const normalizedStatus = String(status).toLowerCase();
    if (!["success", "failed"].includes(normalizedStatus)) {
      console.warn("[GAS FUND CALLBACK] Invalid status", { status });
      return res.status(400).json({
        success: false,
        message: "Invalid status. Expected: success or failed",
      });
    }

    // Update job status
    const result = await gasFundService.updateGasFundStatus(
      jobId,
      normalizedStatus,
      txHash,
      errorMessage,
    );

    // Nếu job không tìm thấy
    if (result.status === "not_found") {
      console.warn("[GAS FUND CALLBACK] Job not found", { jobId });
      return res.status(404).json({
        success: false,
        message: result.message,
      });
    }

    console.log("[GAS FUND CALLBACK] Updated successfully", {
      jobId,
      status: normalizedStatus,
      txHash: txHash || "N/A",
    });

    return res.status(200).json({
      success: true,
      message: `Gas fund job ${normalizedStatus}`,
      jobId,
      status: normalizedStatus,
    });
  } catch (error) {
    console.error("[GAS FUND CALLBACK] Error handling callback:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Internal server error",
    });
  }
};

module.exports = {
  requestGasFund,
  getGasFundStatus,
  handleGasFundCallback,
};
