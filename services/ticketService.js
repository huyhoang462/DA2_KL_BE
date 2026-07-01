const TicketType = require("../models/ticketType");

const Ticket = require("../models/ticket");
const OrderItem = require("../models/orderItem");
const Order = require("../models/order");
const mongoose = require("mongoose");
const crypto = require("crypto");
const { createNotificationSafe } = require("./notificationService");

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
        qrCode,
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

const SAFE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const generateQRCode = (orderId, ticketTypeId, index, length = 8) => {
  let code = "";
  // Lấy ra các byte ngẫu nhiên
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    // Map giá trị byte (0-255) vào index của bảng chữ cái
    const randomIndex = randomBytes[i] % SAFE_ALPHABET.length;
    code += SAFE_ALPHABET[randomIndex];
  }

  // Format cho đẹp: Chia nửa ra và nhét dấu "-" vào giữa
  // Ví dụ length = 8 -> XXXXXXXX -> XXXX-XXXX
  const half = Math.ceil(length / 2);
  const formattedCode = `${code.slice(0, half)}-${code.slice(half)}`;

  // Thêm prefix để dễ nhận diện (VD: TK-A3X9-K8M2)
  return formattedCode;
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
    .sort({ updatedAt: -1 })
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
      blockchainNetwork: ticket.blockchainNetwork,
      contractAddress: ticket.contractAddress,
      tokenId: ticket.tokenId,
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
 * Lấy các tickets pending (sắp diễn ra) của một user
 * - Ticket.status = "pending"
 * - Show.startTime >= now
 * - Order.status = "paid"
 */
const getPendingTicketsByUserId = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid user ID format");
    error.status = 400;
    throw error;
  }

  const now = new Date();

  const pipeline = [
    {
      $match: {
        owner: new mongoose.Types.ObjectId(userId),
        status: "pending",
        mintStatus: { $ne: "pending" },
      },
    },
    {
      $lookup: {
        from: "tickettypes",
        localField: "ticketType",
        foreignField: "_id",
        as: "ticketType",
      },
    },
    {
      $unwind: {
        path: "$ticketType",
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $lookup: {
        from: "shows",
        localField: "ticketType.show",
        foreignField: "_id",
        as: "show",
      },
    },
    {
      $unwind: {
        path: "$show",
        preserveNullAndEmptyArrays: false,
      },
    },
    // {
    //   $match: {
    //     "show.startTime": { $gte: now },
    //   },
    // },
    {
      $lookup: {
        from: "events",
        localField: "show.event",
        foreignField: "_id",
        as: "event",
      },
    },
    {
      $unwind: {
        path: "$event",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: "orders",
        localField: "order",
        foreignField: "_id",
        as: "order",
      },
    },
    {
      $unwind: {
        path: "$order",
        preserveNullAndEmptyArrays: false,
      },
    },
    {
      $match: {
        "order.status": "paid",
      },
    },
    {
      $sort: {
        "show.startTime": 1,
        createdAt: -1,
      },
    },
    {
      $project: {
        _id: 1,
        qrCode: 1,
        status: 1,
        checkinAt: 1,
        lastCheckOutAt: 1,
        mintStatus: 1,
        blockchainNetwork: 1,
        contractAddress: 1,
        tokenId: 1,
        createdAt: 1,
        updatedAt: 1,
        ticketType: {
          _id: "$ticketType._id",
          name: "$ticketType.name",
          price: "$ticketType.price",
          description: "$ticketType.description",
        },
        show: {
          _id: "$show._id",
          name: "$show.name",
          startTime: "$show.startTime",
          endTime: "$show.endTime",
        },
        event: {
          _id: "$event._id",
          name: "$event.name",
          bannerImageUrl: "$event.bannerImageUrl",
          location: "$event.location",
          format: "$event.format",
        },
      },
    },
  ];

  const tickets = await Ticket.aggregate(pipeline);

  // Group result: events[] -> shows[] -> ticketTypes[] -> tickets[]
  // Note: tickets is already sorted by show.startTime asc, createdAt desc.
  const eventsMap = new Map();

  for (const ticket of tickets) {
    const ticketType = ticket.ticketType;
    const show = ticket.show;
    const event = ticket.event;

    if (!event?._id || !show?._id || !ticketType?._id) continue;

    const eventId = event._id.toString();
    const showId = show._id.toString();
    const ticketTypeId = ticketType._id.toString();

    let eventNode = eventsMap.get(eventId);
    if (!eventNode) {
      eventNode = {
        eventId,
        eventName: event?.name || null,
        bannerImageUrl: event?.bannerImageUrl || null,
        location: event?.format === "offline" ? event?.location?.address : null,
        format: event?.format || null,
        shows: [],
        _showsMap: new Map(),
      };
      eventsMap.set(eventId, eventNode);
    }

    let showNode = eventNode._showsMap.get(showId);
    if (!showNode) {
      showNode = {
        showId,
        showName: show?.name || null,
        startTime: show?.startTime || null,
        endTime: show?.endTime || null,
        ticketTypes: [],
        _ticketTypesMap: new Map(),
      };
      eventNode._showsMap.set(showId, showNode);
      eventNode.shows.push(showNode);
    }

    let ticketTypeNode = showNode._ticketTypesMap.get(ticketTypeId);
    if (!ticketTypeNode) {
      ticketTypeNode = {
        ticketTypeId,
        ticketTypeName: ticketType?.name || null,
        price: ticketType?.price ?? null,
        description: ticketType?.description || null,
        tickets: [],
      };
      showNode._ticketTypesMap.set(ticketTypeId, ticketTypeNode);
      showNode.ticketTypes.push(ticketTypeNode);
    }

    ticketTypeNode.tickets.push({
      id: ticket._id.toString(),
      qrCode: ticket.qrCode,
      status: ticket.status,
      checkinAt: ticket.checkinAt,
      lastCheckOutAt: ticket.lastCheckOutAt,
      mintStatus: ticket.mintStatus,
      blockchainNetwork: ticket.blockchainNetwork,
      contractAddress: ticket.contractAddress,
      tokenId: ticket.tokenId,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    });
  }

  // Remove internal maps
  const result = Array.from(eventsMap.values()).map((eventNode) => {
    for (const showNode of eventNode.shows) {
      delete showNode._ticketTypesMap;
    }
    delete eventNode._showsMap;
    return eventNode;
  });

  return result;
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
    (t) => t.mintStatus === "pending",
  ).length;
  const unmintedCount = tickets.filter(
    (t) => t.mintStatus === "unminted",
  ).length;
  const failedMintCount = tickets.filter(
    (t) => t.mintStatus === "failed",
  ).length;

  console.log(
    `📈 [MINT STATUS] Order ${orderId}: total=${tickets.length}, minted=${mintedCount}, pending=${pendingMintCount}, unminted=${unmintedCount}, failed=${failedMintCount}`,
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
    0,
  );
  const totalSold = ticketTypes.reduce((sum, tt) => sum + tt.quantitySold, 0);
  const totalCheckedIn = ticketTypes.reduce(
    (sum, tt) => sum + (tt.quantityCheckedIn || 0),
    0,
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

/**
 * Lấy ticket types statistics cho Organizer (Desktop) - Với checkinRate
 * @param {String} showId - ID của show
 * @returns {Object} - Statistics với checkinRate
 */
const getTicketTypesStatsForOrganizer = async (showId) => {
  if (!showId || !mongoose.Types.ObjectId.isValid(showId)) {
    const err = new Error("Valid Show ID is required");
    err.status = 400;
    throw err;
  }

  const ticketTypes = await TicketType.find({ show: showId })
    .sort({ price: 1 })
    .lean();

  // Tính tổng các chệ số
  const totalQuantity = ticketTypes.reduce(
    (sum, tt) => sum + tt.quantityTotal,
    0,
  );
  const totalSold = ticketTypes.reduce((sum, tt) => sum + tt.quantitySold, 0);
  const totalCheckedIn = ticketTypes.reduce(
    (sum, tt) => sum + (tt.quantityCheckedIn || 0),
    0,
  );

  // Tính tỷ lệ check-in tổng thể
  const checkinRate =
    totalSold > 0
      ? parseFloat(((totalCheckedIn / totalSold) * 100).toFixed(2))
      : 0;

  return {
    totalQuantity,
    totalSold,
    totalCheckedIn,
    totalAvailable: totalQuantity - totalSold,
    checkinRate, // % đã check-in / đã bán
    ticketTypes: ticketTypes.map((tt) => {
      const ttCheckinRate =
        tt.quantitySold > 0
          ? parseFloat(
              ((tt.quantityCheckedIn / tt.quantitySold) * 100).toFixed(2),
            )
          : 0;

      return {
        id: tt._id.toString(),
        name: tt.name,
        price: tt.price,
        quantityTotal: tt.quantityTotal,
        quantitySold: tt.quantitySold,
        quantityCheckedIn: tt.quantityCheckedIn || 0,
        quantityAvailable: tt.quantityTotal - tt.quantitySold,
        checkinRate: ttCheckinRate, // % check-in riêng loại vé này
        minPurchase: tt.minPurchase,
        maxPurchase: tt.maxPurchase,
        description: tt.description,
        createdAt: tt.createdAt,
        updatedAt: tt.updatedAt,
      };
    }),
  };
};

/**
 * Lấy tất cả tickets của một show (cho quản lý check-in)
 * @param {String} showId - ID của show
 * @param {Object} filters - { status, ticketTypeId, search, page, limit }
 */
const getTicketsByShowId = async (showId, filters = {}) => {
  if (!showId || !mongoose.Types.ObjectId.isValid(showId)) {
    const err = new Error("Valid Show ID is required");
    err.status = 400;
    throw err;
  }

  const { status, ticketTypeId, search, page = 1, limit = 50 } = filters;

  // Build match conditions
  const matchConditions = {};

  // Filter by status
  if (status) {
    matchConditions.status = status;
  }

  // Filter by ticket type
  if (ticketTypeId && mongoose.Types.ObjectId.isValid(ticketTypeId)) {
    matchConditions.ticketType = new mongoose.Types.ObjectId(ticketTypeId);
  }

  // Aggregation pipeline
  const pipeline = [
    // Stage 1: Lookup TicketType
    {
      $lookup: {
        from: "tickettypes",
        localField: "ticketType",
        foreignField: "_id",
        as: "ticketType",
      },
    },
    {
      $unwind: "$ticketType",
    },

    // Stage 2: Filter by show
    {
      $match: {
        "ticketType.show": new mongoose.Types.ObjectId(showId),
        ...matchConditions,
      },
    },

    // Stage 3: Lookup Order
    {
      $lookup: {
        from: "orders",
        localField: "order",
        foreignField: "_id",
        as: "order",
      },
    },
    {
      $unwind: "$order",
    },

    // Stage 4: Lookup Owner (User)
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    {
      $unwind: "$owner",
    },

    // Stage 5: Search filter (qrCode, owner name, order code)
    ...(search
      ? [
          {
            $match: {
              $or: [
                { qrCode: { $regex: search, $options: "i" } },
                { "owner.fullName": { $regex: search, $options: "i" } },
                { "order.orderCode": { $regex: search, $options: "i" } },
              ],
            },
          },
        ]
      : []),

    // Stage 6: Sort (checkinAt DESC, then createdAt DESC)
    {
      $sort: {
        checkinAt: -1,
        createdAt: -1,
      },
    },

    // Stage 7: Facet for pagination
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: (parseInt(page) - 1) * parseInt(limit) },
          { $limit: parseInt(limit) },
          {
            $project: {
              _id: 1,
              qrCode: 1,
              status: 1,
              checkinAt: 1,
              lastCheckOutAt: 1,
              createdAt: 1,
              updatedAt: 1,
              ticketType: {
                _id: 1,
                name: 1,
                price: 1,
              },
              order: {
                _id: 1,
                orderCode: 1,
                status: 1,
                totalAmount: 1,
              },
              owner: {
                _id: 1,
                fullName: 1,
                email: 1,
                phone: 1,
              },
            },
          },
        ],
      },
    },
  ];

  const results = await Ticket.aggregate(pipeline);

  const tickets = results[0]?.data || [];
  const total = results[0]?.metadata[0]?.total || 0;
  const totalPages = Math.ceil(total / parseInt(limit));

  return {
    success: true,
    data: tickets.map((ticket) => ({
      id: ticket._id.toString(),
      qrCode: ticket.qrCode,
      status: ticket.status,
      checkinAt: ticket.checkinAt,
      lastCheckOutAt: ticket.lastCheckOutAt,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      ticketType: {
        id: ticket.ticketType._id.toString(),
        name: ticket.ticketType.name,
        price: ticket.ticketType.price,
      },
      order: {
        id: ticket.order._id.toString(),
        orderCode: ticket.order.orderCode,
        status: ticket.order.status,
        totalAmount: ticket.order.totalAmount,
      },
      owner: {
        id: ticket.owner._id.toString(),
        fullName: ticket.owner.fullName,
        email: ticket.owner.email,
        phone: ticket.owner.phone,
      },
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
    },
  };
};

/**
 * Lấy danh sách vé cho Organizer (Desktop) - Chỉ vé đã thanh toán
 * @param {String} showId - ID của show
 * @param {Object} filters - { status, ticketTypeId, search, page, limit }
 */
const getTicketsListForOrganizer = async (showId, filters = {}) => {
  if (!showId || !mongoose.Types.ObjectId.isValid(showId)) {
    const err = new Error("Valid Show ID is required");
    err.status = 400;
    throw err;
  }

  const { status, ticketTypeId, search, page = 1, limit = 50 } = filters;

  // Build match conditions for tickets
  const ticketMatchConditions = {};

  // Filter by ticket status
  if (status) {
    ticketMatchConditions.status = status;
  }

  // ⚠️ Filter by ticket type - PHẢI filter TRƯC khi lookup
  if (ticketTypeId && mongoose.Types.ObjectId.isValid(ticketTypeId)) {
    ticketMatchConditions.ticketType = new mongoose.Types.ObjectId(
      ticketTypeId,
    );
  }

  // Aggregation pipeline
  const pipeline = [
    // Stage 0: ⭐ Filter tickets TRƯC (khi ticketType còn là ObjectId)
    ...(Object.keys(ticketMatchConditions).length > 0
      ? [
          {
            $match: ticketMatchConditions,
          },
        ]
      : []),

    // Stage 1: Lookup TicketType
    {
      $lookup: {
        from: "tickettypes",
        localField: "ticketType",
        foreignField: "_id",
        as: "ticketType",
      },
    },
    {
      $unwind: "$ticketType",
    },

    // Stage 2: Filter by show
    {
      $match: {
        "ticketType.show": new mongoose.Types.ObjectId(showId),
      },
    },

    // Stage 2.5: ⭐ Extract ticketIndex từ qrCode (TICKET-orderId-ticketTypeId-INDEX-timestamp-random)
    {
      $addFields: {
        ticketIndex: {
          $toInt: {
            $arrayElemAt: [
              { $split: ["$qrCode", "-"] },
              3, // Index is at position 3 (0-based)
            ],
          },
        },
      },
    },

    // Stage 3: Lookup Order
    {
      $lookup: {
        from: "orders",
        localField: "order",
        foreignField: "_id",
        as: "order",
      },
    },
    {
      $unwind: "$order",
    },

    // Stage 4: ⭐ Filter chỉ lấy vé có order.status = "paid"
    {
      $match: {
        "order.status": "paid",
      },
    },

    // Stage 5: Lookup Owner (User)
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    {
      $unwind: "$owner",
    },

    // Stage 6: Search filter (qrCode, owner name, order code)
    ...(search
      ? [
          {
            $match: {
              $or: [
                { qrCode: { $regex: search, $options: "i" } },
                { "owner.fullName": { $regex: search, $options: "i" } },
                { "order.orderCode": { $regex: search, $options: "i" } },
              ],
            },
          },
        ]
      : []),

    // Stage 7: Sort (checkinAt DESC, then createdAt DESC)
    {
      $sort: {
        checkinAt: -1,
        createdAt: -1,
      },
    },

    // Stage 8: Facet for pagination
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [
          { $skip: (parseInt(page) - 1) * parseInt(limit) },
          { $limit: parseInt(limit) },
          {
            $project: {
              _id: 1,
              qrCode: 1,
              ticketIndex: 1, // ⭐ ADD
              status: 1,
              checkinAt: 1,
              lastCheckOutAt: 1,
              mintStatus: 1, // ⭐ ADD
              tokenId: 1, // ⭐ ADD
              createdAt: 1,
              updatedAt: 1,
              ticketType: {
                _id: 1,
                name: 1,
                price: 1,
              },
              order: {
                _id: 1,
                orderCode: 1,
                status: 1,
                totalAmount: 1,
              },
              owner: {
                _id: 1,
                fullName: 1,
                email: 1,
                phone: 1,
              },
            },
          },
        ],
      },
    },
  ];

  const results = await Ticket.aggregate(pipeline);

  const tickets = results[0]?.data || [];
  const total = results[0]?.metadata[0]?.total || 0;
  const totalPages = Math.ceil(total / parseInt(limit));

  return {
    success: true,
    data: tickets.map((ticket) => ({
      id: ticket._id.toString(),
      qrCode: ticket.qrCode,
      ticketIndex: ticket.ticketIndex, // ⭐ Số thứ tự vé (0, 1, 2, ...)
      status: ticket.status,
      checkinAt: ticket.checkinAt,
      lastCheckOutAt: ticket.lastCheckOutAt,
      mintStatus: ticket.mintStatus || "unminted", // ⭐ NFT mint status
      tokenId: ticket.tokenId || null, // ⭐ NFT tokenId (nếu đã mint)
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
      ticketType: {
        id: ticket.ticketType._id.toString(),
        name: ticket.ticketType.name,
        price: ticket.ticketType.price,
      },
      order: {
        id: ticket.order._id.toString(),
        orderCode: ticket.order.orderCode,
        status: ticket.order.status,
        totalAmount: ticket.order.totalAmount,
      },
      owner: {
        id: ticket.owner._id.toString(),
        fullName: ticket.owner.fullName,
        email: ticket.owner.email,
        phone: ticket.owner.phone,
      },
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages,
    },
  };
};

/**
 * Hủy bán vé: chuyển status từ "selling" về "pending"
 * Chỉ owner của vé mới có thể thực hiện
 * @param {String} ticketId - ID của ticket
 * @param {String} userId   - ID của người dùng đang thực hiện
 */
const cancelTicketListing = async (ticketId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(ticketId)) {
    const error = new Error("Invalid ticket ID format");
    error.status = 400;
    throw error;
  }

  const ticket = await Ticket.findById(ticketId);

  if (!ticket) {
    const error = new Error("Ticket not found");
    error.status = 404;
    throw error;
  }

  if (ticket.owner.toString() !== userId.toString()) {
    const error = new Error("Forbidden: You do not own this ticket");
    error.status = 403;
    throw error;
  }

  if (ticket.status !== "selling") {
    const error = new Error(
      `Ticket is not currently listed for sale (current status: ${ticket.status})`,
    );
    error.status = 400;
    throw error;
  }

  ticket.status = "pending";

  await ticket.save();

  return {
    message: "Ticket listing cancelled successfully",
    ticketId: ticket._id.toString(),
    status: ticket.status,
  };
};

module.exports = {
  createTicketsForOrder,
  getTicketsByUserId,
  getPendingTicketsByUserId,
  getTicketsByOrderId,
  getTicketById,
  deleteTicket,
  getTicketTypesByShow,
  getTicketsByShowId,
  getTicketTypesStatsForOrganizer,
  getTicketsListForOrganizer,
  cancelTicketListing,
};
