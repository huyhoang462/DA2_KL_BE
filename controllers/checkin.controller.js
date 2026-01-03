const { ethers } = require("ethers");
const Ticket = require("../models/ticket");
const TicketType = require("../models/ticketType");
const { addCheckInJob } = require("../services/queueService"); // Import queue check-in

const verifyCheckIn = async (req, res) => {
  try {
    // Nhận cục JSON từ máy quét (QR)
    const { ticketId, showId, walletAddress, timestamp, signature } = req.body;

    console.log("📥 [CHECK-IN] Request received", {
      ticketId,
      showId,
      walletAddress,
      timestamp,
      staffId: req.user?.id,
    });

    // 1. KIỂM TRA TIMESTAMP (Quan trọng nhất để chống chụp màn hình)
    const now = Date.now();
    console.log("⏱️ [CHECK-IN] Validate timestamp", { now, timestamp });
    // Cho phép trễ tối đa 2 phút (120s) phòng trường hợp mạng lag
    if (now - timestamp > 120000) {
      console.warn("⏰ [CHECK-IN] QR expired", { ticketId, timestamp, now });
      return res.status(400).json({
        success: false,
        message: "⛔ Mã QR đã hết hạn! Vui lòng tạo mã mới.",
      });
    }

    // 2. VERIFY CHỮ KÝ (Quan trọng để chống vé giả)
    // Phải tạo lại message y hệt format bên Frontend
    const messageToCheck = `Check-in ticket ${ticketId} at timestamp ${timestamp}`;
    console.log("🧾 [CHECK-IN] Message to verify", { messageToCheck });

    // Chuẩn hóa chữ ký: client có thể gửi dạng string hoặc object { signature: "0x..." }
    const signatureValue =
      typeof signature === "string" ? signature : signature?.signature;

    console.log("✍️ [CHECK-IN] Raw signature payload", { signature });

    if (!signatureValue) {
      console.warn("⚠️ [CHECK-IN] Missing or invalid signature payload", {
        ticketId,
        rawSignature: signature,
      });
      return res.status(400).json({
        success: false,
        message: "⛔ Dữ liệu chữ ký không hợp lệ.",
      });
    }

    // Giải mã chữ ký ra địa chỉ ví
    const recoveredAddress = ethers.verifyMessage(
      messageToCheck,
      signatureValue
    );

    console.log("✅ [CHECK-IN] Recovered address", { recoveredAddress });

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      console.warn("⚠️ [CHECK-IN] Signature address mismatch", {
        ticketId,
        recoveredAddress,
        requestWallet: walletAddress,
      });
      return res.status(400).json({
        success: false,
        message: "⛔ Chữ ký không hợp lệ! Vé giả mạo.",
      });
    }

    // 3. KIỂM TRA TRONG DATABASE
    console.log("🔎 [CHECK-IN] Looking up ticket in DB", { ticketId });

    const ticket = await Ticket.findById(ticketId)
      .populate({
        path: "ticketType",
        populate: {
          path: "show",
          populate: "event",
        },
      })
      .populate({
        path: "owner",
        select: "walletAddress fullName",
      });

    if (!ticket) {
      console.warn("⚠️ [CHECK-IN] Ticket not found", { ticketId });
      return res
        .status(404)
        .json({ success: false, message: "Vé không tồn tại." });
    }

    // Nếu client gửi kèm showId, kiểm tra vé này có thuộc show đó không
    if (
      showId &&
      ticket.ticketType?.show?._id &&
      ticket.ticketType.show._id.toString() !== showId.toString()
    ) {
      console.warn("⚠️ [CHECK-IN] Ticket does not belong to show", {
        ticketId,
        providedShowId: showId,
        ticketShowId: ticket.ticketType.show._id,
      });
      return res.status(400).json({
        success: false,
        message: "⛔ Vé không thuộc show đang được quét.",
      });
    }

    // Kiểm tra chủ sở hữu: ví trong QR phải trùng ví của user sở hữu vé
    const ownerWallet = ticket.owner?.walletAddress;

    if (
      !ownerWallet ||
      ownerWallet.toLowerCase() !== walletAddress.toLowerCase()
    ) {
      console.warn("⚠️ [CHECK-IN] Wallet mismatch", {
        ticketId,
        ownerWallet,
        requestWallet: walletAddress,
      });
      return res.status(400).json({
        success: false,
        message: "⛔ Vé này không thuộc về ví đang quét.",
      });
    }

    // Kiểm tra trạng thái (đã check-in rồi thì không cho check lại)
    if (ticket.status === "checkedIn") {
      console.warn("⚠️ [CHECK-IN] Ticket already checked-in", {
        ticketId,
        checkinAt: ticket.checkinAt,
      });
      return res.status(400).json({
        success: false,
        message: "⛔ Vé này ĐÃ SỬ DỤNG rồi!",
      });
    }

    // 4. THÀNH CÔNG -> UPDATE DB
    console.log("💾 [CHECK-IN] Updating ticket status to checkedIn", {
      ticketId,
    });
    ticket.status = "checkedIn";
    ticket.checkinAt = new Date();
    await ticket.save();
    console.log("✅ [CHECK-IN] Ticket updated in DB", {
      ticketId,
      checkinAt: ticket.checkinAt,
    });

    // Tăng bộ đếm đã check-in cho TicketType (phục vụ thống kê)
    if (ticket.ticketType?._id) {
      await TicketType.findByIdAndUpdate(ticket.ticketType._id, {
        $inc: { quantityCheckedIn: 1 },
      });
      console.log("📊 [CHECK-IN] Increased quantityCheckedIn for ticketType", {
        ticketTypeId: ticket.ticketType._id,
      });
    }

    // Bắn Job sang Worker để sync check-in lên Blockchain
    // Sử dụng tokenId (ID vé trên Blockchain) nếu đã được mint
    if (ticket.tokenId) {
      try {
        console.log("📤 [CHECK-IN] Enqueue check-in job to worker", {
          tokenId: ticket.tokenId,
        });
        await addCheckInJob(ticket.tokenId);
        console.log("✅ [CHECK-IN] Check-in job enqueued", {
          tokenId: ticket.tokenId,
        });
      } catch (queueError) {
        console.error(
          "❌ Lỗi đẩy Job Check-in (đã check-in DB nhưng chưa sync Blockchain):",
          queueError
        );
      }
    } else {
      console.warn(
        `⚠️ Bỏ qua sync Blockchain cho ticket ${ticket._id}: chưa có tokenId (chưa mint).`
      );
    }

    console.log("🎉 [CHECK-IN] Success response sent", {
      ticketId: ticket.id,
      ownerName: ticket.owner?.fullName,
    });

    return res.status(200).json({
      success: true,
      message: "✅ CHECK-IN THÀNH CÔNG!",
      data: {
        ticketId: ticket.id,
        qrCode: ticket.qrCode,
        ownerName: ticket.owner?.fullName,
        ownerWallet: ticket.owner?.walletAddress,
        eventName: ticket.ticketType?.show?.event?.name,
        showName: ticket.ticketType?.show?.name,
        ticketTypeName: ticket.ticketType?.name,
        status: ticket.status,
        checkinAt: ticket.checkinAt,
      },
    });
  } catch (error) {
    console.error("❌ [CHECK-IN] Unhandled error", {
      error,
      body: req.body,
      staffId: req.user?.id,
    });
    return res.status(500).json({ success: false, message: "Lỗi Server" });
  }
};

module.exports = { verifyCheckIn };
