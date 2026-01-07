const Show = require("../models/show");
const TicketType = require("../models/ticketType");
const Ticket = require("../models/ticket");
const { addExpireJob } = require("./queueService");

/**
 * Cập nhật status của các shows dựa trên thời gian hiện tại
 * - pending: chưa tới thời gian bắt đầu (startTime > now)
 * - ongoing: đang diễn ra (startTime <= now && endTime >= now)
 * - completed: đã kết thúc (endTime < now)
 */
async function updateShowStatuses() {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    let updatedCount = 0;

    // 1. Tìm các show sẽ chuyển sang "completed" (đã kết thúc theo ngày)
    const showsToComplete = await Show.find({
      endTime: { $lt: today },
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
      }
    );
    updatedCount += completedResult.modifiedCount;

    // 2. Update shows thành "ongoing" (đang diễn ra)
    const ongoingResult = await Show.updateMany(
      {
        // ngày(startTime) <= hôm nay <= ngày(endTime)
        // tương đương startTime < tomorrow && endTime >= today
        startTime: { $lt: tomorrow },
        endTime: { $gte: today },
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
        // ngày(startTime) > hôm nay => startTime >= tomorrow
        startTime: { $gte: tomorrow },
        status: { $ne: "pending" },
      },
      {
        $set: { status: "pending" },
      }
    );
    updatedCount += pendingResult.modifiedCount;

    // 4. Với các show vừa chuyển sang completed:
    //    - Tìm tất cả TicketType thuộc các show này
    //    - Với mỗi show: tìm vé có mintStatus="minted" và status="pending"
    //      -> cập nhật status="expired" và đẩy job sang Worker qua expire-queue

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

      for (const showId of showIdsToComplete) {
        const showKey = showId.toString();
        const ticketTypeIds = ticketTypeIdsByShow.get(showKey);
        if (!ticketTypeIds || ticketTypeIds.length === 0) continue;

        const ticketsToExpire = await Ticket.find({
          ticketType: { $in: ticketTypeIds },
          status: "pending",
          mintStatus: "minted",
        })
          .select("_id tokenId")
          .lean();

        if (!ticketsToExpire.length) continue;

        const ticketObjectIds = ticketsToExpire.map((t) => t._id);
        const tokenIds = ticketsToExpire.map((t) => t.tokenId).filter(Boolean);

        if (ticketObjectIds.length > 0) {
          const ticketUpdateResult = await Ticket.updateMany(
            { _id: { $in: ticketObjectIds } },
            { $set: { status: "expired" } }
          );

          console.log(
            `✅ Expired ${
              ticketUpdateResult.modifiedCount || 0
            } ticket(s) for completed show ${showKey}`
          );
        }

        if (tokenIds.length > 0) {
          await addExpireJob(tokenIds, showKey);
        }
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
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

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
        // endTime < today => ngày(endTime) < ngày hiện tại
        endTime: { $lt: today },
        status: { $exists: false },
      },
      {
        $set: { status: "completed" },
      }
    );

    // Update các shows ongoing
    const ongoingResult = await Show.updateMany(
      {
        // ngày(startTime) <= hôm nay <= ngày(endTime)
        startTime: { $lt: tomorrow },
        endTime: { $gte: today },
        status: { $exists: false },
      },
      {
        $set: { status: "ongoing" },
      }
    );

    // Update các shows pending
    const pendingResult = await Show.updateMany(
      {
        // ngày(startTime) > hôm nay => startTime >= tomorrow
        startTime: { $gte: tomorrow },
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
