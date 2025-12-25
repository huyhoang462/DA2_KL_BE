/**
 * Script để normalize các events đã tồn tại trong database
 * Chạy: node scripts/normalize-existing-events.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const Event = require("../models/event");
const { normalizeSearchText } = require("../utils/searchHelper");

const normalizeExistingEvents = async () => {
  try {
    console.log("=== BẮT ĐẦU NORMALIZE EVENTS ===");
    console.log("Connecting to MongoDB...");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✓ Connected to MongoDB");

    // Lấy tất cả events chưa có normalizedName hoặc normalizedDescription
    const eventsToUpdate = await Event.find({
      $or: [
        { normalizedName: { $exists: false } },
        { normalizedName: null },
        { normalizedName: "" },
        { normalizedDescription: { $exists: false } },
        { normalizedDescription: null },
        { normalizedDescription: "" },
      ],
    });

    console.log(`\nTìm thấy ${eventsToUpdate.length} events cần normalize`);

    if (eventsToUpdate.length === 0) {
      console.log("✓ Tất cả events đã được normalized");
      await mongoose.connection.close();
      return;
    }

    // Update từng event
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < eventsToUpdate.length; i++) {
      const event = eventsToUpdate[i];

      try {
        // Normalize name and description
        event.normalizedName = normalizeSearchText(event.name);
        event.normalizedDescription = normalizeSearchText(event.description);

        // Save (sẽ trigger pre-save middleware nếu cần)
        await event.save();

        successCount++;

        // Log progress
        if ((i + 1) % 10 === 0 || i === eventsToUpdate.length - 1) {
          console.log(
            `Progress: ${i + 1}/${eventsToUpdate.length} (${Math.round(
              ((i + 1) / eventsToUpdate.length) * 100
            )}%)`
          );
        }
      } catch (error) {
        errorCount++;
        console.error(`✗ Error updating event ${event._id}:`, error.message);
      }
    }

    console.log("\n=== KẾT QUẢ ===");
    console.log(`✓ Thành công: ${successCount} events`);
    if (errorCount > 0) {
      console.log(`✗ Lỗi: ${errorCount} events`);
    }

    // Tạo index cho normalized fields (nếu chưa có)
    console.log("\n=== TẠO INDEX ===");
    try {
      await Event.collection.createIndex(
        {
          normalizedName: "text",
          normalizedDescription: "text",
        },
        {
          name: "normalized_search_index",
          weights: {
            normalizedName: 10, // Tên quan trọng hơn
            normalizedDescription: 5,
          },
          default_language: "none", // Không dùng stemming
        }
      );
      console.log("✓ Text index đã được tạo/cập nhật");
    } catch (indexError) {
      console.log("ℹ Text index info:", indexError.message);
    }

    // Close connection
    await mongoose.connection.close();
    console.log("\n✓ Hoàn thành!");
  } catch (error) {
    console.error("\n✗ LỖI:", error);
    process.exit(1);
  }
};

// Run script
normalizeExistingEvents();
