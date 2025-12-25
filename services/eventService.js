const Event = require("../models/event");
const User = require("../models/user");
const Show = require("../models/show");
const TicketType = require("../models/ticketType");
const Category = require("../models/category");
const PayoutMethod = require("../models/payoutMethod");
const Order = require("../models/order");
const OrderItem = require("../models/orderItem");
const Ticket = require("../models/ticket");
const mongoose = require("mongoose");
const {
  formatPaginatedResponse,
  createPaginationStages,
} = require("../utils/pagination");

const cleanupOrphanedData = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const allShows = await Show.find({}, { _id: 1, event: 1 }).session(session);

    const orphanedShowIds = [];
    for (const show of allShows) {
      const eventExists = await Event.exists({ _id: show.event }).session(
        session
      );
      if (!eventExists) {
        orphanedShowIds.push(show._id);
      }
    }

    let deletedShowsCount = 0;
    if (orphanedShowIds.length > 0) {
      const deleteShowsResult = await Show.deleteMany(
        { _id: { $in: orphanedShowIds } },
        { session }
      );
      deletedShowsCount = deleteShowsResult.deletedCount;
    }

    const allTicketTypes = await TicketType.find(
      {},
      { _id: 1, show: 1 }
    ).session(session);

    const orphanedTicketTypeIds = [];
    for (const ticketType of allTicketTypes) {
      const showExists = await Show.exists({ _id: ticketType.show }).session(
        session
      );
      if (!showExists) {
        orphanedTicketTypeIds.push(ticketType._id);
      }
    }

    let deletedTicketTypesCount = 0;
    if (orphanedTicketTypeIds.length > 0) {
      const deleteTicketTypesResult = await TicketType.deleteMany(
        { _id: { $in: orphanedTicketTypeIds } },
        { session }
      );
      deletedTicketTypesCount = deleteTicketTypesResult.deletedCount;
    }

    await session.commitTransaction();

    return {
      success: true,
      message: "Database cleanup completed successfully",
      deletedShows: deletedShowsCount,
      deletedTicketTypes: deletedTicketTypesCount,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("Transaction Error in cleanupOrphanedData:", error);
    const err = new Error("Database cleanup failed, please try again.");
    err.status = 500;
    throw err;
  } finally {
    session.endSession();
  }
};

const getPendingEvents = async (page = 1, limit = 10) => {
  // Tạo pagination stages
  const { facetStage } = createPaginationStages(page, limit);

  const aggregationPipeline = [
    // --- STAGE 1: $match (Lọc events có status = "pending") ---
    {
      $match: { status: "pending" },
    },

    // --- STAGE 2: $lookup (Join với User để lấy thông tin người tạo) ---
    {
      $lookup: {
        from: "users",
        localField: "creator",
        foreignField: "_id",
        as: "creator",
      },
    },

    // --- STAGE 3: $unwind Creator ---
    {
      $unwind: {
        path: "$creator",
        preserveNullAndEmptyArrays: true,
      },
    },

    // --- STAGE 4: $sort (Sắp xếp theo thời gian tạo mới nhất) ---
    {
      $sort: { createdAt: -1 },
    },

    // --- STAGE 5: $facet (Pagination) ---
    facetStage,

    // --- STAGE 6: $project (Trong data stage, chọn các trường cần thiết) ---
    {
      $addFields: {
        data: {
          $map: {
            input: "$data",
            as: "event",
            in: {
              id: { $toString: "$$event._id" },
              bannerImageUrl: "$$event.bannerImageUrl",
              name: "$$event.name",
              location: "$$event.location",
              startDate: "$$event.startDate",
              creator: {
                id: { $toString: "$$event.creator._id" },
                name: "$$event.creator.fullName",
              },
              createdAt: "$$event.createdAt",
            },
          },
        },
      },
    },
  ];

  // Thực thi aggregation
  const results = await Event.aggregate(aggregationPipeline);

  // Format response với pagination utility
  return formatPaginatedResponse(results, page, limit);
};

const getAllEvents = async () => {
  const aggregationPipeline = [
    // --- STAGE 1: $match (Filter by status) ---
    // Uncomment and pass status parameter when needed
    // {
    //   $match: status ? { status } : {},
    // },

    // --- STAGE 2: $lookup (Get Shows) ---
    {
      $lookup: {
        from: "shows",
        localField: "_id",
        foreignField: "event",
        as: "shows",
      },
    },

    // --- STAGE 3: $lookup (Get TicketTypes for all shows) ---
    {
      $lookup: {
        from: "tickettypes",
        localField: "shows._id",
        foreignField: "show",
        as: "ticketTypes",
      },
    },

    // --- STAGE 4: $lookup (Get Category) ---
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },

    // --- STAGE 5: $unwind Category ---
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },

    // --- STAGE 6: $addFields (Calculate lowestPrice) ---
    {
      $addFields: {
        lowestPrice: {
          $cond: {
            if: { $gt: [{ $size: "$ticketTypes" }, 0] },
            then: { $min: "$ticketTypes.price" },
            else: null,
          },
        },
      },
    },

    // --- STAGE 7: $project (Select only needed fields) ---
    {
      $project: {
        bannerImageUrl: 1,
        name: 1,
        startDate: 1,
        location: 1,
        format: 1,
        "category._id": 1,
        "category.name": 1,
        lowestPrice: 1,
      },
    },

    // --- STAGE 8: $sort (Optional - sort by startDate) ---
    {
      $sort: { startDate: 1 },
    },
  ];

  const events = await Event.aggregate(aggregationPipeline);

  // Transform _id to id for consistency
  return events.map((event) => ({
    id: event._id.toString(),
    bannerImageUrl: event.bannerImageUrl,
    name: event.name,
    startDate: event.startDate,
    location: event.location,
    format: event.format,
    category: event.category
      ? {
          id: event.category._id.toString(),
          name: event.category.name,
        }
      : null,
    lowestPrice: event.lowestPrice,
  }));
};

const getEventById = async (eventId) => {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    const error = new Error("Invalid event ID format");
    error.status = 400;
    throw error;
  }

  const aggregationPipeline = [
    // --- STAGE 1: $match ---
    {
      $match: { _id: new mongoose.Types.ObjectId(eventId) },
    },

    // --- STAGE 2: $lookup (Lấy các Shows) ---
    {
      $lookup: {
        from: "shows",
        localField: "_id",
        foreignField: "event",
        as: "shows",
      },
    },

    // --- STAGE 3: $lookup (Lấy các TicketTypes cho TẤT CẢ shows) ---
    {
      $lookup: {
        from: "tickettypes",
        localField: "shows._id",
        foreignField: "show",
        as: "allTicketTypes",
      },
    },

    // --- STAGE 4: $addFields (Gắn TicketTypes vào đúng Show của nó) ---
    {
      $addFields: {
        shows: {
          $map: {
            input: "$shows",
            as: "show",
            in: {
              $mergeObjects: [
                "$$show",
                {
                  tickets: {
                    $filter: {
                      input: "$allTicketTypes",
                      as: "ticket",
                      cond: { $eq: ["$$ticket.show", "$$show._id"] },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },

    // --- STAGE 5: $project (Dọn dẹp Output) ---
    {
      $project: {
        allTicketTypes: 0,
      },
    },

    // --- STAGE 6: $lookup (Populate creator, category) ---
    {
      $lookup: {
        from: "users",
        localField: "creator",
        foreignField: "_id",
        as: "creator",
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $lookup: {
        from: "payoutmethods",
        localField: "payoutMethod",
        foreignField: "_id",
        as: "payoutMethod",
      },
    },

    // --- STAGE 7: $unwind creator và category ---
    {
      $unwind: {
        path: "$creator",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $unwind: {
        path: "$payoutMethod",
        preserveNullAndEmptyArrays: true,
      },
    },

    // --- STAGE 8: $project (Format output cuối cùng) ---
    {
      $project: {
        _id: 1,
        name: 1,
        description: 1,
        bannerImageUrl: 1,
        format: 1,
        location: 1,
        startDate: 1,
        endDate: 1,
        organizer: 1,
        status: 1,
        createdAt: 1, // THÊM thời gian tạo
        shows: 1,
        category: {
          id: { $toString: "$category._id" },
          name: "$category.name",
        },
        creator: {
          // THÊM thông tin người tạo
          id: { $toString: "$creator._id" },
          name: "$creator.fullName",
        },
        payoutMethod: {
          id: { $toString: "$payoutMethod._id" },
          methodType: "$payoutMethod.methodType",
          isDefault: "$payoutMethod.isDefault",
          bankDetails: "$payoutMethod.bankDetails",
          momoDetails: "$payoutMethod.momoDetails",
        },
      },
    },
  ];

  // Thực thi Aggregation
  const results = await Event.aggregate(aggregationPipeline);

  // Xử lý kết quả
  if (results.length === 0) {
    return null;
  }

  const event = results[0];

  // Transform để match format cũ
  event.id = event._id.toString();
  delete event._id;

  return event;
};

const updateEvent = async (eventId, updateData) => {
  // Validate eventId
  if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
    const error = new Error("Invalid event ID");
    error.status = 400;
    throw error;
  }

  // Tìm event hiện tại
  const existingEvent = await Event.findById(eventId);
  if (!existingEvent) {
    const error = new Error("Event not found");
    error.status = 404;
    throw error;
  }

  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    // --- 1. UPDATE BASIC EVENT FIELDS ---
    const eventFieldsToUpdate = {};
    const allowedFields = [
      "name",
      "description",
      "bannerImageUrl",
      "format",
      "location",
      "startDate",
      "endDate",
      "organizer",
      "category",
    ];

    allowedFields.forEach((field) => {
      if (updateData[field] !== undefined) {
        eventFieldsToUpdate[field] = updateData[field];
      }
    });

    // Validate dates if provided
    if (updateData.startDate || updateData.endDate) {
      const startDate = updateData.startDate
        ? new Date(updateData.startDate)
        : existingEvent.startDate;
      let endDate = updateData.endDate
        ? new Date(updateData.endDate)
        : existingEvent.endDate;

      // Adjust endDate like in createEvent
      if (updateData.endDate) {
        const date = new Date(updateData.endDate);
        date.setDate(date.getDate() + 1);
        endDate = new Date(date.getTime() - 1);
        eventFieldsToUpdate.endDate = endDate;
      }

      if (startDate >= endDate) {
        const error = new Error("Invalid event start or end date");
        error.status = 400;
        throw error;
      }
    }

    // Update basic fields
    if (Object.keys(eventFieldsToUpdate).length > 0) {
      await Event.findByIdAndUpdate(eventId, eventFieldsToUpdate, { session });
    }

    // --- 2. HANDLE PAYOUT METHOD (if provided) ---
    if (updateData.payoutMethod) {
      let payoutMethodId;

      if (updateData.payoutMethod.id) {
        // Use existing payout method
        const existingPayoutMethod = await PayoutMethod.findOne({
          _id: updateData.payoutMethod.id,
          user: existingEvent.creator,
        }).session(session);

        if (!existingPayoutMethod) {
          const error = new Error(
            "PayoutMethod not found or not belong to current user"
          );
          error.status = 404;
          throw error;
        }
        payoutMethodId = existingPayoutMethod._id;
      } else {
        // Create new payout method
        const newPayoutMethod = new PayoutMethod({
          ...updateData.payoutMethod,
          user: existingEvent.creator,
        });
        const savedPayoutMethod = await newPayoutMethod.save({ session });
        payoutMethodId = savedPayoutMethod._id;
      }

      await Event.findByIdAndUpdate(
        eventId,
        { payoutMethod: payoutMethodId },
        { session }
      );
    }

    // --- 3. HANDLE SHOWS OPERATIONS ---
    if (updateData.shows) {
      const {
        create = [],
        update = [],
        delete: deleteIds = [],
      } = updateData.shows;

      // Delete shows
      if (deleteIds.length > 0) {
        // First delete related tickets
        await TicketType.deleteMany(
          {
            show: {
              $in: deleteIds.map((id) => new mongoose.Types.ObjectId(id)),
            },
          },
          { session }
        );

        // Then delete shows
        await Show.deleteMany(
          {
            _id: {
              $in: deleteIds.map((id) => new mongoose.Types.ObjectId(id)),
            },
            event: eventId,
          },
          { session }
        );
      }

      // Update shows
      for (const showUpdate of update) {
        const { id, ...updateFields } = showUpdate;

        // Validate show belongs to this event
        const existingShow = await Show.findOne({
          _id: id,
          event: eventId,
        }).session(session);

        if (!existingShow) {
          const error = new Error(
            `Show ${id} not found or doesn't belong to this event`
          );
          error.status = 404;
          throw error;
        }

        // Validate time ranges if provided
        if (updateFields.startTime || updateFields.endTime) {
          const showStart = updateFields.startTime
            ? new Date(updateFields.startTime)
            : existingShow.startTime;
          const showEnd = updateFields.endTime
            ? new Date(updateFields.endTime)
            : existingShow.endTime;

          if (showStart >= showEnd) {
            const error = new Error(
              `Invalid time range for show ${existingShow.name}`
            );
            error.status = 400;
            throw error;
          }
        }

        await Show.findByIdAndUpdate(id, updateFields, { session });
      }

      // Create new shows
      for (const newShowData of create) {
        const { tickets = [], ...showData } = newShowData;

        // Validate required fields
        if (!showData.name || !showData.startTime || !showData.endTime) {
          const error = new Error(
            "Show must have name, startTime, and endTime"
          );
          error.status = 400;
          throw error;
        }

        // Validate time range
        const showStart = new Date(showData.startTime);
        const showEnd = new Date(showData.endTime);
        if (showStart >= showEnd) {
          const error = new Error(
            `Invalid time range for new show ${showData.name}`
          );
          error.status = 400;
          throw error;
        }

        const newShow = new Show({
          ...showData,
          startTime: showStart,
          endTime: showEnd,
          event: eventId,
        });
        const savedShow = await newShow.save({ session });

        // Create tickets for new show
        if (tickets.length > 0) {
          const ticketTypesData = tickets.map((ticketData) => ({
            name: ticketData.name,
            price: ticketData.price,
            quantityTotal: ticketData.quantityTotal,
            minPurchase: ticketData.minPurchase || 1,
            maxPurchase: ticketData.maxPurchase || 10,
            description: ticketData.description,
            show: savedShow._id,
          }));

          await TicketType.insertMany(ticketTypesData, { session });
        }
      }
    }

    // --- 4. HANDLE TICKETS OPERATIONS ---
    if (updateData.tickets) {
      const {
        create = [],
        update = [],
        delete: deleteIds = [],
      } = updateData.tickets;

      // Delete tickets
      if (deleteIds.length > 0) {
        await TicketType.deleteMany(
          {
            _id: {
              $in: deleteIds.map((id) => new mongoose.Types.ObjectId(id)),
            },
          },
          { session }
        );
      }

      // Update tickets
      for (const ticketUpdate of update) {
        const { id, ...updateFields } = ticketUpdate;

        // Validate ticket exists and belongs to a show of this event
        const existingTicket = await TicketType.findById(id)
          .populate("show")
          .session(session);
        if (
          !existingTicket ||
          existingTicket.show.event.toString() !== eventId
        ) {
          const error = new Error(
            `Ticket ${id} not found or doesn't belong to this event`
          );
          error.status = 404;
          throw error;
        }

        await TicketType.findByIdAndUpdate(id, updateFields, { session });
      }

      // Create new tickets
      for (const newTicketData of create) {
        // Validate required fields
        if (
          !newTicketData.showId ||
          !newTicketData.name ||
          newTicketData.price == null ||
          newTicketData.quantityTotal == null
        ) {
          const error = new Error(
            "New ticket must have showId, name, price, and quantityTotal"
          );
          error.status = 400;
          throw error;
        }

        // Validate show belongs to this event
        const show = await Show.findOne({
          _id: newTicketData.showId,
          event: eventId,
        }).session(session);

        if (!show) {
          const error = new Error(
            `Show ${newTicketData.showId} not found or doesn't belong to this event`
          );
          error.status = 404;
          throw error;
        }

        const { showId, ...ticketData } = newTicketData;
        const newTicket = new TicketType({
          ...ticketData,
          show: showId,
          minPurchase: ticketData.minPurchase || 1,
          maxPurchase: ticketData.maxPurchase || 10,
        });

        await newTicket.save({ session });
      }
    }

    await session.commitTransaction();

    // Return updated event
    return await getEventById(eventId);
  } catch (error) {
    await session.abortTransaction();
    console.error("Transaction Error in updateEvent:", error);
    throw error;
  } finally {
    await session.endSession();
  }
};
const createEvent = async (data, creatorId) => {
  const {
    name,
    description,
    bannerImageUrl,
    format,
    location,
    startDate,
    endDate,
    organizer,
    category: categoryId,
    payoutMethod: payoutMethodData,
    shows,
    status,
  } = data;

  const requiredFields = {
    name,
    description,
    bannerImageUrl,
    format,
    startDate,
    endDate,
    organizer,
    categoryId,
    payoutMethodData,
    shows,
  };
  for (const [field, value] of Object.entries(requiredFields)) {
    if (!value) {
      const error = new Error(`Missing required field: ${field}`);
      error.status = 400;
      throw error;
    }
  }

  if (format === "offline" && (!location || !location.street)) {
    const error = new Error("Street is required for offline events.");
    error.status = 400;
    throw error;
  }

  const eventStart = new Date(startDate);
  const endDateString = endDate;

  const date = new Date(endDateString);
  date.setDate(date.getDate() + 1);
  const eventEnd = new Date(date.getTime() - 1);

  if (eventStart > eventEnd) {
    const error = new Error("Invalid event start or end date.");
    error.status = 400;
    throw error;
  }

  if (!Array.isArray(shows) || shows.length === 0) {
    const error = new Error("At least one show is required.");
    error.status = 400;
    throw error;
  }

  for (const show of shows) {
    if (
      !show.name ||
      !show.startTime ||
      !show.endTime ||
      !show.tickets ||
      !Array.isArray(show.tickets) ||
      show.tickets.length === 0
    ) {
      const error = new Error(
        `Show '${
          show.name || ""
        }' must have name, startTime, endTime, and at least one ticket type.`
      );
      error.status = 400;
      throw error;
    }
    const showStart = new Date(show.startTime + "Z");
    const showEnd = new Date(show.endTime + "Z");
    console.log(
      "DATE: ",
      showStart,
      " ",
      showEnd,
      " - ",
      eventStart,
      " ",
      eventEnd
    );

    if (showStart > showEnd || showStart < eventStart || showEnd > eventEnd) {
      const error = new Error(`Show '${show.name}' has an invalid time range.`);
      error.status = 400;
      throw error;
    }
    for (const ticket of show.tickets) {
      if (
        !ticket.name ||
        ticket.price == null ||
        ticket.quantityTotal == null
      ) {
        const error = new Error(
          `Ticket type in show '${show.name}' is missing required fields (name, price, quantityTotal).`
        );
        error.status = 400;
        throw error;
      }
    }
  }

  const [creator, category] = await Promise.all([
    User.findById(creatorId),
    Category.findById(categoryId),
  ]);

  if (!creator) {
    const error = new Error("Authenticated user not found.");
    error.status = 404;
    throw error;
  }
  if (!category) {
    const error = new Error("Category not found.");
    error.status = 404;
    throw error;
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // --- XỬ LÝ PAYOUT METHOD ---
    let payoutMethodId;

    if (payoutMethodData.id) {
      // Trường hợp có ID - dùng PayoutMethod cũ
      const existingPayoutMethod = await PayoutMethod.findOne({
        _id: payoutMethodData.id,
        user: creator._id, // Đảm bảo PayoutMethod thuộc về user hiện tại
      }).session(session);

      if (!existingPayoutMethod) {
        const error = new Error(
          "PayoutMethod not found or not belong to current user"
        );
        error.status = 404;
        throw error;
      }

      payoutMethodId = existingPayoutMethod._id;
    } else {
      // Trường hợp không có ID - tạo mới PayoutMethod
      const newPayoutMethod = new PayoutMethod({
        ...payoutMethodData,
        user: creator._id,
      });
      const savedPayoutMethod = await newPayoutMethod.save({ session });
      payoutMethodId = savedPayoutMethod._id;
    }

    const newEvent = new Event({
      name,
      description,
      bannerImageUrl: bannerImageUrl.url,
      format,
      location: format === "offline" ? location : undefined,
      startDate: eventStart,
      endDate: eventEnd,
      organizer,
      creator: creator._id,
      category: category._id,
      payoutMethod: payoutMethodId,
      status: "pending",
    });
    const savedEvent = await newEvent.save({ session });

    const createdShowsWithTickets = [];
    for (const showData of shows) {
      const newShow = new Show({
        name: showData.name,
        startTime: new Date(showData.startTime),
        endTime: new Date(showData.endTime),
        event: savedEvent._id,
      });
      const savedShow = await newShow.save({ session });

      const ticketTypesData = showData.tickets.map((ticketData) => ({
        name: ticketData.name,
        price: ticketData.price,
        quantityTotal: ticketData.quantityTotal,
        minPurchase: ticketData.minPurchase,
        maxPurchase: ticketData.maxPurchase,
        description: ticketData.description,
        show: savedShow._id,
      }));

      const savedTicketTypes = await TicketType.insertMany(ticketTypesData, {
        session,
      });

      const showAsJson = savedShow.toJSON();
      showAsJson.tickets = savedTicketTypes.map((t) => t.toJSON());
      createdShowsWithTickets.push(showAsJson);
    }

    await session.commitTransaction();

    const eventAsJson = savedEvent.toJSON();
    eventAsJson.shows = createdShowsWithTickets;

    return eventAsJson;
  } catch (e) {
    await session.abortTransaction();
    console.error("Transaction Error in createEvent:", e);
    if (e.name === "ValidationError") {
      e.status = 400;
      throw e;
    }
    const error = new Error(
      "Creating event failed, the operation was rolled back."
    );
    error.status = 500;
    throw error;
  } finally {
    session.endSession();
  }
};

const getEventsByUserId = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid user ID format");
    error.status = 400;
    throw error;
  }

  const aggregationPipeline = [
    // --- STAGE 1: $match (Filter by creator) ---
    {
      $match: { creator: new mongoose.Types.ObjectId(userId) },
    },

    // --- STAGE 2: $lookup (Get Shows) ---
    {
      $lookup: {
        from: "shows",
        localField: "_id",
        foreignField: "event",
        as: "shows",
      },
    },

    // --- STAGE 3: $lookup (Get TicketTypes for all shows) ---
    {
      $lookup: {
        from: "tickettypes",
        localField: "shows._id",
        foreignField: "show",
        as: "ticketTypes",
      },
    },

    // --- STAGE 4: $addFields (Calculate totals) ---
    {
      $addFields: {
        totalTicketsSold: {
          $sum: "$ticketTypes.quantitySold",
        },
        totalTicketsAvailable: {
          $sum: "$ticketTypes.quantityTotal",
        },
      },
    },

    // --- STAGE 5: $project (Select only needed fields) ---
    {
      $project: {
        bannerImageUrl: 1,
        name: 1,
        startDate: 1,
        endDate: 1,
        location: 1,
        format: 1,
        status: 1,
        totalTicketsSold: 1,
        totalTicketsAvailable: 1,
      },
    },

    // --- STAGE 6: $sort (Sort by creation date - newest first) ---
    {
      $sort: { createdAt: -1 },
    },
  ];

  const events = await Event.aggregate(aggregationPipeline);

  // Transform _id to id for consistency
  return events.map((event) => ({
    id: event._id.toString(),
    bannerImageUrl: event.bannerImageUrl,
    name: event.name,
    startDate: event.startDate,
    endDate: event.endDate,
    location: event.location,
    format: event.format,
    status: event.status,
    totalTicketsSold: event.totalTicketsSold || 0,
    totalTicketsAvailable: event.totalTicketsAvailable || 0,
  }));
};

const updateEventStatus = async (eventId, status, reason = null) => {
  // Validate eventId
  if (!eventId) {
    const error = new Error("Event ID is required");
    error.status = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    const error = new Error("Invalid event ID format");
    error.status = 400;
    throw error;
  }

  // Validate status
  const validStatuses = [
    "draft",
    "pending",
    "upcoming",
    "ongoing",
    "completed",
    "rejected",
    "cancelled",
  ];

  if (!status) {
    const error = new Error("Status is required");
    error.status = 400;
    throw error;
  }

  if (!validStatuses.includes(status)) {
    const error = new Error(
      `Invalid status. Must be one of: ${validStatuses.join(", ")}`
    );
    error.status = 400;
    throw error;
  }

  // Tìm và cập nhật event
  const event = await Event.findById(eventId).populate(
    "creator",
    "email fullName"
  );

  if (!event) {
    const error = new Error("Event not found");
    error.status = 404;
    throw error;
  }

  // Kiểm tra logic chuyển trạng thái (optional - có thể bỏ nếu không cần)
  // Ví dụ: không cho phép chuyển từ "completed" về "pending"
  if (event.status === "completed" && status === "pending") {
    const error = new Error("Cannot change completed event back to pending");
    error.status = 400;
    throw error;
  }

  // Cập nhật status
  event.status = status;

  // Nếu status là rejected và có reason, cập nhật rejectionReason
  if (status === "rejected") {
    if (reason) {
      event.rejectionReason = reason;
    }

    // Gửi email thông báo từ chối đến người tạo sự kiện
    if (event.creator && event.creator.email) {
      try {
        const { sendEventRejectionEmail } = require("../utils/mailer");
        await sendEventRejectionEmail(
          event.creator.email,
          event.creator.fullName,
          event.name,
          reason || "No specific reason provided"
        );
      } catch (emailError) {
        console.error("Error sending rejection email:", emailError);
        // Không throw error ở đây để không làm fail toàn bộ request
      }
    }
  }

  const updatedEvent = await event.save();

  return {
    success: true,
    message: `Event status updated to ${status} successfully`,
    event: {
      id: updatedEvent.id,
      name: updatedEvent.name,
      status: updatedEvent.status,
      rejectionReason: updatedEvent.rejectionReason,
      updatedAt: updatedEvent.updatedAt,
    },
  };
};

const deleteEvent = async (eventId) => {
  if (!eventId) {
    const error = new Error("Event ID is required");
    error.status = 400;
    throw error;
  }
  const event = await Event.findById(eventId);
  if (!event) {
    const error = new Error("Event not found");
    error.status = 404;
    throw error;
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Show.deleteMany({ event: eventId }, { session });
    await Event.findByIdAndDelete(eventId, { session });
    await session.commitTransaction();
    return { message: "Event and associated shows deleted successfully" };
  } catch (e) {
    const error = new Error("Deleting event failed, please try again.");
    console.error("Transaction Error in deleteEvent:", e);
    error.status = 500;
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Dashboard Overview - Lấy tổng quan sự kiện
 * @param {string} eventId - ID của event
 * @returns {Object} - Metrics và ticket breakdown
 */
const getDashboardOverview = async (eventId) => {
  try {
    // 1. Kiểm tra event có tồn tại không
    const event = await Event.findById(eventId);
    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    // 2. Lấy tất cả shows của event
    const shows = await Show.find({ event: eventId });
    const showIds = shows.map((show) => show._id);

    // 3. Lấy tất cả ticket types của event
    const ticketTypes = await TicketType.find({ show: { $in: showIds } });
    const ticketTypeIds = ticketTypes.map((tt) => tt._id);

    // 4. Lấy tất cả orders liên quan (thông qua orderItems)
    const orderItems = await OrderItem.find({
      ticketType: { $in: ticketTypeIds },
    }).populate("order");

    // Filter orders: chỉ lấy paid và pending
    const relevantOrderIds = [
      ...new Set(
        orderItems
          .filter(
            (item) =>
              item.order &&
              (item.order.status === "paid" || item.order.status === "pending")
          )
          .map((item) => item.order._id.toString())
      ),
    ];

    const orders = await Order.find({
      _id: { $in: relevantOrderIds },
    });

    // 5. Tính toán metrics
    const paidOrders = orders.filter((order) => order.status === "paid");
    const pendingOrders = orders.filter((order) => order.status === "pending");

    const totalRevenue = paidOrders.reduce(
      (sum, order) => sum + order.totalAmount,
      0
    );

    const totalOrders = paidOrders.length;
    const pendingOrdersCount = pendingOrders.length;

    // Tính tổng tickets sold và checked in
    const totalTickets = ticketTypes.reduce(
      (sum, tt) => sum + tt.quantityTotal,
      0
    );
    const ticketsSold = ticketTypes.reduce(
      (sum, tt) => sum + tt.quantitySold,
      0
    );
    const ticketsCheckedIn = ticketTypes.reduce(
      (sum, tt) => sum + tt.quantityCheckedIn,
      0
    );

    // Conversion rate: (paid orders / (paid + failed + cancelled)) * 100
    const allOrders = await Order.find({
      _id: { $in: orderItems.map((item) => item.order._id) },
    });
    const conversionRate =
      allOrders.length > 0
        ? ((paidOrders.length / allOrders.length) * 100).toFixed(2)
        : 0;

    const revenuePerOrder =
      totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

    const avgTicketsPerOrder =
      totalOrders > 0 ? (ticketsSold / totalOrders).toFixed(2) : 0;

    // 6. Ticket breakdown by show
    const ticketBreakdownByShow = await Promise.all(
      shows.map(async (show) => {
        const showTicketTypes = ticketTypes.filter(
          (tt) => tt.show.toString() === show._id.toString()
        );

        const totalShowTickets = showTicketTypes.reduce(
          (sum, tt) => sum + tt.quantityTotal,
          0
        );
        const soldShowTickets = showTicketTypes.reduce(
          (sum, tt) => sum + tt.quantitySold,
          0
        );
        const checkedInShowTickets = showTicketTypes.reduce(
          (sum, tt) => sum + tt.quantityCheckedIn,
          0
        );

        return {
          showId: show._id,
          showName: show.name,
          startTime: show.startTime,
          totalTickets: totalShowTickets,
          soldTickets: soldShowTickets,
          checkedInTickets: checkedInShowTickets,
          availableTickets: totalShowTickets - soldShowTickets,
          selloutPercentage:
            totalShowTickets > 0
              ? ((soldShowTickets / totalShowTickets) * 100).toFixed(2)
              : 0,
        };
      })
    );

    // 7. Ticket breakdown by type
    const ticketBreakdownByType = ticketTypes.map((tt) => {
      const show = shows.find((s) => s._id.toString() === tt.show.toString());
      return {
        ticketTypeId: tt._id,
        ticketTypeName: tt.name,
        showName: show ? show.name : "Unknown",
        price: tt.price,
        totalQuantity: tt.quantityTotal,
        soldQuantity: tt.quantitySold,
        checkedInQuantity: tt.quantityCheckedIn,
        availableQuantity: tt.quantityTotal - tt.quantitySold,
        selloutPercentage:
          tt.quantityTotal > 0
            ? ((tt.quantitySold / tt.quantityTotal) * 100).toFixed(2)
            : 0,
      };
    });

    return {
      success: true,
      eventInfo: {
        eventId: event._id,
        eventName: event.name,
        status: event.status,
        startDate: event.startDate,
        endDate: event.endDate,
      },
      metrics: {
        totalRevenue,
        totalOrders,
        pendingOrders: pendingOrdersCount,
        totalTickets,
        ticketsSold,
        ticketsCheckedIn,
        conversionRate: parseFloat(conversionRate),
        revenuePerOrder,
        avgTicketsPerOrder: parseFloat(avgTicketsPerOrder),
      },
      ticketBreakdown: {
        summary: {
          totalShows: shows.length,
          totalTicketTypes: ticketTypes.length,
          totalTickets,
          soldTickets: ticketsSold,
          checkedInTickets: ticketsCheckedIn,
          availableTickets: totalTickets - ticketsSold,
          overallSelloutPercentage:
            totalTickets > 0
              ? ((ticketsSold / totalTickets) * 100).toFixed(2)
              : 0,
        },
        byShow: ticketBreakdownByShow,
        byType: ticketBreakdownByType,
      },
    };
  } catch (error) {
    console.error("[getDashboardOverview] Error:", error);
    throw error;
  }
};

/**
 * Revenue Analytics - Phân tích doanh thu theo thời gian
 * @param {string} eventId - ID của event
 * @param {Date} startDate - Ngày bắt đầu
 * @param {Date} endDate - Ngày kết thúc
 * @param {string} groupBy - 'day' hoặc 'hour'
 * @returns {Object} - Dữ liệu revenue chart
 */
const getRevenueAnalytics = async (
  eventId,
  startDate = null,
  endDate = null,
  groupBy = "day"
) => {
  try {
    // 1. Kiểm tra event
    const event = await Event.findById(eventId);
    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    // 2. Xác định date range
    const dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }

    // 3. Lấy shows và ticket types
    const shows = await Show.find({ event: eventId });
    const showIds = shows.map((show) => show._id);
    const ticketTypes = await TicketType.find({ show: { $in: showIds } });
    const ticketTypeIds = ticketTypes.map((tt) => tt._id);

    // 4. Lấy orders (chỉ paid)
    const orderItems = await OrderItem.find({
      ticketType: { $in: ticketTypeIds },
    });

    const orderIds = [
      ...new Set(orderItems.map((item) => item.order.toString())),
    ];

    const matchFilter = {
      _id: { $in: orderIds.map((id) => new mongoose.Types.ObjectId(id)) },
      status: "paid",
    };

    if (Object.keys(dateFilter).length > 0) {
      matchFilter.createdAt = dateFilter;
    }

    // 5. Aggregation để group theo ngày hoặc giờ
    let dateFormat;
    if (groupBy === "hour") {
      dateFormat = "%Y-%m-%d %H:00:00";
    } else {
      dateFormat = "%Y-%m-%d";
    }

    const aggregationResult = await Order.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            $dateToString: {
              format: dateFormat,
              date: "$createdAt",
              timezone: "Asia/Ho_Chi_Minh",
            },
          },
          revenue: { $sum: "$totalAmount" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // 6. Tính tổng tickets bán được theo từng ngày/giờ
    // Lấy tất cả tickets với order và createdAt
    const tickets = await Ticket.find({
      order: { $in: orderIds },
    })
      .populate({
        path: "order",
        match: matchFilter,
      })
      .populate("ticketType");

    const validTickets = tickets.filter((t) => t.order !== null);

    // Group tickets theo date
    const ticketsByDate = {};
    validTickets.forEach((ticket) => {
      const date = new Date(ticket.order.createdAt);
      let dateKey;
      if (groupBy === "hour") {
        dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(date.getDate()).padStart(2, "0")} ${String(
          date.getHours()
        ).padStart(2, "0")}:00:00`;
      } else {
        dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(date.getDate()).padStart(2, "0")}`;
      }

      if (!ticketsByDate[dateKey]) {
        ticketsByDate[dateKey] = 0;
      }
      ticketsByDate[dateKey]++;
    });

    // 7. Merge data
    const chartData = aggregationResult.map((item) => ({
      date: item._id,
      revenue: item.revenue,
      orders: item.orderCount,
      tickets: ticketsByDate[item._id] || 0,
    }));

    // 8. Tính summary
    const totalRevenue = aggregationResult.reduce(
      (sum, item) => sum + item.revenue,
      0
    );
    const totalOrders = aggregationResult.reduce(
      (sum, item) => sum + item.orderCount,
      0
    );
    const totalTickets = validTickets.length;

    const avgDailyRevenue =
      chartData.length > 0 ? Math.round(totalRevenue / chartData.length) : 0;

    // Tìm peak date
    const peakDate =
      chartData.length > 0
        ? chartData.reduce((max, item) =>
            item.revenue > max.revenue ? item : max
          )
        : null;

    return {
      success: true,
      groupBy,
      dateRange: {
        start: startDate || event.createdAt,
        end: endDate || new Date(),
      },
      data: chartData,
      summary: {
        totalRevenue,
        totalOrders,
        totalTickets,
        avgDailyRevenue,
        peakDate: peakDate
          ? {
              date: peakDate.date,
              revenue: peakDate.revenue,
              orders: peakDate.orders,
            }
          : null,
      },
    };
  } catch (error) {
    console.error("[getRevenueAnalytics] Error:", error);
    throw error;
  }
};

/**
 * HOME PAGE APIs - Phase 1
 */

/**
 * Increment view count
 */
const incrementEventView = async (eventId) => {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    const error = new Error("Invalid event ID");
    error.status = 400;
    throw error;
  }

  await Event.findByIdAndUpdate(eventId, { $inc: { views: 1 } });

  return { success: true };
};

/**
 * Get featured events for banner (5 events)
 */
const getFeaturedEvents = async () => {
  const now = new Date();

  const events = await Event.find({
    featured: true,
    featuredUntil: { $gte: now },
    status: { $in: ["upcoming", "ongoing"] },
  })
    .sort({ featuredOrder: 1 })
    .limit(5)
    .populate("category", "name")
    .lean();

  // Get min price for each event
  const eventsWithPrice = await Promise.all(
    events.map(async (event) => {
      const shows = await Show.find({ event: event._id }).select("_id");
      const showIds = shows.map((s) => s._id);

      const minPriceResult = await TicketType.aggregate([
        { $match: { show: { $in: showIds } } },
        { $group: { _id: null, minPrice: { $min: "$price" } } },
      ]);

      return {
        id: event._id.toString(),
        name: event.name,
        bannerImageUrl: event.bannerImageUrl,
        startDate: event.startDate,
        location: event.location,
        format: event.format,
        lowestPrice: minPriceResult[0]?.minPrice || null,
        category: event.category
          ? {
              id: event.category._id.toString(),
              name: event.category.name,
            }
          : null,
        views: event.views,
      };
    })
  );

  return eventsWithPrice;
};

/**
 * Get events by category
 */
const getEventsByCategory = async (categoryId, limit = 12) => {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    const error = new Error("Invalid category ID");
    error.status = 400;
    throw error;
  }

  const aggregationPipeline = [
    {
      $match: {
        category: new mongoose.Types.ObjectId(categoryId),
        status: { $in: ["upcoming", "ongoing"] },
      },
    },
    {
      $lookup: {
        from: "shows",
        localField: "_id",
        foreignField: "event",
        as: "shows",
      },
    },
    {
      $lookup: {
        from: "tickettypes",
        localField: "shows._id",
        foreignField: "show",
        as: "tickets",
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        minPrice: { $min: "$tickets.price" },
      },
    },
    {
      $sort: { startDate: 1 },
    },
    {
      $limit: parseInt(limit, 10),
    },
    {
      $project: {
        _id: 1,
        name: 1,
        bannerImageUrl: 1,
        startDate: 1,
        location: 1,
        format: 1,
        minPrice: 1,
        views: 1,
        category: {
          _id: 1,
          name: 1,
        },
      },
    },
  ];

  const events = await Event.aggregate(aggregationPipeline);

  return events.map((event) => ({
    id: event._id.toString(),
    name: event.name,
    bannerImageUrl: event.bannerImageUrl,
    startDate: event.startDate,
    location: event.location,
    format: event.format,
    lowestPrice: event.minPrice,
    views: event.views || 0,
    category: event.category
      ? {
          id: event.category._id.toString(),
          name: event.category.name,
        }
      : null,
  }));
};

/**
 * Get new events (12 latest)
 */
const getNewEvents = async (limit = 12) => {
  const aggregationPipeline = [
    {
      $match: {
        status: { $in: ["upcoming", "ongoing"] },
      },
    },
    {
      $lookup: {
        from: "shows",
        localField: "_id",
        foreignField: "event",
        as: "shows",
      },
    },
    {
      $lookup: {
        from: "tickettypes",
        localField: "shows._id",
        foreignField: "show",
        as: "tickets",
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        minPrice: { $min: "$tickets.price" },
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $limit: parseInt(limit, 10),
    },
    {
      $project: {
        _id: 1,
        name: 1,
        bannerImageUrl: 1,
        startDate: 1,
        location: 1,
        format: 1,
        minPrice: 1,
        views: 1,
        createdAt: 1,
        category: {
          _id: 1,
          name: 1,
        },
      },
    },
  ];

  const events = await Event.aggregate(aggregationPipeline);

  return events.map((event) => ({
    id: event._id.toString(),
    name: event.name,
    bannerImageUrl: event.bannerImageUrl,
    startDate: event.startDate,
    location: event.location,
    format: event.format,
    lowestPrice: event.minPrice,
    views: event.views || 0,
    createdAt: event.createdAt,
    category: event.category
      ? {
          id: event.category._id.toString(),
          name: event.category.name,
        }
      : null,
  }));
};

/**
 * Get events this weekend
 */
const getThisWeekendEvents = async (limit = 12) => {
  // Tính toán thứ 6 và Chủ nhật của tuần này
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

  // Tính thứ 6 (Friday) của tuần này
  const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 7 - dayOfWeek + 5;
  const friday = new Date(now);
  friday.setDate(now.getDate() + daysUntilFriday);
  friday.setHours(0, 0, 0, 0);

  // Tính Chủ nhật (Sunday) của tuần này
  const sunday = new Date(friday);
  sunday.setDate(friday.getDate() + 2);
  sunday.setHours(23, 59, 59, 999);

  const aggregationPipeline = [
    {
      $match: {
        status: { $in: ["upcoming", "ongoing"] },
        startDate: {
          $gte: friday,
          $lte: sunday,
        },
      },
    },
    {
      $lookup: {
        from: "shows",
        localField: "_id",
        foreignField: "event",
        as: "shows",
      },
    },
    {
      $lookup: {
        from: "tickettypes",
        localField: "shows._id",
        foreignField: "show",
        as: "tickets",
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        minPrice: { $min: "$tickets.price" },
      },
    },
    {
      $sort: { startDate: 1 },
    },
    {
      $limit: parseInt(limit, 10),
    },
    {
      $project: {
        _id: 1,
        name: 1,
        bannerImageUrl: 1,
        startDate: 1,
        location: 1,
        format: 1,
        minPrice: 1,
        views: 1,
        category: {
          _id: 1,
          name: 1,
        },
      },
    },
  ];

  const events = await Event.aggregate(aggregationPipeline);

  return events.map((event) => ({
    id: event._id.toString(),
    name: event.name,
    bannerImageUrl: event.bannerImageUrl,
    startDate: event.startDate,
    location: event.location,
    format: event.format,
    lowestPrice: event.minPrice,
    views: event.views || 0,
    category: event.category
      ? {
          id: event.category._id.toString(),
          name: event.category.name,
        }
      : null,
  }));
};

/**
 * Get trending events (by views in last 7 days)
 */
const getTrendingEvents = async (limit = 12) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const aggregationPipeline = [
    {
      $match: {
        status: { $in: ["upcoming", "ongoing"] },
        createdAt: { $gte: sevenDaysAgo },
      },
    },
    {
      $lookup: {
        from: "shows",
        localField: "_id",
        foreignField: "event",
        as: "shows",
      },
    },
    {
      $lookup: {
        from: "tickettypes",
        localField: "shows._id",
        foreignField: "show",
        as: "tickets",
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        minPrice: { $min: "$tickets.price" },
      },
    },
    {
      $sort: { views: -1, startDate: 1 },
    },
    {
      $limit: parseInt(limit, 10),
    },
    {
      $project: {
        _id: 1,
        name: 1,
        bannerImageUrl: 1,
        startDate: 1,
        location: 1,
        format: 1,
        minPrice: 1,
        views: 1,
        category: {
          _id: 1,
          name: 1,
        },
      },
    },
  ];

  const events = await Event.aggregate(aggregationPipeline);

  return events.map((event) => ({
    id: event._id.toString(),
    name: event.name,
    bannerImageUrl: event.bannerImageUrl,
    startDate: event.startDate,
    location: event.location,
    format: event.format,
    lowestPrice: event.minPrice,
    views: event.views || 0,
    category: event.category
      ? {
          id: event.category._id.toString(),
          name: event.category.name,
        }
      : null,
  }));
};

/**
 * Get selling fast events (quantitySold > 70% quantityTotal)
 */
const getSellingFastEvents = async (limit = 12) => {
  // Get all ticket types với sellout >= 70%
  const ticketTypes = await TicketType.aggregate([
    {
      $match: {
        quantitySold: { $gt: 0 },
        $expr: {
          $gte: [{ $divide: ["$quantitySold", "$quantityTotal"] }, 0.7],
        },
      },
    },
    {
      $lookup: {
        from: "shows",
        localField: "show",
        foreignField: "_id",
        as: "show",
      },
    },
    {
      $unwind: "$show",
    },
    {
      $group: {
        _id: "$show.event",
        totalSold: { $sum: "$quantitySold" },
        totalQuantity: { $sum: "$quantityTotal" },
        selloutPercentage: {
          $avg: { $divide: ["$quantitySold", "$quantityTotal"] },
        },
      },
    },
    {
      $sort: { selloutPercentage: -1 },
    },
    {
      $limit: parseInt(limit, 10),
    },
  ]);

  const eventIds = ticketTypes.map((tt) => tt._id);

  if (eventIds.length === 0) {
    return [];
  }

  const aggregationPipeline = [
    {
      $match: {
        _id: { $in: eventIds },
        status: { $in: ["upcoming", "ongoing"] },
      },
    },
    {
      $lookup: {
        from: "shows",
        localField: "_id",
        foreignField: "event",
        as: "shows",
      },
    },
    {
      $lookup: {
        from: "tickettypes",
        localField: "shows._id",
        foreignField: "show",
        as: "tickets",
      },
    },
    {
      $lookup: {
        from: "categories",
        localField: "category",
        foreignField: "_id",
        as: "category",
      },
    },
    {
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        minPrice: { $min: "$tickets.price" },
        totalSold: { $sum: "$tickets.quantitySold" },
        totalQuantity: { $sum: "$tickets.quantityTotal" },
        selloutPercentage: {
          $multiply: [
            {
              $divide: [
                { $sum: "$tickets.quantitySold" },
                { $sum: "$tickets.quantityTotal" },
              ],
            },
            100,
          ],
        },
      },
    },
    {
      $sort: { selloutPercentage: -1 },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        bannerImageUrl: 1,
        startDate: 1,
        location: 1,
        format: 1,
        minPrice: 1,
        views: 1,
        selloutPercentage: 1,
        category: {
          _id: 1,
          name: 1,
        },
      },
    },
  ];

  const events = await Event.aggregate(aggregationPipeline);

  return events.map((event) => ({
    id: event._id.toString(),
    name: event.name,
    bannerImageUrl: event.bannerImageUrl,
    startDate: event.startDate,
    location: event.location,
    format: event.format,
    lowestPrice: event.minPrice,
    views: event.views || 0,
    selloutPercentage: Math.round(event.selloutPercentage || 0),
    category: event.category
      ? {
          id: event.category._id.toString(),
          name: event.category.name,
        }
      : null,
  }));
};

module.exports = {
  cleanupOrphanedData,
  getAllEvents,
  getPendingEvents,
  getEventById,
  getEventsByUserId,
  createEvent,
  updateEvent,
  updateEventStatus,
  deleteEvent,
  getDashboardOverview,
  getRevenueAnalytics,
  // Home page APIs
  incrementEventView,
  getFeaturedEvents,
  getEventsByCategory,
  getNewEvents,
  getThisWeekendEvents,
  getTrendingEvents,
  getSellingFastEvents,
};
