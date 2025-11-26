const Event = require("../models/event");
const User = require("../models/user");
const Show = require("../models/show");
const TicketType = require("../models/ticketType");
const Category = require("../models/category");
const PayoutMethod = require("../models/payoutMethod");
const mongoose = require("mongoose");

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

const getSearchSuggestions = async (query) => {
  console.log("[QUERY]: ", query);

  if (!query || query.trim().length === 0) {
    return { keywords: [], events: [] };
  }

  const searchQuery = query.trim();

  // Sử dụng $facet để thực hiện 2 loại tìm kiếm song song
  const aggregationPipeline = [
    {
      $facet: {
        // Tìm kiếm chính xác (exact match) - ưu tiên cao hơn
        exactSearch: [
          {
            $match: {
              $or: [
                { name: { $regex: `^${searchQuery}`, $options: "i" } }, // Bắt đầu bằng query
                { description: { $regex: `^${searchQuery}`, $options: "i" } },
              ],
              // status: { $in: ["upcoming", "ongoing"] },
            },
          },
          {
            $addFields: {
              score: 2, // Điểm cao cho exact match
              searchType: "exact",
            },
          },
        ],
        // Tìm kiếm chứa (contains) - ưu tiên thấp hơn
        containsSearch: [
          {
            $match: {
              $or: [
                { name: { $regex: searchQuery, $options: "i" } },
                { description: { $regex: searchQuery, $options: "i" } },
              ],
              // status: { $in: ["upcoming", "ongoing"] },
            },
          },
          {
            $addFields: {
              score: 1, // Điểm thấp hơn cho contains
              searchType: "contains",
            },
          },
        ],
      },
    },

    // Kết hợp kết quả từ cả hai tìm kiếm
    {
      $project: {
        combinedResults: {
          $concatArrays: ["$exactSearch", "$containsSearch"],
        },
      },
    },

    // Unwind để xử lý từng document
    {
      $unwind: "$combinedResults",
    },

    // Replace root để làm phẳng structure
    {
      $replaceRoot: { newRoot: "$combinedResults" },
    },

    // Group để loại bỏ trùng lặp, giữ score cao nhất
    {
      $group: {
        _id: "$_id",
        name: { $first: "$name" },
        startDate: { $first: "$startDate" },
        bannerImageUrl: { $first: "$bannerImageUrl" },
        description: { $first: "$description" },
        score: { $max: "$score" }, // Lấy score cao nhất nếu trùng
        searchType: { $first: "$searchType" },
      },
    },

    // Sắp xếp theo score (cao nhất trước) rồi đến startDate
    {
      $sort: { score: -1, startDate: 1 },
    },

    // Giới hạn 5 kết quả
    {
      $limit: 5,
    },

    // Chỉ lấy các trường cần thiết
    {
      $project: {
        _id: 1,
        name: 1,
        startDate: 1,
        bannerImageUrl: 1,
      },
    },
  ];

  const events = await Event.aggregate(aggregationPipeline);

  // Suy ra keywords từ tên các events tìm được
  const keywords = extractKeywords(
    events.map((e) => e.name),
    searchQuery
  );

  return {
    keywords,
    events: events.map((event) => ({
      _id: event._id.toString(),
      name: event.name,
      startDate: event.startDate,
      bannerImageUrl: event.bannerImageUrl,
    })),
  };
};

// Helper function để suy ra keywords - CẢI TIẾN
const extractKeywords = (eventNames, originalQuery) => {
  if (!eventNames || eventNames.length === 0) return [];

  const keywords = new Set();
  const queryLower = originalQuery.toLowerCase();

  eventNames.forEach((name) => {
    const nameLower = name.toLowerCase();
    const words = nameLower.split(/\s+/);

    // 1. Tìm single words có chứa query
    words.forEach((word) => {
      if (word.includes(queryLower) && word !== queryLower) {
        keywords.add(word);
      }
    });

    // 2. Tìm two-word phrases có chứa query
    for (let i = 0; i < words.length - 1; i++) {
      const twoWordPhrase = `${words[i]} ${words[i + 1]}`;
      if (twoWordPhrase.includes(queryLower) && twoWordPhrase !== queryLower) {
        keywords.add(twoWordPhrase);
      }
    }

    // 3. Tìm three-word phrases có chứa query
    for (let i = 0; i < words.length - 2; i++) {
      const threeWordPhrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      if (
        threeWordPhrase.includes(queryLower) &&
        threeWordPhrase !== queryLower
      ) {
        keywords.add(threeWordPhrase);
      }
    }

    // 4. Suy luận thông minh - tìm các từ liền kề với query
    const queryIndex = words.findIndex((word) => word.includes(queryLower));
    if (queryIndex !== -1) {
      // Từ trước query
      if (queryIndex > 0) {
        keywords.add(`${words[queryIndex - 1]} ${words[queryIndex]}`);
      }
      // Từ sau query
      if (queryIndex < words.length - 1) {
        keywords.add(`${words[queryIndex]} ${words[queryIndex + 1]}`);
      }
    }
  });

  // Lọc và sắp xếp keywords theo độ liên quan
  return Array.from(keywords)
    .filter((keyword) => keyword !== queryLower)
    .sort((a, b) => {
      // Ưu tiên phrases ngắn hơn
      const aWords = a.split(" ").length;
      const bWords = b.split(" ").length;
      if (aWords !== bWords) return aWords - bWords;

      // Ưu tiên những từ bắt đầu bằng query
      const aStartsWithQuery = a.toLowerCase().startsWith(queryLower);
      const bStartsWithQuery = b.toLowerCase().startsWith(queryLower);
      if (aStartsWithQuery && !bStartsWithQuery) return -1;
      if (!aStartsWithQuery && bStartsWithQuery) return 1;

      return a.localeCompare(b);
    })
    .slice(0, 5); // Giới hạn 5 keywords như yêu cầu
};

const searchEvents = async (queryParams) => {
  const {
    q,
    category,
    city,
    startDate,
    endDate,
    minPrice,
    maxPrice,
    sortBy = "date_asc",
    page = 1,
    limit = 12,
  } = queryParams;

  // --- BƯỚC 1: XÂY DỰNG ĐIỀU KIỆN LỌC BAN ĐẦU ($match) ---
  // Giai đoạn này lọc trên collection `Events` trước khi join
  // Điều này giúp giảm đáng kể số lượng document cần xử lý ở các bước sau.
  const initialMatchStage = {};

  // Lọc theo trạng thái, chỉ lấy sự kiện sắp/đang diễn ra
  // initialMatchStage.status = { $in: ['approved', 'upcoming', 'ongoing'] };
  // Xử lý mảng category IDs
  if (category) {
    let categoryIds = [];
    if (Array.isArray(category)) {
      categoryIds = category
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    } else if (
      typeof category === "string" &&
      mongoose.Types.ObjectId.isValid(category)
    ) {
      categoryIds = [new mongoose.Types.ObjectId(category)];
    }

    if (categoryIds.length > 0) {
      initialMatchStage.category = { $in: categoryIds };
    }
  }

  // Xử lý city với logic đặc biệt cho code = 0
  if (city !== undefined && city !== null) {
    let cityValue = city;

    // Convert string thành số nếu cần
    if (typeof city === "string" && !isNaN(city)) {
      cityValue = parseInt(city, 10);
    }

    if (cityValue === 0) {
      // Code = 0 nghĩa là "Khác" - lấy tất cả trừ TP.HCM (79), Hà Nội (1), Đà Nẵng (48)
      initialMatchStage["location.province.code"] = {
        $nin: [1, 48, 79], // Not in: không bao gồm 3 thành phố chính
      };
    } else {
      // Code cụ thể - lấy chính xác thành phố đó
      initialMatchStage["location.province.code"] = cityValue;
    }
  }

  // Lọc theo khoảng thời gian sự kiện
  if (startDate || endDate) {
    initialMatchStage.startDate = {};
    if (startDate) {
      initialMatchStage.startDate.$gte = new Date(startDate);
    }
    if (endDate) {
      // Tìm các sự kiện bắt đầu trước ngày kết thúc người dùng chọn
      initialMatchStage.startDate.$lte = new Date(endDate);
    }
  }

  // --- BƯỚC 2: XÂY DỰNG PIPELINE ---
  const aggregationPipeline = [
    // Lọc trước các sự kiện phù hợp nhất có thể
    { $match: initialMatchStage },

    // --- Join với Shows và TicketTypes để lấy thông tin giá vé ---
    {
      $lookup: {
        from: "shows",
        localField: "_id",
        foreignField: "event",
        as: "shows",
      },
    },
    {
      $unwind: { path: "$shows", preserveNullAndEmptyArrays: true },
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
    // --- Tính toán giá vé thấp nhất cho mỗi sự kiện ---
    {
      $addFields: {
        minPrice: { $min: "$tickets.price" },
      },
    },

    // --- Gom nhóm lại thành document Event duy nhất ---
    {
      $group: {
        _id: "$_id",
        doc: { $first: "$$ROOT" },
        minPrice: { $first: "$minPrice" },
      },
    },
    {
      $replaceRoot: {
        newRoot: { $mergeObjects: ["$doc", { minPrice: "$minPrice" }] },
      },
    },

    // --- BƯỚC 3: ÁP DỤNG CÁC BỘ LỌC CÒN LẠI ($match) ---
    {
      $match: {
        // Lọc theo từ khóa tìm kiếm (dùng $regex)
        ...(q && {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { description: { $regex: q, $options: "i" } },
            { "organizer.name": { $regex: q, $options: "i" } },
          ],
        }),

        // Lọc theo khoảng giá
        ...((minPrice != null || maxPrice != null) && {
          minPrice: {
            ...(minPrice != null && { $gte: parseFloat(minPrice) }),
            ...(maxPrice != null && { $lte: parseFloat(maxPrice) }),
          },
        }),
      },
    },
  ];

  // --- BƯỚC 4: SẮP XẾP ---
  let sortStage = {};
  switch (sortBy) {
    case "price_asc":
      sortStage = { $sort: { minPrice: 1 } };
      break;
    case "price_desc":
      sortStage = { $sort: { minPrice: -1 } };
      break;
    case "date_desc":
      sortStage = { $sort: { startDate: -1 } };
      break;
    default: // date_asc
      sortStage = { $sort: { startDate: 1 } };
      break;
  }
  aggregationPipeline.push(sortStage);

  // --- BƯỚC 5: PHÂN TRANG VÀ ĐẾM ($facet) ---
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const facetStage = {
    $facet: {
      // Nhánh 1: Lấy tổng số kết quả (sau khi đã lọc)
      metadata: [{ $count: "total" }],
      // Nhánh 2: Lấy dữ liệu của trang hiện tại
      data: [
        { $skip: skip },
        { $limit: parseInt(limit, 10) },
        // Chọn các trường muốn trả về cho client - SỬA LẠI CHỌN CHỈ INCLUSION
        {
          $project: {
            _id: 1,
            name: 1,
            bannerImageUrl: 1,
            startDate: 1,
            location: 1,
            format: 1,
            minPrice: 1,
            category: 1,
            // Bỏ hết exclusion (shows: 0, tickets: 0)
          },
        },
      ],
    },
  };
  aggregationPipeline.push(facetStage);

  // --- Thực thi ---
  const results = await Event.aggregate(aggregationPipeline);

  const events = results[0].data;
  const totalEvents = results[0].metadata[0] ? results[0].metadata[0].total : 0;
  const totalPages = Math.ceil(totalEvents / parseInt(limit, 10));

  return {
    events: events.map((event) => ({
      id: event._id.toString(),
      name: event.name,
      bannerImageUrl: event.bannerImageUrl,
      startDate: event.startDate,
      location: event.location,
      format: event.format,
      lowestPrice: event.minPrice,
      category: event.category,
    })),
    pagination: {
      currentPage: parseInt(page, 10),
      totalPages,
      totalEvents,
      limit: parseInt(limit, 10),
    },
  };
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
    location: event.location,
    format: event.format,
    status: event.status,
    totalTicketsSold: event.totalTicketsSold || 0,
    totalTicketsAvailable: event.totalTicketsAvailable || 0,
  }));
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

module.exports = {
  cleanupOrphanedData,
  getSearchSuggestions,
  searchEvents,
  getAllEvents,
  getEventById,
  getEventsByUserId,
  createEvent,
  deleteEvent,
};
