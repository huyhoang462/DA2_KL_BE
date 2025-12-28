const Show = require("../models/show");

/**
 * Cập nhật status của các shows dựa trên thời gian hiện tại
 * - pending: chưa tới thời gian bắt đầu (startTime > now)
 * - ongoing: đang diễn ra (startTime <= now && endTime >= now)
 * - completed: đã kết thúc (endTime < now)
 */
async function updateShowStatuses() {
  try {
    const now = new Date();
    let updatedCount = 0;

    // 1. Update shows thành "completed" (đã kết thúc)
    const completedResult = await Show.updateMany(
      {
        endTime: { $lt: now },
        status: { $ne: "completed" },
      },
      {
        $set: { status: "completed" },
      }
    );
    updatedCount += completedResult.modifiedCount;

    // 2. Update shows thành "ongoing" (đang diễn ra)
    const ongoingResult = await Show.updateMany(
      {
        startTime: { $lte: now },
        endTime: { $gte: now },
        status: { $ne: "ongoing" },
      },
      {
        $set: { status: "ongoing" },
      }
    );
    updatedCount += ongoingResult.modifiedCount;

    // 3. Update shows thành "pending" (chưa bắt đầu)
    const pendingResult = await Show.updateMany(
      {
        startTime: { $gt: now },
        status: { $ne: "pending" },
      },
      {
        $set: { status: "pending" },
      }
    );
    updatedCount += pendingResult.modifiedCount;

    if (updatedCount > 0) {
      console.log(`✅ Updated status for ${updatedCount} show(s)`);
    }

    return {
      success: true,
      updated: updatedCount,
      completed: completedResult.modifiedCount,
      ongoing: ongoingResult.modifiedCount,
      pending: pendingResult.modifiedCount,
    };
  } catch (error) {
    console.error("❌ Error updating show statuses:", error);
    throw error;
  }
}

/**
 * Migration: Thêm status cho các shows hiện có trong database
 * Chỉ chạy một lần khi khởi động để set status ban đầu
 */
async function initializeShowStatuses() {
  try {
    console.log("\n🔄 Initializing show statuses...\n");

    const now = new Date();

    // Đếm số shows chưa có status
    const showsWithoutStatus = await Show.countDocuments({
      status: { $exists: false },
    });

    if (showsWithoutStatus === 0) {
      console.log("✨ All shows already have status field\n");
      return { success: true, updated: 0 };
    }

    console.log(`📌 Found ${showsWithoutStatus} shows without status`);

    // Update các shows completed
    const completedResult = await Show.updateMany(
      {
        endTime: { $lt: now },
        status: { $exists: false },
      },
      {
        $set: { status: "completed" },
      }
    );

    // Update các shows ongoing
    const ongoingResult = await Show.updateMany(
      {
        startTime: { $lte: now },
        endTime: { $gte: now },
        status: { $exists: false },
      },
      {
        $set: { status: "ongoing" },
      }
    );

    // Update các shows pending
    const pendingResult = await Show.updateMany(
      {
        startTime: { $gt: now },
        status: { $exists: false },
      },
      {
        $set: { status: "pending" },
      }
    );

    const totalUpdated =
      completedResult.modifiedCount +
      ongoingResult.modifiedCount +
      pendingResult.modifiedCount;

    console.log(`✅ Initialized ${totalUpdated} shows:`);
    console.log(`   • Completed: ${completedResult.modifiedCount}`);
    console.log(`   • Ongoing: ${ongoingResult.modifiedCount}`);
    console.log(`   • Pending: ${pendingResult.modifiedCount}\n`);

    return {
      success: true,
      updated: totalUpdated,
      completed: completedResult.modifiedCount,
      ongoing: ongoingResult.modifiedCount,
      pending: pendingResult.modifiedCount,
    };
  } catch (error) {
    console.error("\n❌ Error initializing show statuses:", error);
    throw error;
  }
}

module.exports = {
  updateShowStatuses,
  initializeShowStatuses,
};
