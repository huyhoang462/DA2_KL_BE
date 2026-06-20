const Show = require("../models/show");
const TicketType = require("../models/ticketType");
const Ticket = require("../models/ticket");
// const { addExpireJob } = require("./queueService"); // Bỏ vì không dùng expire-queue nữa

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

    // 1. Tìm các show sẽ chuyển sang "completed" (đã kết thúc theo thời gian)
    const showsToComplete = await Show.find({
      endTime: { $lt: now },
      status: { $ne: "completed" },
    })
      .select("_id")
      .lean();

    const showIdsToComplete = showsToComplete.map((s) => s._id);

    // 1b. Update shows thành "completed" (đã kết thúc)
    const completedResult = await Show.updateMany(
      {
        _id: { $in: showIdsToComplete },
      },
      {
        $set: { status: "completed" },
      },
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
      },
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
      },
    );
    updatedCount += pendingResult.modifiedCount;

    // 4. Với các show vừa chuyển sang completed:
    //    - Tìm tất cả TicketType thuộc các show này
    //    - Expire tất cả vé (trừ cancelled/expired) thuộc các show đó
    //    - (Đã bỏ) Không còn bắn job sang Worker qua expire-queue nữa.

    if (showIdsToComplete.length > 0) {
      const ticketTypes = await TicketType.find({
        show: { $in: showIdsToComplete },
      })
        .select("_id show")
        .lean();

      const ticketTypeIdsByShow = new Map();
      for (const tt of ticketTypes) {
        const key = tt.show.toString();
        if (!ticketTypeIdsByShow.has(key)) {
          ticketTypeIdsByShow.set(key, []);
        }
        ticketTypeIdsByShow.get(key).push(tt._id);
      }

      const allTicketTypeIds = ticketTypes.map((tt) => tt._id);

      // Expire tất cả vé thuộc các show vừa completed (trừ cancelled/expired)
      const ticketUpdateResult = await Ticket.updateMany(
        {
          ticketType: { $in: allTicketTypeIds },
          status: { $nin: ["expired", "cancelled"] },
        },
        { $set: { status: "expired" } },
      );

      if ((ticketUpdateResult.modifiedCount || 0) > 0) {
        console.log(
          `✅ Expired ${ticketUpdateResult.modifiedCount || 0} ticket(s) for completed show(s)`,
        );
      }
    }

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
      },
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
      },
    );

    // Update các shows pending
    const pendingResult = await Show.updateMany(
      {
        startTime: { $gt: now },
        status: { $exists: false },
      },
      {
        $set: { status: "pending" },
      },
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
