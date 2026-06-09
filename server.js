require("dotenv").config();
const express = require("express");
const cors = require("cors");
const initRoutes = require("./routes");
const mongoose = require("mongoose");
const errorHandler = require("./middlewares/errorHandler");
const cookieParser = require("cookie-parser");
const { tokenExtractor } = require("./middlewares/authentication");
const { updateEventStatuses } = require("./services/eventStatusService");
const {
  updateShowStatuses,
  initializeShowStatuses,
} = require("./services/showStatusService");
const helmet = require("helmet");
const { initSocket } = require("./utils/socket");
const http = require("http");

const app = express();

const server = http.createServer(app);
initSocket(server);

mongoose
  .connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log("Connected to mongodb");

    // ========================================
    // ⏱️ BACKGROUND JOBS
    // - Initialize show statuses once
    // - Every 5 minutes: update show statuses & expire ended-show tickets
    // ========================================
    try {
      await initializeShowStatuses();
    } catch (e) {
      console.error("❌ Failed to initialize show statuses:", e);
    }

    const SHOW_STATUS_INTERVAL_MS =
      parseInt(process.env.SHOW_STATUS_INTERVAL_MS || "300000", 10) ||
      5 * 60 * 1000;

    let isShowStatusJobRunning = false;
    const runShowStatusJob = async () => {
      if (isShowStatusJobRunning) return;
      isShowStatusJobRunning = true;
      try {
        await updateShowStatuses();
        await updateEventStatuses();
      } catch (e) {
        console.error("❌ Show status job failed:", e);
      } finally {
        isShowStatusJobRunning = false;
      }
    };

    // Run once shortly after boot, then every interval
    setTimeout(runShowStatusJob, 5_000);
    setInterval(runShowStatusJob, SHOW_STATUS_INTERVAL_MS);
  })
  .catch((e) => console.log("Error to connect: ", e));
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.use(errorHandler);
