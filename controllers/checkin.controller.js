const { ethers } = require("ethers");
const Ticket = require("../models/ticket");
const TicketType = require("../models/ticketType");
// const { addCheckInJob } = require('../services/queueService'); // Import sau khi làm worker

const verifyCheckIn = async (req, res) => {
  try {
    // Nhận cục JSON từ máy quét (QR)
    const { ticketId, walletAddress, timestamp, signature } = req.body;

    console.log("🔍 Đang verify vé:", ticketId);

    // 1. KIỂM TRA TIMESTAMP (Quan trọng nhất để chống chụp màn hình)
    const now = Date.now();
    // Cho phép trễ tối đa 2 phút (120s) phòng trường hợp mạng lag
    if (now - timestamp > 120000) {
      return res.status(400).json({
        success: false,
        message: "⛔ Mã QR đã hết hạn! Vui lòng tạo mã mới.",
      });
    }

    // 2. VERIFY CHỮ KÝ (Quan trọng để chống vé giả)
    // Phải tạo lại message y hệt format bên Frontend
    const messageToCheck = `Check-in ticket ${ticketId} at timestamp ${timestamp}`;

    // Giải mã chữ ký ra địa chỉ ví
    const recoveredAddress = ethers.verifyMessage(messageToCheck, signature);

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "⛔ Chữ ký không hợp lệ! Vé giả mạo.",
      });
    }

    // 3. KIỂM TRA TRONG DATABASE
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
      return res
        .status(404)
        .json({ success: false, message: "Vé không tồn tại." });
    }

    // Kiểm tra chủ sở hữu: ví trong QR phải trùng ví của user sở hữu vé
    const ownerWallet = ticket.owner?.walletAddress;

    if (
      !ownerWallet ||
      ownerWallet.toLowerCase() !== walletAddress.toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        message: "⛔ Vé này không thuộc về ví đang quét.",
      });
    }

    // Kiểm tra trạng thái (đã check-in rồi thì không cho check lại)
    if (ticket.status === "checkedIn") {
      return res.status(400).json({
        success: false,
        message: "⛔ Vé này ĐÃ SỬ DỤNG rồi!",
      });
    }

    // 4. THÀNH CÔNG -> UPDATE DB
    ticket.status = "checkedIn";
    ticket.checkinAt = new Date();
    await ticket.save();

    // Tăng bộ đếm đã check-in cho TicketType (phục vụ thống kê)
    if (ticket.ticketType?._id) {
      await TicketType.findByIdAndUpdate(ticket.ticketType._id, {
        $inc: { quantityCheckedIn: 1 },
      });
    }

    // TODO: Bắn Job sang Worker để sync lên Blockchain (Làm sau)
    // await addCheckInJob(ticket.tokenId);

    return res.status(200).json({
      success: true,
      message: "✅ CHECK-IN THÀNH CÔNG!",
      data: {
        eventName: ticket.ticketType?.show?.event?.name,
        showName: ticket.ticketType?.show?.name,
        ticketTypeName: ticket.ticketType?.name,
        status: ticket.status,
        checkinAt: ticket.checkinAt,
      },
    });
  } catch (error) {
    console.error("Check-in Error:", error);
    return res.status(500).json({ success: false, message: "Lỗi Server" });
  }
};

module.exports = { verifyCheckIn };
