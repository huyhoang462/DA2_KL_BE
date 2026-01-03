const mongoose = require("mongoose");
const Show = require("../models/show");
const TicketType = require("../models/ticketType");
const Ticket = require("../models/ticket");
const StaffPermission = require("../models/staffPermission");
const { createPaginationMetadata } = require("../utils/pagination");

const createShow = async (data) => {
  const newShow = new Show({
    name: data.name,
    startTime: data.startTime,
    endTime: data.endTime,
    event: data.eventId,
  });
  return await newShow.save();
};

/**
 * Lấy danh sách các show mà staff được phân công (thông qua StaffPermission)
 * Trả về thông tin show + thông tin cơ bản của event (tên, bannerImage)
 * @param {String} staffId - ID của user/staff
 * @param {number} page - Trang hiện tại
 * @param {number} limit - Số show mỗi trang
 * @param {string} [status] - Trạng thái show (pending|ongoing|completed)
 * @returns {{ shows: Array, pagination: Object }}
 */
const getShowsByStaff = async (staffId, page = 1, limit = 6, status) => {
  if (!mongoose.Types.ObjectId.isValid(staffId)) {
    const error = new Error("Invalid staff ID format");
    error.status = 400;
    throw error;
  }

  try {
    // Lấy tất cả event mà user này được phân quyền trong StaffPermission
    const permissions = await StaffPermission.find({ staff: staffId })
      .select("event")
      .lean();

    const eventIds = permissions.map((p) => p.event.toString());

    if (!eventIds.length) {
      const emptyPagination = createPaginationMetadata(0, page, limit);
      return { shows: [], pagination: emptyPagination };
    }

    const filter = { event: { $in: eventIds } };

    // Optional filter by show status if provided and valid
    if (status && ["pending", "ongoing", "completed"].includes(status)) {
      filter.status = status;
    }

    const totalItems = await Show.countDocuments(filter);

    const { skip, itemsPerPage } = createPaginationMetadata(0, page, limit);

    const shows = await Show.find(filter)
      .populate({ path: "event", select: "name bannerImageUrl" })
      // Luôn trả về từ ngày gần nhất đến xa nhất
      .sort({ startTime: -1 })
      .skip(skip)
      .limit(itemsPerPage)
      .lean();

    const mappedShows = shows.map((show) => ({
      showId: show._id.toString(),
      showName: show.name,
      startTime: show.startTime,
      endTime: show.endTime,
      status: show.status,
      eventId: show.event?._id?.toString(),
      eventName: show.event?.name,
      eventBannerImageUrl: show.event?.bannerImageUrl,
    }));

    const pagination = createPaginationMetadata(totalItems, page, itemsPerPage);

    return { shows: mappedShows, pagination };
  } catch (error) {
    console.error("Error in getShowsByStaff:", error);
    throw error;
  }
};

/**
 * Get overview data for a show.
 * - Populate event info on show
 * - Return all ticketTypes of that show
 * - Compute totals: totalQuantity, totalSold, totalCheckedIn
 */
const getShowOverview = async (showId) => {
  if (!mongoose.isValidObjectId(showId)) throw new Error("Invalid showId");
  const showObjId = new mongoose.Types.ObjectId(showId);

  // Lấy show kèm một số thông tin cần thiết của event (id, name, location)
  const show = await Show.findById(showObjId)
    .populate({ path: "event", select: "name location" })
    .lean();

  if (!show) {
    const error = new Error("Show not found");
    error.status = 404;
    throw error;
  }

  // Lấy tất cả ticketType thuộc show này
  const ticketTypes = await TicketType.find({ show: showObjId })
    .select(
      "name price quantityTotal quantitySold quantityCheckedIn minPurchase maxPurchase description"
    )
    .lean();

  // Tính tổng theo yêu cầu
  let totalQuantity = 0;
  let totalSold = 0;
  let totalCheckedIn = 0;

  for (const tt of ticketTypes) {
    totalQuantity += tt.quantityTotal || 0;
    totalSold += tt.quantitySold || 0;
    totalCheckedIn += tt.quantityCheckedIn || 0;
  }

  const notArrived = totalSold - totalCheckedIn;
  const checkedInPercent = totalSold ? (totalCheckedIn / totalSold) * 100 : 0;

  return {
    show,
    ticketTypes,
    totalQuantity,
    totalSold,
    totalCheckedIn,
    notArrived,
    checkedInPercent,
  };
};

/**
 * Get paginated check-in list for a show.
 * Options: { page=1, limit=20, search=null, status=null, sort }
 */
const getShowCheckins = async (showId, options = {}) => {
  if (!mongoose.isValidObjectId(showId)) throw new Error("Invalid showId");
  const showObjId = new mongoose.Types.ObjectId(showId);
  const page = Math.max(1, parseInt(options.page || 1, 10));
  const limit = Math.min(100, parseInt(options.limit || 20, 10));
  const skip = (page - 1) * limit;
  const statusFilter = options.status;
  const search = options.search && options.search.trim();

  const pipeline = [
    // join ticketType
    {
      $lookup: {
        from: "tickettypes",
        localField: "ticketType",
        foreignField: "_id",
        as: "ticketType",
      },
    },
    { $unwind: "$ticketType" },
    // keep only tickets for the show
    { $match: { "ticketType.show": showObjId } },
    // join owner
    {
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
      },
    },
    { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
    // join order
    {
      $lookup: {
        from: "orders",
        localField: "order",
        foreignField: "_id",
        as: "order",
      },
    },
    { $unwind: { path: "$order", preserveNullAndEmptyArrays: true } },
    // find matching order item for priceAtPurchase
    {
      $lookup: {
        from: "orderitems",
        let: { orderId: "$order._id", ttId: "$ticketType._id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$order", "$$orderId"] },
                  { $eq: ["$ticketType", "$$ttId"] },
                ],
              },
            },
          },
          { $project: { priceAtPurchase: 1, quantity: 1 } },
          { $limit: 1 },
        ],
        as: "matchedOrderItem",
      },
    },
  ];

  // chỉ lấy các vé đã check-in nếu không truyền status, hoặc cho phép override qua query
  if (statusFilter) {
    pipeline.push({ $match: { status: statusFilter } });
  } else {
    pipeline.push({ $match: { status: "checkedIn" } });
  }

  // apply search filter on owner name or phone
  if (search) {
    const regex = new RegExp(
      search.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"),
      "i"
    );
    pipeline.push({
      $match: {
        $or: [
          { "owner.fullName": { $regex: regex } },
          { "owner.phone": { $regex: regex } },
        ],
      },
    });
  }

  // add fields for display (giá tại thời điểm mua và ngày mua)
  pipeline.push({
    $addFields: {
      priceAtPurchase: {
        $ifNull: [
          { $arrayElemAt: ["$matchedOrderItem.priceAtPurchase", 0] },
          "$ticketType.price",
        ],
      },
      purchaseDate: "$order.createdAt",
    },
  });

  // Facet for pagination + total
  pipeline.push({
    $facet: {
      metadata: [{ $count: "total" }],
      data: [
        { $sort: { checkinAt: -1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            name: "$owner.fullName",
            phone: "$owner.phone",
            ticketType: "$ticketType.name",
            ticketPrice: "$priceAtPurchase",
            purchasedAt: "$purchaseDate",
            checkInAt: "$checkinAt",
          },
        },
      ],
    },
  });

  // unwind metadata
  pipeline.push({
    $unwind: { path: "$metadata", preserveNullAndEmptyArrays: true },
  });
  pipeline.push({ $addFields: { total: { $ifNull: ["$metadata.total", 0] } } });
  pipeline.push({ $project: { metadata: 0 } });

  const aggResult = await Ticket.aggregate(pipeline);
  const out = aggResult[0] || { total: 0, data: [] };
  return { total: out.total || 0, items: out.data || [] };
};

module.exports = {
  createShow,
  getShowsByStaff,
  getShowOverview,
  getShowCheckins,
};
