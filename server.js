require("dotenv").config();
const express = require("express");
const cors = require("cors");
const initRoutes = require("./routes");
const mongoose = require("mongoose");
const errorHandler = require("./middlewares/errorHandler");
const cookieParser = require("cookie-parser");
const { tokenExtractor } = require("./middlewares/authentication");
const { updateEventStatuses } = require("./services/eventStatusService"); // ✅ IMPORT
const {
  updateShowStatuses,
  initializeShowStatuses,
} = require("./services/showStatusService"); // ✅ IMPORT SHOW STATUS
const helmet = require("helmet");
const app = express();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to mongodb"))
  .catch((e) => console.log("Error to connect: ", e));
// --- [FIX 1] CẤU HÌNH HELMET (Giải quyết lỗi đỏ Font chữ & Privy) ---
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://*.privy.io"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], // Cho phép Google Fonts
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"], // Cho phép tải Font
        connectSrc: [
          "'self'",
          "http://localhost:*", // Cho phép gọi API local
          "https://auth.privy.io",
          "https://*.privy.io",
          "ws:", // Cho phép WebSocket (Vite HMR)
          "wss:",
        ],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        frameSrc: ["'self'", "https://*.privy.io"], // Cho phép iframe Privy
      },
    },
  }),
);
// --- [FIX 2] CẤU HÌNH CORS (Giải quyết lỗi ERR_NETWORK / 401) ---
app.use(
  cors({
    // Cho phép cả localhost thường và 127.0.0.1 để tránh lỗi khi Vite đổi host
    origin: [
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://shine-ticket.vercel.app",
      process.env.FRONTEND_URL,
    ].filter(Boolean),
    credentials: true, // BẮT BUỘC để nhận Cookies/Token
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  }),
);

app.use(express.json());
app.use(cookieParser());
app.use(tokenExtractor);

initRoutes(app);

// ========================================
// 🗑️ CLEAR ALL DATABASE COLLECTIONS
// ========================================
// ⚠️ WARNING: Chỉ dùng trong development!
// Để reset toàn bộ DB, gọi: GET /api/dev/clear-database
// ========================================
// app.get("/api/dev/clear-database", async (req, res) => {
//   try {
//     const collections = await mongoose.connection.db.collections();

//     console.log("🗑️  Đang xóa tất cả dữ liệu trong database...");

//     for (let collection of collections) {
//       await collection.deleteMany({});
//       console.log(`   ✅ Đã xóa collection: ${collection.collectionName}`);
//     }

//     res.json({
//       success: true,
//       message: "✅ Đã xóa toàn bộ dữ liệu trong database!",
//       collectionsCleared: collections.map((c) => c.collectionName),
//     });
//   } catch (error) {
//     console.error("❌ Lỗi khi xóa database:", error);
//     res.status(500).json({
//       success: false,
//       message: "Lỗi khi xóa database",
//       error: error.message,
//     });
//   }
// });

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Serrver running on port ${PORT}`);
});

app.use(errorHandler);
