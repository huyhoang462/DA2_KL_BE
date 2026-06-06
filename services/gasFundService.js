const { addGasFundJob } = require("./queueService");
const { ethers } = require("ethers");

/**
 * Job status tracking - mỗi job được lưu ở đây
 * Cấu trúc: {
 *   jobId: {
 *     walletAddress: "0x...",
 *     status: "pending" | "processing" | "success" | "failed",
 *     createdAt: timestamp,
 *     updatedAt: timestamp,
 *     txHash: "0x...", (nếu success)
 *     errorMessage: "...", (nếu failed)
 *   }
 * }
 */
const gasFundJobs = new Map();

// TTL cho job status
// - Completed jobs: 5 phút (để user check status, rồi cleanup)
// - Pending jobs: 30 phút (chờ worker xử lý, nếu timeout thì cleanup)
const COMPLETED_JOB_TTL = 5 * 60 * 1000;
const PENDING_JOB_TTL = 30 * 60 * 1000;

/**
 * Clean up expired job statuses
 * - Remove COMPLETED jobs: 5 minutes TTL
 * - Remove PENDING jobs: 30 minutes TTL (nếu worker không xử lý)
 */
const cleanupExpiredJobs = () => {
  const now = Date.now();
  const COMPLETED_JOB_TTL = 5 * 60 * 1000; // 5 phút
  const PENDING_JOB_TTL = 30 * 60 * 1000; // 30 phút

  for (const [jobId, jobData] of gasFundJobs.entries()) {
    const jobAge = now - jobData.createdAt;

    // Remove completed jobs sau 5 phút để tránh lấy RAM
    if (
      ["success", "failed"].includes(jobData.status) &&
      jobAge > COMPLETED_JOB_TTL
    ) {
      gasFundJobs.delete(jobId);
      console.log(
        `[Gas Fund Service] Cleaned up completed job: ${jobId} (${jobData.status})`,
      );
    }
    // Remove pending jobs sau 30 phút (nếu worker không pick up)
    else if (jobData.status === "pending" && jobAge > PENDING_JOB_TTL) {
      gasFundJobs.delete(jobId);
      console.log(
        `[Gas Fund Service] Cleaned up expired pending job: ${jobId}`,
      );
    }
  }
};

/**
 * Validate wallet address (Ethereum format)
 * @param {string} walletAddress - Địa chỉ ví (0x...)
 * @returns {boolean} - True nếu hợp lệ
 */
const validateWalletAddress = (walletAddress) => {
  if (!walletAddress || typeof walletAddress !== "string") {
    return false;
  }
  try {
    return ethers.isAddress(walletAddress);
  } catch {
    return false;
  }
};

/**
 * Khởi tạo request gas fund - lọc rác & enqueue job
 * @param {string} walletAddress - Địa chỉ ví người dùng
 * @returns {Promise<{jobId: string, status: string, message: string}>}
 */
const initiateGasFund = async (walletAddress) => {
  try {
    // Bước 1: Validate wallet address
    if (!validateWalletAddress(walletAddress)) {
      throw new Error(`Invalid wallet address format: ${walletAddress}`);
    }

    // Bước 2: Check xem có job pending nào cho ví này không (chống spam)
    const normalizedAddress = ethers.getAddress(walletAddress); // Normalize address
    const pendingJob = Array.from(gasFundJobs.values()).find(
      (job) =>
        ethers.getAddress(job.walletAddress) === normalizedAddress &&
        job.status === "pending",
    );

    if (pendingJob) {
      // Find jobId for the pending job (gasFundJobs is a Map)
      let existingJobId = null;
      for (const [jobId, job] of gasFundJobs.entries()) {
        if (job === pendingJob) {
          existingJobId = jobId;
          break;
        }
      }

      // If the pending job is older than DUPLICATE_TTL, consider it stale and allow a new job
      const DUPLICATE_TTL = 60 * 1000; // 1 minute
      const jobAge = Date.now() - (pendingJob.createdAt || 0);

      if (jobAge > DUPLICATE_TTL) {
        console.warn(
          `[Gas Fund Service] Stale pending job detected for wallet ${normalizedAddress}, age=${jobAge}ms. Treating as expired and creating a new job.`,
          { existingJobId, jobAge },
        );
        // Remove stale job status so we can enqueue a fresh one
        if (existingJobId) gasFundJobs.delete(existingJobId);
      } else {
        console.warn(
          `[Gas Fund Service] Duplicate PENDING request for wallet ${normalizedAddress}`,
          { existingJobId },
        );

        return {
          jobId: null,
          status: "duplicate",
          message: `Already have a pending gas fund request for this wallet`,
          existingJobId: existingJobId,
        };
      }
    }

    // Bước 2b: Check if any COMPLETED job exists recently (< 30s) to show status
    const recentCompletedJob = Array.from(gasFundJobs.values()).find(
      (job) =>
        ethers.getAddress(job.walletAddress) === normalizedAddress &&
        ["success", "failed"].includes(job.status) &&
        Date.now() - job.updatedAt < 30000, // 30 seconds
    );

    if (recentCompletedJob) {
      console.log(
        `[Gas Fund Service] Found recent completed job for wallet ${normalizedAddress}`,
        { status: recentCompletedJob.status },
      );
    }

    // Bước 3: Enqueue job
    const jobId = await addGasFundJob({
      walletAddress: normalizedAddress,
    });

    // Bước 4: Track job status
    gasFundJobs.set(jobId, {
      walletAddress: normalizedAddress,
      status: "pending",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      txHash: null,
      errorMessage: null,
    });

    console.log(
      `[Gas Fund Service] Created gas fund job ${jobId} for wallet ${normalizedAddress}`,
    );

    return {
      jobId,
      status: "pending",
      message: "Gas fund request queued successfully",
    };
  } catch (error) {
    console.error("[Gas Fund Service] Error initiating gas fund:", error);
    throw error;
  }
};

/**
 * Check trạng thái gas fund job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} - Job status
 */
const getGasFundStatus = async (jobId) => {
  try {
    // Clean up expired jobs mỗi lần check
    cleanupExpiredJobs();

    const jobData = gasFundJobs.get(jobId);

    if (!jobData) {
      return {
        jobId,
        status: "not_found",
        message: "Job not found or has expired",
      };
    }

    return {
      jobId,
      status: jobData.status,
      walletAddress: jobData.walletAddress,
      createdAt: jobData.createdAt,
      updatedAt: jobData.updatedAt,
      txHash: jobData.txHash,
      errorMessage: jobData.errorMessage,
      message: `Gas fund job status: ${jobData.status}`,
    };
  } catch (error) {
    console.error("[Gas Fund Service] Error getting gas fund status:", error);
    throw error;
  }
};

/**
 * Worker gọi lại để báo cáo kết quả (thành công hoặc lỗi)
 * @param {string} jobId - Job ID
 * @param {string} status - "success" hoặc "failed"
 * @param {string} [txHash] - Transaction hash (nếu success)
 * @param {string} [errorMessage] - Error message (nếu failed)
 * @returns {Promise<Object>} - Updated job data
 */
const updateGasFundStatus = async (jobId, status, txHash, errorMessage) => {
  try {
    const normalizedStatus = String(status).toLowerCase();

    if (!["success", "failed"].includes(normalizedStatus)) {
      throw new Error(`Invalid status: ${status}`);
    }

    const jobData = gasFundJobs.get(jobId);

    if (!jobData) {
      console.warn(`[Gas Fund Service] Job not found for callback: ${jobId}`);
      return {
        jobId,
        status: "not_found",
        message: "Job not found",
      };
    }

    // Update job status
    jobData.status = normalizedStatus;
    jobData.updatedAt = Date.now();

    if (normalizedStatus === "success" && txHash) {
      jobData.txHash = txHash;
      console.log(
        `[Gas Fund Service] Gas fund SUCCESS for ${jobData.walletAddress}: txHash=${txHash}`,
      );
    }

    if (normalizedStatus === "failed" && errorMessage) {
      jobData.errorMessage = errorMessage;
      console.log(
        `[Gas Fund Service] Gas fund FAILED for ${jobData.walletAddress}: ${errorMessage}`,
      );
    }

    gasFundJobs.set(jobId, jobData);

    return {
      jobId,
      status: normalizedStatus,
      message: `Gas fund job updated to ${normalizedStatus}`,
      jobData,
    };
  } catch (error) {
    console.error("[Gas Fund Service] Error updating gas fund status:", error);
    throw error;
  }
};

// Clean up expired jobs mỗi 5 phút
setInterval(cleanupExpiredJobs, 5 * 60 * 1000);

module.exports = {
  initiateGasFund,
  getGasFundStatus,
  updateGasFundStatus,
  validateWalletAddress,
};
