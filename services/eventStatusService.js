const Event = require("../models/event");
const Show = require("../models/show");
const mongoose = require("mongoose");

async function updateEventStatuses() {
  try {
    const now = new Date();
    let updatedCount = 0;

    // ==========================================
    // 1. CHUYỂN SANG "CANCELLED" (Quá hạn chuẩn bị)
    // ==========================================
    // Nếu đến ngày startDate mà vẫn đang lẹt đẹt ở pending, approved, hoặc minting
    const cancelResult = await Event.updateMany(
      {
        startDate: { $lte: now },
        status: { $in: ["pending", "approved", "minting"] },
      },
      {
        $set: { status: "cancelled" },
      },
    );
    if (cancelResult.modifiedCount > 0) {
      updatedCount += cancelResult.modifiedCount;
      console.log(
        `🚫 Auto-cancelled ${cancelResult.modifiedCount} unprepared event(s)`,
      );
    }

    // ==========================================
    // 2. CHUYỂN SANG "ONGOING" (Bắt đầu diễn ra)
    // ==========================================
    // Chỉ các sự kiện "upcoming" (đã sẵn sàng) mới được thành "ongoing" khi tới ngày
    const ongoingResult = await Event.updateMany(
      {
        startDate: { $lte: now },
        status: "upcoming",
      },
      {
        $set: { status: "ongoing" },
      },
    );
    updatedCount += ongoingResult.modifiedCount;

    // ==========================================
    // 3. CHUYỂN SANG "COMPLETED" (Đã kết thúc)
    // ==========================================
    // Chỉ tìm các sự kiện đang diễn ra để kiểm tra xem đã xong chưa
    const ongoingEvents = await Event.find({ status: "ongoing" })
      .select("_id endDate")
      .lean();

    if (ongoingEvents.length > 0) {
      const ongoingEventIds = ongoingEvents.map((e) => e._id);

      // Tìm các Event VẪN CÒN Show chưa hoàn thành (tối ưu performance bằng distinct)
      const eventsWithUnfinishedShows = await Show.distinct("event", {
        event: { $in: ongoingEventIds },
        status: { $ne: "completed" },
      });

      // Lọc ra các Event đủ điều kiện completed:
      // Điều kiện 1: Đã hết Show (không nằm trong danh sách unfinished ở trên)
      // Điều kiện 2: Đã qua endDate (để phòng hờ event không có show nào)
      const eventsToComplete = ongoingEvents
        .filter((event) => {
          const hasUnfinishedShows = eventsWithUnfinishedShows.some(
            (unfinishedId) => unfinishedId.toString() === event._id.toString(),
          );
          const isPastEndDate = event.endDate < now;

          return !hasUnfinishedShows && isPastEndDate;
        })
        .map((e) => e._id);

      // Update thành "completed"
      if (eventsToComplete.length > 0) {
        const completedResult = await Event.updateMany(
          { _id: { $in: eventsToComplete } },
          { $set: { status: "completed" } },
        );
        updatedCount += completedResult.modifiedCount;
      }
    }

    if (updatedCount > 0) {
      console.log(`✅ Updated status for ${updatedCount} event(s)`);
    }

    return { success: true, updated: updatedCount };
  } catch (error) {
    console.error("❌ Error updating event statuses:", error);
    throw error;
  }
}
module.exports = {
  updateEventStatuses,
};
