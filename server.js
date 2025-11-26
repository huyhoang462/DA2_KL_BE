require("dotenv").config();
const express = require("express");
const cors = require("cors");
const initRoutes = require("./routes");
const mongoose = require("mongoose");
const errorHandler = require("./middlewares/errorHandler");
const cookieParser = require("cookie-parser");
const { tokenExtractor } = require("./middlewares/authentication");

const app = express();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to mongodb"))
  .catch((e) => console.log("Error to connect: ", e));

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
app.use(tokenExtractor);

initRoutes(app);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Serrver running on port ${PORT}`);
});

app.use(errorHandler);

// const Event = require("./models/event"); // Đường dẫn tới model của bạn

// async function updateAllStatus() {
//   try {
//     const result = await Event.updateMany({}, { $set: { status: "pending" } });
//     console.log("Đã cập nhật xong:", result.modifiedCount, "bản ghi.");
//   } catch (error) {
//     console.error("Lỗi:", error);
//   }
// }

// updateAllStatus();
