const { Queue } = require("bullmq");

// Cấu hình kết nối Redis
const connection = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
};

// ------------------------------------------------------
// Queue MINT NFT (mint-queue)
// ------------------------------------------------------
const mintQueueName = process.env.MINT_QUEUE_NAME || "mint-queue";

// Khởi tạo hàng đợi MINT
// Lưu ý: Tên queue phải khớp với file config.js bên Worker
const mintQueue = new Queue(mintQueueName, {
  connection,
  defaultJobOptions: {
    removeOnComplete: true, // Xóa job khi xong để đỡ tốn RAM Redis
    removeOnFail: 5000, // Giữ job lỗi lại để debug
    attempts: 3, // Thử lại 3 lần nếu lỗi
  },
});

/**
 * Hàm bắn yêu cầu Mint sang Worker
 * @param {string} userWallet - Địa chỉ ví người nhận (0x...)
 * @param {number} quantity - Số lượng vé
 * @param {string} orderId - ID đơn hàng (để log)
 */
const addMintJob = async (userWallet, quantity, orderId) => {
  try {
    // Tên Job "mint-job" là đặt cho vui, quan trọng là cục data bên trong
    await mintQueue.add("mint-job", {
      recipient: userWallet,
      quantity: quantity,
      orderId: orderId,
    });
    const counts = await mintQueue.getJobCounts();

    console.log(
      `🚀 [Queue] Đã bắn đơn Mint cho Order #${orderId} -> Ví: ${userWallet} | Tickets: ${quantity}`
    );
    console.log(
      `📥 [Queue] Trạng thái hàng chờ: waiting=${counts.waiting}, active=${
        counts.active
      }, delayed=${counts.delayed || 0}, completed=${counts.completed || 0}`
    );
  } catch (error) {
    console.error(`❌ [Queue] Lỗi gửi job Mint:`, error);
    // Có thể thêm logic lưu vào bảng "FailedJobs" trong DB để retry sau
  }
};

// ------------------------------------------------------
// Queue CHECK-IN (đồng bộ check-in lên Blockchain)
// ------------------------------------------------------
const checkInQueueName = process.env.CHECKIN_QUEUE_NAME || "checkin-queue";

const checkInQueue = new Queue(checkInQueueName, {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: 5000,
    attempts: 3,
  },
});

/**
 * Hàm bắn yêu cầu Check-in sang Worker
 * @param {string|number} ticketId - ID vé/ticket trên Blockchain (tokenId)
 */
const addCheckInJob = async (ticketId) => {
  try {
    await checkInQueue.add("checkin-job", { ticketId });

    const counts = await checkInQueue.getJobCounts();
    console.log(`🚀 [Queue] Đã bắn yêu cầu Check-in cho Ticket #${ticketId}`);
    console.log(
      `📥 [CheckIn Queue] waiting=${counts.waiting}, active=${
        counts.active
      }, delayed=${counts.delayed || 0}, completed=${counts.completed || 0}`
    );
  } catch (error) {
    console.error("❌ [Queue] Lỗi gửi job Check-in:", error);
  }
};

module.exports = { addMintJob, addCheckInJob };
