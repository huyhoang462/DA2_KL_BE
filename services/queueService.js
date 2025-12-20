const { Queue } = require("bullmq");

// Cấu hình kết nối Redis
const connection = {
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
};

// Khởi tạo hàng đợi MINT
// Lưu ý: Tên 'mint-queue' phải khớp với file config.js trong Repo 3
const mintQueue = new Queue("mint-queue", {
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

module.exports = { addMintJob };
