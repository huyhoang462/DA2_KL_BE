const mongoose = require("mongoose");
const Show = require("../models/show");
const TicketType = require("../models/ticketType");
const Ticket = require("../models/ticket");

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
 * Get overview data for a show.
 * Returns: { show, ticketTypes: [...], totalSold, totalCapacity, totalCheckedIn, notArrived, checkedInPercent }
 */
const getShowOverview = async (showId) => {
  if (!mongoose.isValidObjectId(showId)) throw new Error("Invalid showId");
  const showObjId = new mongoose.Types.ObjectId(showId);

  // Aggregate ticket types for the show and compute progress
  const agg = [
    { $match: { show: showObjId } },
    {
      $project: {
        name: 1,
        price: 1,
        quantityTotal: 1,
        quantitySold: 1,
        quantityCheckedIn: 1,
      },
    },
    {
      $addFields: {
        progressPercent: {
          $cond: [
            { $gt: ["$quantityTotal", 0] },
            { $multiply: [{ $divide: ["$quantitySold", "$quantityTotal"] }, 100] },
            0,
          ],
        },
        available: { $subtract: ["$quantityTotal", "$quantitySold"] },
      },
    },
    {
      $group: {
        _id: null,
        ticketTypes: { $push: "$ROOT" },
        totalSold: { $sum: "$quantitySold" },
        totalCapacity: { $sum: "$quantityTotal" },
        totalCheckedIn: { $sum: "$quantityCheckedIn" },
      },
    },
    {
      $project: {
        _id: 0,
        ticketTypes: 1,
        totalSold: 1,
        totalCapacity: 1,
        totalCheckedIn: 1,
        notArrived: { $subtract: ["$totalSold", "$totalCheckedIn"] },
        checkedInPercent: {
          $cond: [
            { $gt: ["$totalSold", 0] },
            { $multiply: [{ $divide: ["$totalCheckedIn", "$totalSold"] }, 100] },
            0,
          ],
        },
      },
    },
  ];

  const ticketTypeAgg = await TicketType.aggregate(agg);
  const show = await Show.findById(showObjId).lean();

  const result = ticketTypeAgg[0] || {
    ticketTypes: [],
    totalSold: 0,
    totalCapacity: 0,
    totalCheckedIn: 0,
    notArrived: 0,
    checkedInPercent: 0,
  };

  return {
    show,
    ticketTypes: result.ticketTypes,
    totalSold: result.totalSold,
    totalCapacity: result.totalCapacity,
    totalCheckedIn: result.totalCheckedIn,
    notArrived: result.notArrived,
    checkedInPercent: result.checkedInPercent,
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
          { $match: { $expr: { $and: [ { $eq: ["$order", "$$orderId"] }, { $eq: ["$ticketType", "$$ttId"] } ] } } },
          { $project: { priceAtPurchase: 1, quantity: 1 } },
          { $limit: 1 }
        ],
        as: "matchedOrderItem",
      },
    },
  ];

  // apply status filter
  if (statusFilter) {
    pipeline.push({ $match: { status: statusFilter } });
  }

  // apply search filter on owner name or phone
  if (search) {
    const regex = new RegExp(search.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i");
    pipeline.push({ $match: { $or: [ { "owner.fullName": { $regex: regex } }, { "owner.phone": { $regex: regex } } ] } });
  }

  // add fields for display
  pipeline.push({
    $addFields: {
      priceAtPurchase: { $ifNull: [ { $arrayElemAt: ["$matchedOrderItem.priceAtPurchase", 0] }, "$ticketType.price" ] },
      purchaseDate: "$order.createdAt",
      timeLabel: {
        $cond: [
          { $ifNull: ["$checkinAt", false] },
          { $dateToString: { format: "%H:%M %d/%m/%Y", date: "$checkinAt", timezone: "UTC" } },
          null,
        ],
      },
      priceLabel: {
        $concat: [ { $toString: { $ifNull: [ { $arrayElemAt: ["$matchedOrderItem.priceAtPurchase", 0] }, "$ticketType.price" ] } }, "đ" ]
      }
    }
  });

  // Facet for pagination + total
  pipeline.push({
    $facet: {
      metadata: [ { $count: "total" } ],
      data: [ { $sort: { checkinAt: -1, createdAt: -1 } }, { $skip: skip }, { $limit: limit }, { $project: {
        id: { $toString: "$_id" },
        ticketId: "$_id",
        customer: { name: "$owner.fullName", phone: "$owner.phone" },
        ticketType: { id: "$ticketType._id", name: "$ticketType.name" },
        seat: "$seat",
        price: "$priceAtPurchase",
        purchaseDate: "$purchaseDate",
        checkin: { status: "$status", time: "$checkinAt" },
        display: { timeLabel: "$timeLabel", priceLabel: "$priceLabel" }
      } } ]
    }
  });

  // unwind metadata
  pipeline.push({ $unwind: { path: "$metadata", preserveNullAndEmptyArrays: true } });
  pipeline.push({ $addFields: { total: { $ifNull: ["$metadata.total", 0] } } });
  pipeline.push({ $project: { metadata: 0 } });

  const aggResult = await Ticket.aggregate(pipeline);
  const out = aggResult[0] || { total: 0, data: [] };
  return { total: out.total || 0, items: out.data || [] };
};

module.exports = {
  createShow,
  getShowOverview,
  getShowCheckins,
};
