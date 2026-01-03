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
  })
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

// Hàm cập nhật status cho các user chưa có trường status

const Order = require("./models/order");
const OrderItem = require("./models/orderItem");
const Ticket = require("./models/ticket");
const Transaction = require("./models/transaction");
const TicketType = require("./models/ticketType");
const User = require("./models/user");
const Event = require("./models/event");
const Show = require("./models/show");
const { cleanupExpiredOrders } = require("./services/orderService");

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

// ✅ TỰ ĐỘNG CẬP NHẬT SHOW STATUS
// Chạy ngay khi server khởi động - Initialize status cho shows chưa có status
initializeShowStatuses()
  .then((result) => {
    console.log("Initial show status initialization completed:", result);
  })
  .catch((error) => {
    console.error("Initial show status initialization failed:", error);
  });

// Chạy lần đầu để cập nhật các show hiện có
updateShowStatuses()
  .then((result) => {
    console.log("Initial show status check completed:", result);
  })
  .catch((error) => {
    console.error("Initial show status check failed:", error);
  });

// Chạy định kỳ mỗi 5 phút
const SHOW_STATUS_CHECK_INTERVAL = 5 * 60 * 1000; // 5 phút

setInterval(async () => {
  try {
    await updateShowStatuses();
  } catch (error) {
    console.error("Scheduled show status check failed:", error);
  }
}, SHOW_STATUS_CHECK_INTERVAL);

console.log(
  `✅ Show status checker started (runs every ${
    SHOW_STATUS_CHECK_INTERVAL / 1000 / 60
  } minutes)`
);

// ✅ TỰ ĐỘNG CANCEL PENDING ORDERS HẾT HẠN
// Chạy ngay khi server khởi động
cleanupExpiredOrders()
  .then(() => {
    console.log("✅ Initial expired orders cleanup completed");
  })
  .catch((error) => {
    console.error("Initial expired orders cleanup failed:", error);
  });

// Chạy định kỳ mỗi 5 phút
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 phút

setInterval(async () => {
  try {
    await cleanupExpiredOrders();
  } catch (error) {
    console.error("Scheduled expired orders cleanup failed:", error);
  }
}, CLEANUP_INTERVAL);

console.log(
  `✅ Expired orders cleanup started (runs every ${
    CLEANUP_INTERVAL / 1000 / 60
  } minutes)`
);

async function addStatusToUsers() {
  try {
    const result = await User.updateMany(
      { status: { $exists: false } }, // Tìm các user chưa có trường status
      { $set: { status: "active" } } // Thêm status = "active"
    );
    console.log("Đã cập nhật status cho:", result.modifiedCount, "user.");
  } catch (error) {
    console.error("Lỗi khi cập nhật status:", error);
  }
}

// Gọi hàm khi khởi động server
// addStatusToUsers();
// ============================================================
// FUNCTION: Update Banner Images
// ============================================================
async function updateBannerImages() {
  const OLD_BANNER_URL =
    "https://res.cloudinary.com/duvdr7fsj/image/upload/v1762881532/ticketbox-clone/tra7t37d4cwci8yloqtt.png";
  const NEW_BANNER_URL =
    "https://res.cloudinary.com/duvdr7fsj/image/upload/v1764922209/ticketbox-clone/tigqmyb0svw90rosthox.jpg";

  try {
    console.log("\n🔄 Starting banner image update...\n");

    // Tìm events có banner URL cũ
    const eventsToUpdate = await Event.find({
      bannerImageUrl: OLD_BANNER_URL,
    });

    console.log(`📌 Found ${eventsToUpdate.length} events to update`);

    if (eventsToUpdate.length === 0) {
      console.log("✨ No events need updating. All done!\n");
      return { updated: 0, message: "No events to update" };
    }

    // Update tất cả events
    const updateResult = await Event.updateMany(
      { bannerImageUrl: OLD_BANNER_URL },
      { $set: { bannerImageUrl: NEW_BANNER_URL } }
    );

    console.log(`✅ Updated ${updateResult.modifiedCount} events`);
    console.log("🎉 Banner image update completed!\n");

    return {
      updated: updateResult.modifiedCount,
      message: "Banner images updated successfully",
    };
  } catch (error) {
    console.error("❌ Error updating banner images:", error);
    throw error;
  }
}

// Uncomment dòng dưới để chạy update khi server start
// updateBannerImages();

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

/**
 * Tạo 50 test users
 * Email: user01@gmail.com -> user50@gmail.com
 * Password: 123456 (hash: $2b$10$GODw9euZFRYBueI.PCk5POnUb.bhyUFbJf7JBIgme8BVefjp3CR9W)
 */
async function createTestUsers() {
  try {
    console.log("\n🔄 Creating test users...\n");

    const passwordHash =
      "$2b$10$GODw9euZFRYBueI.PCk5POnUb.bhyUFbJf7JBIgme8BVefjp3CR9W";

    const firstNames = [
      "Nguyễn",
      "Trần",
      "Lê",
      "Phạm",
      "Hoàng",
      "Phan",
      "Vũ",
      "Võ",
      "Đặng",
      "Bùi",
    ];
    const middleNames = ["Văn", "Thị", "Minh", "Hồng", "Anh", "Thanh"];
    const lastNames = [
      "An",
      "Bình",
      "Cường",
      "Dũng",
      "Hà",
      "Mai",
      "Nam",
      "Phúc",
      "Quân",
      "Tâm",
    ];

    const users = [];

    for (let i = 1; i <= 50; i++) {
      const email = `user${i.toString().padStart(2, "0")}@gmail.com`;

      // Check xem user đã tồn tại chưa
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        console.log(`⚠️  User ${email} already exists, skipping...`);
        continue;
      }

      // Random full name
      const firstName =
        firstNames[Math.floor(Math.random() * firstNames.length)];
      const middleName =
        middleNames[Math.floor(Math.random() * middleNames.length)];
      const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
      const fullName = `${firstName} ${middleName} ${lastName}`;

      // Random phone
      const phone = `09${Math.floor(Math.random() * 100000000)
        .toString()
        .padStart(8, "0")}`;

      users.push({
        email,
        passwordHash,
        fullName,
        phone,
        role: "user",
      });
    }

    if (users.length > 0) {
      await User.insertMany(users);
      console.log(`✅ Created ${users.length} test users`);

      // Log thông tin users
      users.forEach((user, index) => {
        console.log(
          `   ${index + 1}. ${user.email} - ${user.fullName} - ${user.phone}`
        );
      });
    } else {
      console.log("ℹ️  All test users already exist");
    }

    console.log("\n🎉 Test users creation completed!\n");
    console.log("📝 Login info:");
    console.log("   Email: user01@gmail.com -> user50@gmail.com");
    console.log("   Password: 123456\n");

    return {
      success: true,
      created: users.length,
    };
  } catch (error) {
    console.error("\n❌ Error creating test users:", error);
    throw error;
  }
}

// ⚠️ UNCOMMENT ĐỂ TẠO TEST USERS (CHỈ CHẠY MỘT LẦN)
// createTestUsers()
//   .then((result) => {
//     console.log("Test users creation result:", result);
//   })
//   .catch((error) => {
//     console.error("Test users creation failed:", error);
//   });

/**
 * Tạo test orders cho 10 users
 * Mỗi user sẽ có 2-5 orders ngẫu nhiên
 * 80% orders = paid (có transaction + tickets), 20% = pending
 */
async function createTestOrders() {
  const mongoose = require("mongoose");

  try {
    console.log("\n🔄 Creating test orders...\n");

    // 1. Lấy test users
    const testUsers = await User.find({
      email: { $regex: /^user\d{2}@gmail\.com$/ },
    }).lean();

    if (testUsers.length === 0) {
      console.log("❌ No test users found. Run createTestUsers() first!");
      return { success: false, message: "No test users found" };
    }

    console.log(`✅ Found ${testUsers.length} test users`);

    // 2. Lấy tất cả events và shows
    const events = await Event.find({ status: "upcoming" })
      .select("_id name organizer")
      .lean();

    if (events.length === 0) {
      console.log("❌ No published events found in database!");
      return { success: false, message: "No events found" };
    }

    console.log(`✅ Found ${events.length} published events`);

    // 3. Lấy tất cả shows với ticket types và populate event để có startDate
    const shows = await Show.find({
      event: { $in: events.map((e) => e._id) },
    })
      .populate("event", "startDate")
      .select("_id event name showTime")
      .lean();

    if (shows.length === 0) {
      console.log("❌ No shows found in database!");
      return { success: false, message: "No shows found" };
    }

    console.log(`✅ Found ${shows.length} shows\n`);

    // 4. Lấy ticket types cho mỗi show
    const showIds = shows.map((s) => s._id);
    const allTicketTypes = await TicketType.find({
      show: { $in: showIds },
    })
      .select("_id show name price quantityTotal quantitySold")
      .lean();

    // Filter chỉ lấy ticket types còn vé (quantitySold < quantityTotal)
    const ticketTypes = allTicketTypes.filter(
      (tt) => tt.quantitySold < tt.quantityTotal
    );

    if (ticketTypes.length === 0) {
      console.log("❌ No available ticket types found!");
      return { success: false, message: "No ticket types available" };
    }

    console.log(`✅ Found ${ticketTypes.length} available ticket types\n`);

    // Group ticket types by show
    const ticketTypesByShow = {};
    ticketTypes.forEach((tt) => {
      const showId = tt.show.toString();
      if (!ticketTypesByShow[showId]) {
        ticketTypesByShow[showId] = [];
      }
      ticketTypesByShow[showId].push(tt);
    });

    // ✅ Track quantitySold locally để tránh overselling
    const soldCountTracker = {};
    ticketTypes.forEach((tt) => {
      soldCountTracker[tt._id.toString()] = tt.quantitySold;
    });

    let totalOrdersCreated = 0;
    let totalPaidOrders = 0;
    let totalPendingOrders = 0;
    let totalTicketsCreated = 0;

    // 5. Tạo orders cho mỗi user
    for (const user of testUsers) {
      const numOrders = Math.floor(Math.random() * 3) + 2; // 2-5 orders
      console.log(`👤 Creating ${numOrders} orders for ${user.email}...`);

      for (let i = 0; i < numOrders; i++) {
        // Random show
        const randomShow = shows[Math.floor(Math.random() * shows.length)];
        const availableTicketTypes =
          ticketTypesByShow[randomShow._id.toString()];

        if (!availableTicketTypes || availableTicketTypes.length === 0) {
          console.log(
            `   ⚠️  No ticket types for show ${randomShow.name}, skipping...`
          );
          continue;
        }

        // Random 1-3 ticket types
        const numTicketTypes = Math.min(
          Math.floor(Math.random() * 3) + 1,
          availableTicketTypes.length
        );
        const selectedTicketTypes = [];
        const usedIndices = new Set();

        while (selectedTicketTypes.length < numTicketTypes) {
          const idx = Math.floor(Math.random() * availableTicketTypes.length);
          if (!usedIndices.has(idx)) {
            usedIndices.add(idx);
            selectedTicketTypes.push(availableTicketTypes[idx]);
          }
        }

        // Tạo order code đúng format
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        const orderCode = `${timestamp}${random}`;
        const isPaid = Math.random() < 0.8; // 80% paid, 20% pending
        const orderStatus = isPaid ? "paid" : "pending";

        // Tính tổng tiền và tạo order items data
        let totalAmount = 0;
        const orderItemsData = [];

        for (const ticketType of selectedTicketTypes) {
          const quantity = Math.floor(Math.random() * 3) + 1; // 1-3 vé

          // ✅ Dùng soldCountTracker thay vì ticketType.quantitySold từ memory cũ
          const currentSold = soldCountTracker[ticketType._id.toString()];
          const available = ticketType.quantityTotal - currentSold;

          if (available <= 0) {
            console.log(
              `   ⚠️  Ticket type ${ticketType.name} sold out, skipping...`
            );
            continue;
          }

          const actualQuantity = Math.min(quantity, available);
          const itemTotal = ticketType.price * actualQuantity;
          totalAmount += itemTotal;

          orderItemsData.push({
            ticketType: ticketType._id,
            ticketTypeName: ticketType.name,
            quantity: actualQuantity,
            priceAtPurchase: ticketType.price,
          });

          // ⚠️ KHÔNG CẬP NHẬT soldCountTracker Ở ĐÂY
          // Chỉ update khi order = paid (sau khi tạo tickets + update DB)
        }

        if (orderItemsData.length === 0) {
          console.log(`   ⚠️  No valid order items, skipping order...`);
          continue;
        }

        // ✅ Random createdAt trong khoảng 1 tháng trước ngày bắt đầu event
        const eventStartDate = new Date(randomShow.event.startDate);
        const oneMonthBeforeStart = new Date(eventStartDate);
        oneMonthBeforeStart.setDate(oneMonthBeforeStart.getDate() - 30);

        // Random timestamp giữa oneMonthBeforeStart và eventStartDate
        const timeRange =
          eventStartDate.getTime() - oneMonthBeforeStart.getTime();
        const randomTime = Math.floor(Math.random() * timeRange);
        const createdAt = new Date(oneMonthBeforeStart.getTime() + randomTime);

        // Đảm bảo createdAt không vượt quá hiện tại
        const now = new Date();
        if (createdAt > now) {
          createdAt.setTime(
            now.getTime() - Math.floor(Math.random() * 7 * 24 * 60 * 60 * 1000)
          ); // Random trong 7 ngày gần đây
        }

        // Tạo expiresAt: nếu paid thì +30 ngày, nếu pending thì +15 phút từ createdAt
        const expiresAt = isPaid
          ? new Date(createdAt.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 ngày
          : new Date(createdAt.getTime() + 15 * 60 * 1000); // 15 phút

        // Tạo order
        const order = await Order.create({
          orderCode,
          buyer: user._id, // Chỉ cần ObjectId, không phải embedded object
          totalAmount,
          status: orderStatus,
          expiresAt,
          createdAt,
          updatedAt: createdAt,
        });

        // Tạo order items
        const orderItems = await OrderItem.insertMany(
          orderItemsData.map((item) => ({
            order: order._id,
            ticketType: item.ticketType,
            quantity: item.quantity,
            priceAtPurchase: item.priceAtPurchase,
            createdAt,
            updatedAt: createdAt,
          }))
        );

        totalOrdersCreated++;

        // Nếu paid: tạo transaction + tickets
        if (isPaid) {
          // Tạo transaction (giả lập VNPay)
          const transactionCode = `${Date.now()}${Math.floor(
            Math.random() * 1000
          )}`;
          await Transaction.create({
            order: order._id,
            amount: totalAmount,
            paymentMethod: "vnpay",
            transactionCode,
            status: "success",
            createdAt,
            updatedAt: createdAt,
          });

          // Tạo tickets và update quantitySold
          for (const orderItem of orderItems) {
            const tickets = [];
            for (let j = 0; j < orderItem.quantity; j++) {
              const qrCode = `${order.orderCode}-${orderItem.ticketType}-${
                j + 1
              }`;
              tickets.push({
                ticketType: orderItem.ticketType,
                order: order._id,
                owner: user._id,
                qrCode,
                status: "pending", // ✅ Đúng enum: "pending" | "checkedIn" | "out" | "expired" | "cancelled"
                createdAt,
                updatedAt: createdAt,
              });
            }
            await Ticket.insertMany(tickets);
            totalTicketsCreated += tickets.length;

            // Update quantitySold trong DB
            await TicketType.findByIdAndUpdate(orderItem.ticketType, {
              $inc: { quantitySold: orderItem.quantity },
            });

            // ✅ Update soldCountTracker ĐỂ ĐỒNG BỘ với DB (chỉ khi paid)
            soldCountTracker[orderItem.ticketType.toString()] +=
              orderItem.quantity;
          }

          totalPaidOrders++;
          console.log(
            `   ✅ Created PAID order ${orderCode} - ${totalAmount.toLocaleString()}đ - ${orderItemsData.reduce(
              (sum, item) => sum + item.quantity,
              0
            )} tickets`
          );
        } else {
          totalPendingOrders++;
          console.log(
            `   ⏳ Created PENDING order ${orderCode} - ${totalAmount.toLocaleString()}đ`
          );
        }
      }

      console.log("");
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 TEST ORDERS CREATION COMPLETED!");
    console.log("=".repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   • Total Orders: ${totalOrdersCreated}`);
    console.log(
      `   • Paid Orders: ${totalPaidOrders} (with transactions + tickets)`
    );
    console.log(`   • Pending Orders: ${totalPendingOrders}`);
    console.log(`   • Total Tickets Created: ${totalTicketsCreated}`);
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      totalOrders: totalOrdersCreated,
      paidOrders: totalPaidOrders,
      pendingOrders: totalPendingOrders,
      totalTickets: totalTicketsCreated,
    };
  } catch (error) {
    console.error("\n❌ Error creating test orders:", error);
    throw error;
  }
}

// ⚠️ UNCOMMENT ĐỂ TẠO TEST ORDERS (CHỈ CHẠY MỘT LẦN)
// createTestOrders()
//   .then((result) => {
//     console.log("Test orders creation result:", result);
//   })
//   .catch((error) => {
//     console.error("Test orders creation failed:", error);
//   });

/**
 * Sửa orderCode cho các orders có format cũ (bắt đầu bằng "ORD")
 * Chuyển sang format mới: timestamp(base36) + random(4 chars)
 */
async function fixOrderCodes() {
  try {
    console.log("\n🔄 Fixing old orderCode format...\n");

    // Tìm tất cả orders có orderCode bắt đầu bằng "ORD"
    const oldOrders = await Order.find({
      orderCode: { $regex: /^ORD/ },
    });

    if (oldOrders.length === 0) {
      console.log("ℹ️  No orders with old format found");
      return { success: true, updated: 0 };
    }

    console.log(`✅ Found ${oldOrders.length} orders with old format`);

    let updated = 0;
    const usedCodes = new Set();

    for (const order of oldOrders) {
      let newOrderCode;
      let attempts = 0;
      const maxAttempts = 10;

      // Generate unique new orderCode
      do {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        newOrderCode = `${timestamp}${random}`;
        attempts++;

        if (attempts >= maxAttempts) {
          console.error(
            `❌ Could not generate unique code for order ${order._id}`
          );
          break;
        }
      } while (usedCodes.has(newOrderCode));

      if (attempts < maxAttempts) {
        usedCodes.add(newOrderCode);

        // Update order
        await Order.findByIdAndUpdate(order._id, { orderCode: newOrderCode });

        // Update tickets với QR code mới
        const tickets = await Ticket.find({ order: order._id });
        for (const ticket of tickets) {
          // Parse old QR code: {oldOrderCode}-{ticketTypeId}-{index}
          const parts = ticket.qrCode.split("-");
          const index = parts[parts.length - 1]; // Lấy index cuối cùng
          const ticketTypeId = parts[parts.length - 2]; // Lấy ticketTypeId

          const newQrCode = `${newOrderCode}-${ticketTypeId}-${index}`;
          await Ticket.findByIdAndUpdate(ticket._id, { qrCode: newQrCode });
        }

        updated++;
        console.log(
          `   ✅ Updated: ${order.orderCode} → ${newOrderCode} (${tickets.length} tickets)`
        );
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 ORDER CODE FIX COMPLETED!");
    console.log("=".repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   • Total Orders Fixed: ${updated}`);
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      updated,
    };
  } catch (error) {
    console.error("\n❌ Error fixing order codes:", error);
    throw error;
  }
}

// ⚠️ UNCOMMENT ĐỂ FIX ORDER CODES (CHỈ CHẠY MỘT LẦN)
// fixOrderCodes()
//   .then((result) => {
//     console.log("Fix order codes result:", result);
//   })
//   .catch((error) => {
//     console.error("Fix order codes failed:", error);
//   });

/**
 * Migration: Thêm fields tracking cho existing events
 * views, clicks, featured, featuredOrder, featuredUntil
 */
async function addTrackingFieldsToEvents() {
  try {
    console.log("\n🔄 Adding tracking fields to existing events...\n");

    // Update tất cả events chưa có fields này
    const result = await Event.updateMany(
      {
        $or: [
          { views: { $exists: false } },
          { clicks: { $exists: false } },
          { featured: { $exists: false } },
        ],
      },
      {
        $set: {
          views: 0,
          clicks: 0,
          featured: false,
        },
      }
    );

    console.log(`✅ Updated ${result.modifiedCount} events`);
    console.log("\n🎉 Migration completed!\n");

    return {
      success: true,
      updated: result.modifiedCount,
    };
  } catch (error) {
    console.error("\n❌ Error adding tracking fields:", error);
    throw error;
  }
}

// ⚠️ UNCOMMENT ĐỂ CHẠY MIGRATION (CHỈ CHẠY MỘT LẦN)
// addTrackingFieldsToEvents()
//   .then((result) => {
//     console.log("Migration result:", result);
//   })
//   .catch((error) => {
//     console.error("Migration failed:", error);
//   });

/**
 * Validate data integrity: Kiểm tra quantitySold có khớp với số tickets thực tế không
 */
async function validateTicketData() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("🔍 DATA INTEGRITY VALIDATION");
    console.log("=".repeat(70) + "\n");

    // 1. TICKETTYPE vs TICKETS
    console.log("📊 1. TicketType.quantitySold vs Actual Tickets");
    console.log("-".repeat(70));

    const ticketTypes = await TicketType.find({})
      .populate("show")
      .select("_id name show quantityTotal quantitySold")
      .lean();

    const ticketTypeIssues = [];
    let totalTicketTypesChecked = 0;
    let totalTicketTypeIssues = 0;

    for (const ticketType of ticketTypes) {
      totalTicketTypesChecked++;
      const actualTicketCount = await Ticket.countDocuments({
        ticketType: ticketType._id,
      });

      if (actualTicketCount !== ticketType.quantitySold) {
        totalTicketTypeIssues++;
        const issue = {
          ticketTypeId: ticketType._id,
          ticketTypeName: ticketType.name,
          showName: ticketType.show?.name || "Unknown",
          quantityTotal: ticketType.quantityTotal,
          quantitySold: ticketType.quantitySold,
          actualTickets: actualTicketCount,
          difference: actualTicketCount - ticketType.quantitySold,
        };
        ticketTypeIssues.push(issue);

        console.log(
          `❌ ${ticketType.name} | Show: ${ticketType.show?.name || "Unknown"}`
        );
        console.log(
          `   DB: ${ticketType.quantitySold} | Actual: ${actualTicketCount} | Diff: ${issue.difference}`
        );
      }
    }
    console.log(
      `✅ Checked ${totalTicketTypesChecked}, Found ${totalTicketTypeIssues} issues\n`
    );

    // 2. ORDERITEM vs TICKETS (CHỈ PAID ORDERS)
    console.log("📊 2. OrderItem.quantity vs Tickets (Paid Orders Only)");
    console.log("-".repeat(70));

    const paidOrders = await Order.find({ status: "paid" })
      .select("_id orderCode status")
      .lean();
    const orderIssues = [];
    let totalOrdersChecked = 0;
    let totalOrderIssues = 0;

    for (const order of paidOrders) {
      totalOrdersChecked++;

      const orderItems = await OrderItem.find({ order: order._id }).lean();
      const totalOrderItemQuantity = orderItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      const actualTicketsForOrder = await Ticket.countDocuments({
        order: order._id,
      });

      if (totalOrderItemQuantity !== actualTicketsForOrder) {
        totalOrderIssues++;
        const issue = {
          orderId: order._id,
          orderCode: order.orderCode || "N/A",
          orderStatus: order.status,
          orderItemQuantity: totalOrderItemQuantity,
          actualTickets: actualTicketsForOrder,
          difference: actualTicketsForOrder - totalOrderItemQuantity,
        };
        orderIssues.push(issue);

        console.log(`❌ Order ${order.orderCode || order._id}`);
        console.log(
          `   OrderItems: ${totalOrderItemQuantity} | Tickets: ${actualTicketsForOrder} | Diff: ${issue.difference}`
        );
      }
    }
    console.log(
      `✅ Checked ${totalOrdersChecked} paid orders, Found ${totalOrderIssues} issues\n`
    );

    // 3. PENDING ORDERS WITH TICKETS (BUG)
    console.log("📊 3. Pending Orders with Tickets (Should be ZERO)");
    console.log("-".repeat(70));

    const pendingOrders = await Order.find({ status: "pending" })
      .select("_id orderCode")
      .lean();
    let pendingOrdersWithTickets = 0;

    for (const order of pendingOrders) {
      const ticketsCount = await Ticket.countDocuments({ order: order._id });
      if (ticketsCount > 0) {
        pendingOrdersWithTickets++;
        console.log(
          `❌ Pending Order ${
            order.orderCode || order._id
          }: ${ticketsCount} tickets (INVALID!)`
        );
      }
    }
    console.log(
      `✅ Found ${pendingOrdersWithTickets} pending orders with tickets\n`
    );

    // 4. OVERALL SUMMARY
    console.log("📊 4. Overall Summary");
    console.log("-".repeat(70));

    const totalTickets = await Ticket.countDocuments({});
    const totalOrderItems = await OrderItem.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "order",
          foreignField: "_id",
          as: "orderInfo",
        },
      },
      { $unwind: "$orderInfo" },
      { $match: { "orderInfo.status": "paid" } },
      { $group: { _id: null, total: { $sum: "$quantity" } } },
    ]);
    const totalOrderItemQty = totalOrderItems[0]?.total || 0;

    const totalQuantitySold = ticketTypes.reduce(
      (sum, tt) => sum + tt.quantitySold,
      0
    );

    console.log(`Total TicketType.quantitySold: ${totalQuantitySold}`);
    console.log(`Total OrderItem.quantity (paid): ${totalOrderItemQty}`);
    console.log(`Total Tickets: ${totalTickets}`);
    console.log(
      `\n❌ Diff (OrderItems vs Tickets): ${totalOrderItemQty - totalTickets}`
    );
    console.log(
      `❌ Diff (QuantitySold vs Tickets): ${totalQuantitySold - totalTickets}\n`
    );

    // FINAL RESULT
    console.log("=".repeat(70));
    console.log("🎯 VALIDATION RESULT");
    console.log("=".repeat(70));
    console.log(`TicketType Issues: ${totalTicketTypeIssues}`);
    console.log(`Order Issues: ${totalOrderIssues}`);
    console.log(`Pending Orders with Tickets: ${pendingOrdersWithTickets}`);
    console.log(
      `\nTotal Issues: ${
        totalTicketTypeIssues + totalOrderIssues + pendingOrdersWithTickets
      }`
    );

    if (
      totalTicketTypeIssues === 0 &&
      totalOrderIssues === 0 &&
      pendingOrdersWithTickets === 0 &&
      totalTickets === totalOrderItemQty &&
      totalTickets === totalQuantitySold
    ) {
      console.log("\n✅✅✅ ALL DATA IS CONSISTENT! ✅✅✅");
    } else {
      console.log("\n❌❌❌ DATA INCONSISTENCIES FOUND! ❌❌❌");
      console.log("\n🔧 To fix all issues, run: syncAllData()");
    }
    console.log("=".repeat(70) + "\n");

    return {
      success: true,
      ticketTypeIssues: totalTicketTypeIssues,
      orderIssues: totalOrderIssues,
      pendingOrdersWithTickets,
      details: {
        ticketTypes: ticketTypeIssues,
        orders: orderIssues,
      },
      summary: {
        totalQuantitySold,
        totalOrderItemQty,
        totalTickets,
      },
    };
  } catch (error) {
    console.error("\n❌ Error validating ticket data:", error);
    throw error;
  }
}

/**
 * Fix quantitySold: Đồng bộ quantitySold với số tickets thực tế
 */
async function fixQuantitySold() {
  try {
    console.log("\n🔧 Fixing quantitySold mismatches...\n");

    const ticketTypes = await TicketType.find({}).select("_id name").lean();

    let totalFixed = 0;

    for (const ticketType of ticketTypes) {
      // Đếm số tickets thực tế
      const actualTicketCount = await Ticket.countDocuments({
        ticketType: ticketType._id,
      });

      // Update quantitySold = số tickets thực tế
      const result = await TicketType.findByIdAndUpdate(
        ticketType._id,
        { $set: { quantitySold: actualTicketCount } },
        { new: true }
      );

      if (result.quantitySold !== actualTicketCount) {
        console.log(
          `❌ Failed to update ${ticketType.name}: ${result.quantitySold} (expected ${actualTicketCount})`
        );
      } else {
        console.log(
          `✅ Fixed ${ticketType.name}: quantitySold = ${actualTicketCount}`
        );
        totalFixed++;
      }
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎉 FIX COMPLETED!");
    console.log("=".repeat(60));
    console.log(`Total Fixed: ${totalFixed}/${ticketTypes.length}`);
    console.log("=".repeat(60) + "\n");

    return {
      success: true,
      totalFixed,
      total: ticketTypes.length,
    };
  } catch (error) {
    console.error("\n❌ Error fixing quantitySold:", error);
    throw error;
  }
}

// ⚠️ UNCOMMENT ĐỂ VALIDATE DATA
// validateTicketData()
//   .then((result) => {
//     console.log("Validation result:", result);
//   })
//   .catch((error) => {
//     console.error("Validation failed:", error);
//   });

// ⚠️ UNCOMMENT ĐỂ FIX DATA (SAU KHI VALIDATE)
// fixQuantitySold()
//   .then((result) => {
//     console.log("Fix result:", result);
//   })
//   .catch((error) => {
//     console.error("Fix failed:", error);
//   });

/**
 * SYNC ALL DATA - Đồng bộ toàn bộ dữ liệu để đảm bảo consistency
 * Fix tất cả mismatch giữa OrderItems, Tickets, và TicketType.quantitySold
 */
async function syncAllData() {
  try {
    console.log("\n" + "=".repeat(70));
    console.log("🔧 SYNCING ALL DATA - COMPREHENSIVE FIX");
    console.log("=".repeat(70) + "\n");

    // 1. XÓA TICKETS CỦA PENDING ORDERS (KHÔNG NÊN TỒN TẠI)
    console.log("🧹 Step 1: Cleaning up tickets from pending orders...");
    const pendingOrders = await Order.find({ status: "pending" })
      .select("_id orderCode")
      .lean();

    let deletedPendingTickets = 0;
    for (const order of pendingOrders) {
      const result = await Ticket.deleteMany({ order: order._id });
      deletedPendingTickets += result.deletedCount;
      if (result.deletedCount > 0) {
        console.log(
          `   ✅ Deleted ${result.deletedCount} tickets from pending order ${
            order.orderCode || order._id
          }`
        );
      }
    }
    console.log(
      `✅ Total pending order tickets deleted: ${deletedPendingTickets}\n`
    );

    // 2. XÓA TICKETS KHÔNG CÓ ORDER (ORPHANED)
    console.log("🧹 Step 2: Cleaning up orphaned tickets...");
    const allOrderIds = await Order.find({}).distinct("_id");
    const orphanedTickets = await Ticket.deleteMany({
      order: { $nin: allOrderIds },
    });
    console.log(
      `✅ Deleted ${orphanedTickets.deletedCount} orphaned tickets\n`
    );

    // 3. SYNC TICKETTYPE.QUANTITYSOLD = ACTUAL TICKET COUNT
    console.log(
      "🔧 Step 3: Syncing TicketType.quantitySold with actual tickets..."
    );
    const ticketTypes = await TicketType.find({}).select("_id name").lean();

    let totalSynced = 0;
    for (const ticketType of ticketTypes) {
      // Đếm số tickets thực tế
      const actualCount = await Ticket.countDocuments({
        ticketType: ticketType._id,
      });

      // Update quantitySold
      await TicketType.findByIdAndUpdate(ticketType._id, {
        $set: { quantitySold: actualCount },
      });

      console.log(`   ✅ ${ticketType.name}: quantitySold = ${actualCount}`);
      totalSynced++;
    }
    console.log(`✅ Total ticket types synced: ${totalSynced}\n`);

    // 4. KIỂM TRA VÀ TẠO TICKETS BỊ THIẾU CHO PAID ORDERS
    console.log(
      "🔧 Step 4: Checking and creating missing tickets for paid orders..."
    );
    const paidOrders = await Order.find({ status: "paid" })
      .select("_id orderCode buyer")
      .lean();

    let totalTicketsCreated = 0;
    let ordersFixed = 0;

    for (const order of paidOrders) {
      // Lấy order items
      const orderItems = await OrderItem.find({ order: order._id })
        .populate("ticketType")
        .lean();

      // Tổng quantity từ order items
      const expectedTickets = orderItems.reduce(
        (sum, item) => sum + item.quantity,
        0
      );

      // Số tickets hiện có
      const actualTickets = await Ticket.countDocuments({ order: order._id });

      if (expectedTickets !== actualTickets) {
        console.log(
          `   ⚠️ Order ${
            order.orderCode || order._id
          }: Expected ${expectedTickets}, Found ${actualTickets}`
        );

        // Xóa tất cả tickets cũ (để tạo lại đúng)
        await Ticket.deleteMany({ order: order._id });

        // Tạo lại tickets
        const ticketsToCreate = [];
        for (const item of orderItems) {
          for (let i = 0; i < item.quantity; i++) {
            const qrCode = `${order.orderCode || order._id}-${
              item.ticketType._id
            }-${i + 1}`;
            ticketsToCreate.push({
              ticketType: item.ticketType._id,
              order: order._id,
              owner: order.buyer,
              qrCode,
              status: "pending",
              mintStatus: "unminted",
            });
          }
        }

        await Ticket.insertMany(ticketsToCreate);
        totalTicketsCreated += ticketsToCreate.length;
        ordersFixed++;
        console.log(`   ✅ Created ${ticketsToCreate.length} tickets`);
      }
    }
    console.log(
      `✅ Fixed ${ordersFixed} orders, Created ${totalTicketsCreated} tickets\n`
    );

    // 5. RE-SYNC QUANTITYSOLD SAU KHI TẠO TICKETS MỚI
    console.log("🔧 Step 5: Final sync of quantitySold...");
    for (const ticketType of ticketTypes) {
      const actualCount = await Ticket.countDocuments({
        ticketType: ticketType._id,
      });

      await TicketType.findByIdAndUpdate(ticketType._id, {
        $set: { quantitySold: actualCount },
      });
    }
    console.log(`✅ Final sync completed\n`);

    // 6. VALIDATION FINAL
    console.log("🔍 Step 6: Final validation...");
    const totalTickets = await Ticket.countDocuments({});
    const totalOrderItems = await OrderItem.aggregate([
      {
        $lookup: {
          from: "orders",
          localField: "order",
          foreignField: "_id",
          as: "orderInfo",
        },
      },
      { $unwind: "$orderInfo" },
      { $match: { "orderInfo.status": "paid" } },
      { $group: { _id: null, total: { $sum: "$quantity" } } },
    ]);
    const totalOrderItemQty = totalOrderItems[0]?.total || 0;

    const allTicketTypes = await TicketType.find({}).lean();
    const totalQuantitySold = allTicketTypes.reduce(
      (sum, tt) => sum + tt.quantitySold,
      0
    );

    console.log(`\nFinal Numbers:`);
    console.log(`   Total Tickets: ${totalTickets}`);
    console.log(
      `   Total OrderItem.quantity (paid orders): ${totalOrderItemQty}`
    );
    console.log(`   Total TicketType.quantitySold: ${totalQuantitySold}`);

    const isConsistent =
      totalTickets === totalOrderItemQty && totalTickets === totalQuantitySold;

    console.log("\n" + "=".repeat(70));
    if (isConsistent) {
      console.log("✅✅✅ ALL DATA IS NOW CONSISTENT! ✅✅✅");
    } else {
      console.log("⚠️ WARNING: Still have inconsistencies!");
      console.log(
        `Diff (Tickets vs OrderItems): ${totalTickets - totalOrderItemQty}`
      );
      console.log(
        `Diff (Tickets vs QuantitySold): ${totalTickets - totalQuantitySold}`
      );
    }
    console.log("=".repeat(70) + "\n");

    return {
      success: true,
      deletedPendingTickets,
      deletedOrphanedTickets: orphanedTickets.deletedCount,
      ticketTypesSynced: totalSynced,
      ordersFixed,
      ticketsCreated: totalTicketsCreated,
      finalNumbers: {
        totalTickets,
        totalOrderItemQty,
        totalQuantitySold,
        isConsistent,
      },
    };
  } catch (error) {
    console.error("\n❌ Error syncing data:", error);
    throw error;
  }
}

// ⚠️ UNCOMMENT ĐỂ SYNC ALL DATA
// syncAllData()
//   .then((result) => {
//     console.log("Sync result:", result);
//   })
//   .catch((error) => {
//     console.error("Sync failed:", error);
//   });
