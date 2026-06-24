const axios = require("axios");
const dotenv = require("dotenv");

dotenv.config();

// Mặc định port 8000 của FastAPI nếu không có trong env
const AI_SERVICE_URL = process.env.AI_SERVICE_URL?.trim() || "http://localhost:8000";

const generateEmbedding = async (text) => {
  try {
    const response = await axios.post(`${AI_SERVICE_URL}/embedding`, {
      text,
    });
    return response.data.embedding;
  } catch (error) {
    console.error("Lỗi khi gọi AI Service để lấy embedding:", error.message);
    // Nếu AI service lỗi, trả về mảng rỗng để không block luồng tạo event
    return [];
  }
};

module.exports = {
  generateEmbedding,
};
