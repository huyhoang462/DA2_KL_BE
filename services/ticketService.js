const TicketType = require("../models/ticketType");

const Ticket = require("../models/ticket");
const OrderItem = require("../models/orderItem");
const Order = require("../models/order");
const mongoose = require("mongoose");
const crypto = require("crypto");

/**
 * Tạo tickets khi thanh toán thành công
 * @param {String} orderId - ID của order
 * @param {String} ownerId - ID của người mua
 * @param {mongoose.ClientSession} session - MongoDB session cho transaction
 */
const createTicketsForOrder = async (orderId, ownerId, session = null) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid order ID format");
    error.status = 400;
    throw error;
  }

  console.log(`[CREATE TICKETS] Creating tickets for order ${orderId}`);

  // Lấy order items
  const orderItems = await OrderItem.find({ order: orderId })
    .populate("ticketType")
    .session(session);

  if (orderItems.length === 0) {
    const error = new Error("No order items found for this order");
    error.status = 404;
    throw error;
  }

  const tickets = [];

  // Tạo tickets cho mỗi order item
  for (const item of orderItems) {
    for (let i = 0; i < item.quantity; i++) {
      const qrCode = generateQRCode(orderId, item.ticketType._id, i);

      console.log(
        "[QR GENERATE] order=%s ticketType=%s index=%d qr=%s",
        orderId,
        item.ticketType._id.toString(),
        i,
        qrCode
      );

      tickets.push({
        ticketType: item.ticketType._id,
        order: orderId,
        owner: ownerId, // ← Đúng với model
        qrCode,
        status: "pending", // ← Đúng với enum
        mintStatus: "unminted", // ← Đúng với enum
      });
    }
  }

  const createdTickets = await Ticket.insertMany(tickets, { session });

  console.log(`[CREATE TICKETS] Created ${createdTickets.length} tickets`);

  return createdTickets;
};

/**
 * Generate unique QR code
 */
const generateQRCode = (orderId, ticketTypeId, index) => {
  const timestamp = Date.now();
  const random = crypto.randomBytes(8).toString("hex");
  const qr = `TICKET-${orderId}-${ticketTypeId}-${index}-${timestamp}-${random}`;

  // Log mức debug cho quá trình sinh QR (không in dữ liệu nhạy cảm)
  console.log(
    "[QR BUILD] base=order:%s-ticketType:%s-index:%d ts=%d",
    orderId,
    ticketTypeId.toString(),
    index,
    timestamp
  );

  return qr;
};

/**
 * Lấy tất cả tickets của một user
 */
const getTicketsByUserId = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid user ID format");
    error.status = 400;
    throw error;
  }

  const tickets = await Ticket.find({ owner: userId })
    .populate({
      path: "ticketType",
      select: "name price description",
      populate: {
        path: "show",
        select: "name startTime endTime",
        populate: {
          path: "event",
          select: "name bannerImageUrl location format",
        },
      },
    })
    .populate({
      path: "order",
      select: "totalAmount status createdAt",
    })
    .sort({ createdAt: -1 })
    .lean();

  return tickets.map((ticket) => {
    const ticketType = ticket.ticketType;
    const show = ticketType?.show;
    const event = show?.event;

    return {
      // Ticket info
      id: ticket._id.toString(),
      qrCode: ticket.qrCode,
      status: ticket.status,
      checkinAt: ticket.checkinAt,
      lastCheckOutAt: ticket.lastCheckOutAt,
      mintStatus: ticket.mintStatus,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,

      // TicketType info (flat)
      ticketTypeId: ticketType?._id.toString() || null,
      ticketTypeName: ticketType?.name || null,
      price: ticketType?.price || null,
      description: ticketType?.description || null,

      // Show info (flat)
      showId: show?._id.toString() || null,
      showName: show?.name || null,
      startTime: show?.startTime || null,
      endTime: show?.endTime || null,

      // Event info (flat)
      eventId: event?._id.toString() || null,
      eventName: event?.name || null,
      bannerImageUrl: event?.bannerImageUrl || null,
      location: event?.format === "offline" ? event?.location?.address : null, // Chỉ lấy location nếu offline
      format: event?.format || null,

      // // Order info (flat)
      // orderId: ticket.order?._id.toString() || null,
      // orderTotalAmount: ticket.order?.totalAmount || null,
      // orderStatus: ticket.order?.status || null,
      // orderCreatedAt: ticket.order?.createdAt || null,
    };
  });
};

/**
 * Lấy tickets theo order ID
 */
const getTicketsByOrderId = async (orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid order ID format");
    error.status = 400;
    throw error;
  }

  const tickets = await Ticket.find({ order: orderId })
    .populate({
      path: "ticketType",
      populate: {
        path: "show",
        populate: "event",
      },
    })
    .lean();

  const mintedCount = tickets.filter((t) => t.mintStatus === "minted").length;
  const pendingMintCount = tickets.filter(
    (t) => t.mintStatus === "pending"
  ).length;
  const unmintedCount = tickets.filter(
    (t) => t.mintStatus === "unminted"
  ).length;
  const failedMintCount = tickets.filter(
    (t) => t.mintStatus === "failed"
  ).length;

  console.log(
    `📈 [MINT STATUS] Order ${orderId}: total=${tickets.length}, minted=${mintedCount}, pending=${pendingMintCount}, unminted=${unmintedCount}, failed=${failedMintCount}`
  );

  return tickets.map((ticket) => ({
    id: ticket._id.toString(),
    qrCode: ticket.qrCode,
    status: ticket.status,
    checkinAt: ticket.checkinAt,
    lastCheckOutAt: ticket.lastCheckOutAt,
    mintStatus: ticket.mintStatus,
    ticketType: ticket.ticketType,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  }));
};

/**
 * Lấy một ticket theo ID
 */
const getTicketById = async (ticketId, userId = null) => {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    const error = new Error("Invalid ticket ID format");
    error.status = 400;
    throw error;
  }

  const ticket = await Ticket.findById(ticketId)
    .populate({
      path: "ticketType",
      populate: {
        path: "show",
        populate: "event",
      },
    })
    .populate({
      path: "order",
      select: "totalAmount status createdAt",
    })
    .populate({
      path: "owner",
      select: "fullName email",
    })
    .lean();

  if (!ticket) {
    const error = new Error("Ticket not found");
    error.status = 404;
    throw error;
  }

  // Kiểm tra quyền truy cập (nếu có userId)
  if (userId && ticket.owner._id.toString() !== userId) {
    const error = new Error("Unauthorized to access this ticket");
    error.status = 403;
    throw error;
  }

  return {
    id: ticket._id.toString(),
    qrCode: ticket.qrCode,
    status: ticket.status,
    checkinAt: ticket.checkinAt,
    lastCheckOutAt: ticket.lastCheckOutAt,
    mintStatus: ticket.mintStatus,
    blockchainNetwork: ticket.blockchainNetwork,
    contractAddress: ticket.contractAddress,
    tokenId: ticket.tokenId,
    ticketType: ticket.ticketType,
    order: ticket.order,
    owner: ticket.owner,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
};

/**
 * Xóa ticket (chỉ admin hoặc khi order cancelled)
 */
const deleteTicket = async (ticketId) => {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    const error = new Error("Invalid ticket ID format");
    error.status = 400;
    throw error;
  }

  const ticket = await Ticket.findById(ticketId).populate("order");

  if (!ticket) {
    const error = new Error("Ticket not found");
    error.status = 404;
    throw error;
  }

  // Kiểm tra xem có thể xóa không
  if (ticket.status === "checkedIn") {
    const error = new Error("Cannot delete checked-in ticket");
    error.status = 400;
    throw error;
  }

  if (ticket.order.status === "paid") {
    const error = new Error("Cannot delete ticket from paid order");
    error.status = 400;
    throw error;
  }

  await Ticket.findByIdAndDelete(ticketId);

  console.log(`[DELETE TICKET] Deleted ticket ${ticketId}`);

  return { message: "Ticket deleted successfully" };
};

const getTicketTypesByShow = async (showId) => {
  if (!showId || !mongoose.Types.ObjectId.isValid(showId)) {
    const err = new Error("Valid Show ID is required");
    err.status = 400;
    throw err;
  }

  const ticketTypes = await TicketType.find({ show: showId })
    .sort({ price: 1 })
    .lean();

  // Tính tổng các chỉ số
  const totalQuantity = ticketTypes.reduce(
    (sum, tt) => sum + tt.quantityTotal,
    0
  );
  const totalSold = ticketTypes.reduce((sum, tt) => sum + tt.quantitySold, 0);
  const totalCheckedIn = ticketTypes.reduce(
    (sum, tt) => sum + (tt.quantityCheckedIn || 0),
    0
  );

  return {
    totalQuantity,
    totalSold,
    totalCheckedIn,
    totalAvailable: totalQuantity - totalSold,
    ticketTypes: ticketTypes.map((tt) => ({
      id: tt._id.toString(),
      name: tt.name,
      price: tt.price,
      quantityTotal: tt.quantityTotal,
      quantitySold: tt.quantitySold,
      quantityCheckedIn: tt.quantityCheckedIn || 0,
      quantityAvailable: tt.quantityTotal - tt.quantitySold,
      minPurchase: tt.minPurchase,
      maxPurchase: tt.maxPurchase,
      description: tt.description,
      createdAt: tt.createdAt,
      updatedAt: tt.updatedAt,
    })),
  };
};

module.exports = {
  createTicketsForOrder,
  getTicketsByUserId,
  getTicketsByOrderId,
  getTicketById,
  deleteTicket,
  getTicketTypesByShow,
};
