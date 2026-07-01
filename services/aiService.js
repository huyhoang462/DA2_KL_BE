const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

// Mặc định port 8000 của FastAPI nếu không có trong env
const AI_SERVICE_URL = process.env.AI_SERVICE_URL?.trim() || "http://localhost:8000";

const generateEmbedding = async (text) => {
  try {
    console.log(`[AI_SERVICE] Bắt đầu gọi API embedding tới URL: ${AI_SERVICE_URL}/embedding`);
    console.log(`[AI_SERVICE] Nội dung text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
    
    const response = await axios.post(`${AI_SERVICE_URL}/embedding`, {
      text,
    });
    
    console.log(`[AI_SERVICE] ✅ Thành công! Đã nhận được vector có độ dài: ${response.data.embedding?.length}`);
    return response.data.embedding;
  } catch (error) {
    console.error("❌ [AI_SERVICE] Lỗi khi gọi AI Service để lấy embedding:", error.message);
    // Nếu AI service lỗi, trả về mảng rỗng để không block luồng tạo event
    return [];
  }
};

module.exports = {
  generateEmbedding,
};
