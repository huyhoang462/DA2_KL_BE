const Event = require("../models/event");
const mongoose = require("mongoose");

/**
 * Cập nhật status tự động cho tất cả events
 * @returns {Promise<Object>} Kết quả cập nhật
 */
const updateEventStatuses = async () => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    const now = new Date();
    let updated = {
      pendingToCancelled: 0,
      waitingApprovalToCancelled: 0,
      upcomingToOngoing: 0,
      ongoingToCompleted: 0,
    };

    console.log(`\n🔄 [${now.toISOString()}] Checking event statuses...\n`);

    // ✅ 1. PENDING/APPROVED/MINTING → CANCELLED (quá startDate mà chưa mở bán)
    const expiredPendingEvents = await Event.find({
      status: { $in: ["pending", "approved", "minting"] },
      startDate: { $lt: now }, // startDate < now
    }).session(session);

    if (expiredPendingEvents.length > 0) {
      for (const event of expiredPendingEvents) {
        event.status = "cancelled";
        event.cancelReason = "approval_expired";
        event.cancelledAt = now;
        await event.save({ session });
      }
      updated.waitingApprovalToCancelled = expiredPendingEvents.length;
      updated.pendingToCancelled = expiredPendingEvents.length;
      console.log(
        `❌ Cancelled ${updated.waitingApprovalToCancelled} expired pending/approved/minting events`,
      );
    }

    // ✅ 2. UPCOMING → ONGOING (đã đến startDate)
    const upcomingEvents = await Event.find({
      status: "upcoming",
      startDate: { $lte: now }, // startDate <= now
      endDate: { $gt: now }, // endDate > now
    }).session(session);

    if (upcomingEvents.length > 0) {
      for (const event of upcomingEvents) {
        event.status = "ongoing";
        await event.save({ session });
      }
      updated.upcomingToOngoing = upcomingEvents.length;
      console.log(`⏳ Started ${updated.upcomingToOngoing} events (ongoing)`);
    }

    // ✅ 3. ONGOING → COMPLETED (đã qua endDate)
    const ongoingEvents = await Event.find({
      status: "ongoing",
      endDate: { $lte: now }, // endDate <= now
    }).session(session);

    if (ongoingEvents.length > 0) {
      for (const event of ongoingEvents) {
        event.status = "completed";
        await event.save({ session });
      }
      updated.ongoingToCompleted = ongoingEvents.length;
      console.log(`✅ Completed ${updated.ongoingToCompleted} events`);
    }

    await session.commitTransaction();

    const totalUpdated = Object.values(updated).reduce((a, b) => a + b, 0);

    if (totalUpdated === 0) {
      console.log("✨ No events need status update");
    } else {
      console.log(`\n🎉 Updated ${totalUpdated} events total\n`);
    }

    return {
      success: true,
      timestamp: now,
      updated,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("\n❌ Error updating event statuses:", error);
    throw error;
  } finally {
    await session.endSession();
  }
};

module.exports = {
  updateEventStatuses,
};
