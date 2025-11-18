const Event = require("../models/event");
const User = require("../models/user");
const Show = require("../models/show");
const TicketType = require("../models/ticketType");
const Category = require("../models/category");
const PayoutMethod = require("../models/payoutMethod");
const mongoose = require("mongoose");

const getAllEvents = async () => {
  const events = await Event.find({});
  return events;
};

const getEventById = async (eventId) => {
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    const error = new Error("Invalid event ID format");
    error.status = 400;
    throw error;
  }

  // 2. Xây dựng pipeline cho Aggregation
  const aggregationPipeline = [
    // --- STAGE 1: $match ---
    // Tìm chính xác document Event mà chúng ta muốn
    {
      $match: { _id: new mongoose.Types.ObjectId(eventId) },
    },

    // --- STAGE 2: $lookup (Lấy các Shows) ---
    // Tương đương LEFT JOIN với collection 'shows'
    {
      $lookup: {
        from: "shows", // Tên collection của model Show
        localField: "_id", // Trường trong Events (bảng hiện tại)
        foreignField: "event", // Trường trong 'shows' để join
        as: "shows", // Tên của mảng mới chứa kết quả join
      },
    },

    // --- STAGE 3: $lookup (Lấy các TicketTypes cho TẤT CẢ shows) ---
    // Trick ở đây: chúng ta sẽ lookup một lần duy nhất
    {
      $lookup: {
        from: "tickettypes", // Tên collection của TicketType
        localField: "shows._id", // Lấy _id từ tất cả các object trong mảng 'shows'
        foreignField: "show",
        as: "allTicketTypes", // Tên mảng tạm thời chứa tất cả ticket types
      },
    },

    // --- STAGE 4: $addFields (Gắn TicketTypes vào đúng Show của nó) ---
    // Đây là bước "ma thuật" để xử lý dữ liệu
    {
      $addFields: {
        shows: {
          $map: {
            // Lặp qua từng 'show' trong mảng 'shows'
            input: "$shows",
            as: "show",
            in: {
              $mergeObjects: [
                // Gộp các trường của show hiện tại...
                "$$show",
                {
                  // ...với một object mới chứa trường 'tickets'
                  tickets: {
                    $filter: {
                      // Lọc trong mảng 'allTicketTypes'
                      input: "$allTicketTypes",
                      as: "ticket",
                      cond: { $eq: ["$$ticket.show", "$$show._id"] }, // Điều kiện: ticket.show === show._id
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
    // Chọn các trường muốn trả về, loại bỏ các trường tạm
    {
      $project: {
        allTicketTypes: 0, // 0 nghĩa là loại bỏ
        // Nếu muốn đổi tên trường, ví dụ:
        // creatorId: '$creator',
      },
    },

    // --- STAGE 6: $lookup (Populate các trường tham chiếu khác như creator, category) ---
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

    // Unwind để biến mảng 1 phần tử thành object
    { $unwind: "$creator" },
    { $unwind: "$category" },
  ];

  // 3. Thực thi Aggregation
  const results = await Event.aggregate(aggregationPipeline);

  // 4. Xử lý kết quả
  if (results.length === 0) {
    return null; // Không tìm thấy event
  }

  const event = results[0]; // aggregate luôn trả về một mảng

  // Custom transform to match toJSON (nếu cần)
  event.id = event._id.toString();
  delete event._id;
  // ... dọn dẹp các trường khác nếu muốn

  return event;
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

    const newPayoutMethod = new PayoutMethod({
      ...payoutMethodData,
      user: creator._id,
    });
    const savedPayoutMethod = await newPayoutMethod.save({ session });

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
      payoutMethod: savedPayoutMethod._id,
      status: status || "draft",
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
module.exports = { getAllEvents, getEventById, createEvent, deleteEvent };
