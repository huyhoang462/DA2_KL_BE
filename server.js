require("dotenv").config();
const express = require("express");
const cors = require("cors");
const initRoutes = require("./routes");
const mongoose = require("mongoose");
const errorHandler = require("./middlewares/errorHandler");
const cookieParser = require("cookie-parser");
const { tokenExtractor } = require("./middlewares/authentication");
const { updateEventStatuses } = require("./services/eventStatusService"); // ✅ IMPORT

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
// const Event = require("./models/event"); // Đường dẫn tới model của bạn

// async function updateToOnePayoutMethod() {
//   try {
//     const result = await Event.updateMany(
//       {},
//       {
//         $set: {
//           payoutMethod: new mongoose.Types.ObjectId("6925dc7bcf1e8bafb1273d74"),
//         },
//       }
//     );
//     console.log("Đã cập nhật xong:", result.modifiedCount, "bản ghi.");
//   } catch (error) {
//     console.error("Lỗi:", error);
//   }
// }

// updateToOnePayoutMethod();

const Order = require("./models/order");
const OrderItem = require("./models/orderItem");
const Ticket = require("./models/ticket");
const Transaction = require("./models/transaction");
const TicketType = require("./models/ticketType");

// Chạy ngay khi server khởi động
updateEventStatuses()
  .then((result) => {
    console.log("Initial event status check completed:", result);
  })
  .catch((error) => {
    console.error("Initial event status check failed:", error);
  });

// Chạy định kỳ mỗi 5 phút
const EVENT_STATUS_CHECK_INTERVAL = 5 * 60 * 1000; // 5 phút

setInterval(async () => {
  try {
    await updateEventStatuses();
  } catch (error) {
    console.error("Scheduled event status check failed:", error);
  }
}, EVENT_STATUS_CHECK_INTERVAL);

console.log(
  `✅ Event status checker started (runs every ${
    EVENT_STATUS_CHECK_INTERVAL / 1000 / 60
  } minutes)`
);

async function resetOrders() {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    console.log("\n🔄 Starting order reset...\n");

    // 1. Xóa tất cả Tickets
    const deletedTickets = await Ticket.deleteMany({}, { session });
    console.log(`✅ Deleted ${deletedTickets.deletedCount} tickets`);

    // 2. Xóa tất cả Transactions
    const deletedTransactions = await Transaction.deleteMany({}, { session });
    console.log(`✅ Deleted ${deletedTransactions.deletedCount} transactions`);

    // 3. Xóa tất cả OrderItems
    const deletedOrderItems = await OrderItem.deleteMany({}, { session });
    console.log(`✅ Deleted ${deletedOrderItems.deletedCount} order items`);

    // 4. Xóa tất cả Orders
    const deletedOrders = await Order.deleteMany({}, { session });
    console.log(`✅ Deleted ${deletedOrders.deletedCount} orders`);

    // 5. Reset quantitySold của tất cả TicketTypes về 0
    const updatedTicketTypes = await TicketType.updateMany(
      {},
      { $set: { quantitySold: 0 } },
      { session }
    );
    console.log(
      `✅ Reset ${updatedTicketTypes.modifiedCount} ticket types (quantitySold = 0)`
    );

    await session.commitTransaction();

    console.log("\n🎉 Order reset completed successfully!\n");

    return {
      success: true,
      deleted: {
        tickets: deletedTickets.deletedCount,
        transactions: deletedTransactions.deletedCount,
        orderItems: deletedOrderItems.deletedCount,
        orders: deletedOrders.deletedCount,
      },
      updated: {
        ticketTypes: updatedTicketTypes.modifiedCount,
      },
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("\n❌ Error resetting orders:", error);
    throw error;
  } finally {
    await session.endSession();
  }
}

// ⚠️ UNCOMMENT ĐỂ CHẠY (CHỈ DÙNG KHI CẦN)

// resetOrders()
//   .then((result) => {
//     console.log("Reset result:", result);
//   })
//   .catch((error) => {
//     console.error("Reset failed:", error);
//   });

/**
 * Thêm trường quantityCheckedIn vào tất cả TicketType hiện có
 * Chạy một lần để migration dữ liệu cũ
 */
async function addQuantityCheckedInField() {
  try {
    console.log("\n🔄 Starting quantityCheckedIn field migration...\n");

    const result = await TicketType.updateMany(
      { quantityCheckedIn: { $exists: false } }, // Chỉ update những document chưa có field này
      { $set: { quantityCheckedIn: 0 } }
    );

    console.log(
      `✅ Added quantityCheckedIn field to ${result.modifiedCount} ticket types`
    );
    console.log("\n🎉 Migration completed successfully!\n");

    return {
      success: true,
      modified: result.modifiedCount,
      matched: result.matchedCount,
    };
  } catch (error) {
    console.error("\n❌ Error adding quantityCheckedIn field:", error);
    throw error;
  }
}

// ⚠️ UNCOMMENT ĐỂ CHẠY MIGRATION (CHỈ CHẠY MỘT LẦN)
// addQuantityCheckedInField()
//   .then((result) => {
//     console.log("Migration result:", result);
//   })
//   .catch((error) => {
//     console.error("Migration failed:", error);
//   });
