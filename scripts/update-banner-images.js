/**
 * Script để update banner images cho events
 * Thay thế URL cũ bằng URL mới
 */

const mongoose = require("mongoose");
require("dotenv").config();

// Import Event model
const Event = require("../models/event");

// URLs
const OLD_BANNER_URL =
  "https://res.cloudinary.com/duvdr7fsj/image/upload/v1762881532/ticketbox-clone/tra7t37d4cwci8yloqtt.png";
const NEW_BANNER_URL =
  "https://res.cloudinary.com/duvdr7fsj/image/upload/v1764922209/ticketbox-clone/tigqmyb0svw90rosthox.jpg";

async function updateBannerImages() {
  try {
    console.log("🚀 Starting banner image update script...");
    console.log("📊 Connecting to database...");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✅ Connected to database successfully");
    console.log("\n📝 Searching for events with old banner URL...");

    // Tìm tất cả events có banner URL cũ
    const eventsToUpdate = await Event.find({
      bannerImageUrl: OLD_BANNER_URL,
    });

    console.log(`\n📌 Found ${eventsToUpdate.length} events to update`);

    if (eventsToUpdate.length === 0) {
      console.log("✨ No events need updating. All done!");
      return;
    }

    // Hiển thị danh sách events sẽ được update
    console.log("\n📋 Events that will be updated:");
    eventsToUpdate.forEach((event, index) => {
      console.log(`   ${index + 1}. ${event.name} (ID: ${event._id})`);
    });

    console.log("\n🔄 Starting update process...");

    // Update tất cả events
    const updateResult = await Event.updateMany(
      { bannerImageUrl: OLD_BANNER_URL },
      { $set: { bannerImageUrl: NEW_BANNER_URL } }
    );

    console.log("\n✅ Update completed successfully!");
    console.log(`   📊 Matched: ${updateResult.matchedCount} events`);
    console.log(`   ✏️  Modified: ${updateResult.modifiedCount} events`);

    // Verify update
    console.log("\n🔍 Verifying update...");
    const remainingOldEvents = await Event.countDocuments({
      bannerImageUrl: OLD_BANNER_URL,
    });
    const newUrlEvents = await Event.countDocuments({
      bannerImageUrl: NEW_BANNER_URL,
    });

    console.log(`   ❌ Events still with old URL: ${remainingOldEvents}`);
    console.log(`   ✅ Events with new URL: ${newUrlEvents}`);

    if (remainingOldEvents === 0) {
      console.log("\n🎉 All events updated successfully!");
    } else {
      console.log("\n⚠️  Warning: Some events still have old URL");
    }
  } catch (error) {
    console.error("\n❌ Error occurred:", error.message);
    console.error(error);
  } finally {
    // Đóng kết nối database
    await mongoose.connection.close();
    console.log("\n🔌 Database connection closed");
    console.log("👋 Script finished\n");
    process.exit(0);
  }
}

// Chạy script
updateBannerImages();
