const Event = require("../models/event");
const Category = require("../models/category");
const Show = require("../models/show");
const TicketType = require("../models/ticketType");
const SearchQuery = require("../models/searchQuery");
const mongoose = require("mongoose");
const { formatPaginatedResponse } = require("../utils/pagination");
const {
  normalizeSearchText,
  expandQueryVariants,
  buildSearchRegex,
  containsNormalized,
  findSimilarWords,
  calculateSimilarity,
} = require("../utils/searchHelper");

/**
 * Lấy gợi ý search khi user đang gõ (Autocomplete)
 * Hỗ trợ: tiếng Việt không dấu, viết tắt, fuzzy matching
 * @param {string} query - Từ khóa tìm kiếm
 * @returns {Object} { keywords: [], events: [], didYouMean: string|null }
 */
const getSearchSuggestions = async (query) => {
  console.log("[SEARCH SUGGESTIONS]: Query =", query);

  // Nếu query rỗng, return empty
  if (!query || query.trim().length === 0) {
    return { keywords: [], events: [], didYouMean: null };
  }

  const searchQuery = query.trim();

  // Expand query thành các variants (xử lý viết tắt, không dấu)
  const queryVariants = expandQueryVariants(searchQuery);
  console.log("[SEARCH SUGGESTIONS]: Query variants =", queryVariants);

  // Build regex cho tất cả variants
  const searchRegex = buildSearchRegex(queryVariants);

  // Sử dụng $facet để thực hiện 3 loại tìm kiếm song song
  const aggregationPipeline = [
    {
      $facet: {
        // 1. Tìm kiếm chính xác (exact match) - ưu tiên cao nhất
        exactSearch: [
          {
            $match: {
              $or: [
                { name: { $regex: searchRegex } },
                { description: { $regex: searchRegex } },
              ],
              status: { $in: ["approved", "upcoming", "ongoing"] },
            },
          },
          {
            $addFields: {
              // Tính score dựa trên vị trí match và độ chính xác
              score: {
                $cond: [
                  {
                    $regexMatch: {
                      input: { $toLower: "$name" },
                      regex: searchRegex,
                    },
                  },
                  3, // Match trong name = 3 điểm
                  2, // Match trong description = 2 điểm
                ],
              },
              searchType: "exact",
            },
          },
        ],
        // 2. Fuzzy search - tìm các từ tương tự (cho trường hợp typo nhẹ)
        // Lấy tất cả events để so sánh similarity sau
        fuzzySearch: [
          {
            $match: {
              status: { $in: ["approved", "upcoming", "ongoing"] },
            },
          },
          {
            $limit: 100, // Giới hạn để tránh quá tải
          },
          {
            $addFields: {
              score: 0.5, // Score thấp hơn cho fuzzy
              searchType: "fuzzy",
            },
          },
        ],
      },
    },

    // Kết hợp kết quả
    {
      $project: {
        exactResults: "$exactSearch",
        fuzzyResults: "$fuzzySearch",
      },
    },
  ];

  const [rawResults] = await Event.aggregate(aggregationPipeline);
  const exactResults = rawResults.exactResults || [];
  const fuzzyResults = rawResults.fuzzyResults || [];

  console.log(`[SEARCH SUGGESTIONS]: Exact matches = ${exactResults.length}`);

  let finalResults = [];
  let didYouMean = null;

  if (exactResults.length > 0) {
    // Có kết quả chính xác -> dùng luôn
    finalResults = exactResults;
  } else {
    // Không có exact match -> tính similarity cho fuzzy results
    console.log(
      `[SEARCH SUGGESTIONS]: No exact match, running fuzzy matching...`
    );

    const normalizedQuery = normalizeSearchText(searchQuery);

    const scoredResults = fuzzyResults
      .map((event) => {
        const nameSimilarity = calculateSimilarity(
          normalizedQuery,
          normalizeSearchText(event.name)
        );
        const descSimilarity = event.description
          ? calculateSimilarity(
              normalizedQuery,
              normalizeSearchText(event.description)
            )
          : 0;

        const maxSimilarity = Math.max(nameSimilarity, descSimilarity);

        return {
          ...event,
          score: maxSimilarity * 2, // Scale to 0-2 range
          searchType: "fuzzy",
          nameSimilarity,
        };
      })
      .filter((item) => item.score >= 0.4) // Threshold 0.4 (20% similarity)
      .sort((a, b) => b.score - a.score);

    console.log(
      `[SEARCH SUGGESTIONS]: Fuzzy matches = ${scoredResults.length}`
    );

    if (scoredResults.length > 0) {
      finalResults = scoredResults;

      // Suggest "Did you mean?" nếu top result có score cao
      if (scoredResults[0].score >= 0.8 && scoredResults[0].score < 2) {
        didYouMean = scoredResults[0].name;
      }
    }
  }

  // Nếu vẫn không có kết quả -> return popular events
  if (finalResults.length === 0) {
    console.log(
      "[SEARCH SUGGESTIONS]: No matches found, returning popular events"
    );
    const popularEvents = await Event.find({
      status: { $in: ["approved", "upcoming", "ongoing"] },
    })
      .sort({ views: -1 })
      .limit(5)
      .select("name startDate bannerImageUrl location")
      .lean();

    // Join để lấy giá
    const eventsWithPrices = await Promise.all(
      popularEvents.map(async (event) => {
        const show = await Show.findOne({ event: event._id }).lean();
        if (show) {
          const tickets = await TicketType.find({ show: show._id }).lean();
          const prices = tickets.map((t) => t.price);
          event.lowestPrice = prices.length > 0 ? Math.min(...prices) : 0;
        } else {
          event.lowestPrice = 0;
        }
        return event;
      })
    );

    return {
      keywords: [],
      events: eventsWithPrices.map((e) => ({
        _id: e._id.toString(),
        name: e.name,
        startDate: e.startDate,
        bannerImageUrl: e.bannerImageUrl,
        location: e.location,
        lowestPrice: e.lowestPrice,
      })),
      didYouMean: null,
      message: "Không tìm thấy kết quả. Dưới đây là các sự kiện phổ biến.",
    };
  }

  // Tiếp tục pipeline để join prices
  const eventIds = finalResults.map((e) => e._id);
  const priceAggregation = [
    {
      $match: {
        _id: { $in: eventIds },
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
      $addFields: {
        lowestPrice: { $min: "$tickets.price" },
      },
    },
    {
      $group: {
        _id: "$_id",
        name: { $first: "$name" },
        startDate: { $first: "$startDate" },
        bannerImageUrl: { $first: "$bannerImageUrl" },
        location: { $first: "$location" },
        lowestPrice: { $min: "$lowestPrice" },
      },
    },
  ];

  const eventsWithPrices = await Event.aggregate(priceAggregation);

  // Map prices back to results
  const priceMap = {};
  eventsWithPrices.forEach((e) => {
    priceMap[e._id.toString()] = e.lowestPrice || 0;
  });

  finalResults.forEach((e) => {
    e.lowestPrice = priceMap[e._id.toString()] || 0;
  });

  // Sort và limit
  finalResults.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.startDate) - new Date(b.startDate);
  });

  const topEvents = finalResults.slice(0, 5);

  // Suy ra keywords từ tên các events tìm được
  const keywords = extractKeywords(
    topEvents.map((e) => e.name),
    searchQuery
  );

  return {
    keywords,
    events: topEvents.map((event) => ({
      _id: event._id.toString(),
      name: event.name,
      startDate: event.startDate,
      bannerImageUrl: event.bannerImageUrl,
      location: event.location,
      lowestPrice: event.lowestPrice,
    })),
    didYouMean,
  };
};

/**
 * Helper function để suy ra keywords từ event names
 * Hỗ trợ tiếng Việt không dấu (nhac → nhạc)
 * @param {Array} eventNames - Mảng tên sự kiện
 * @param {string} originalQuery - Query gốc từ user
 * @returns {Array} Mảng keywords gợi ý
 */
const extractKeywords = (eventNames, originalQuery) => {
  if (!eventNames || eventNames.length === 0) return [];

  const keywords = new Set();
  const queryLower = originalQuery.toLowerCase().trim();
  const normalizedQuery = normalizeSearchText(originalQuery);

  eventNames.forEach((name) => {
    const nameLower = name.toLowerCase();
    const normalizedName = normalizeSearchText(name);
    const words = nameLower.split(/\s+/);
    const normalizedWords = normalizedName.split(/\s+/);

    // 1. Tìm single words có chứa query (cả có dấu và không dấu)
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const normalizedWord = normalizedWords[i];

      // Check cả 2: có dấu và không dấu
      const matchesOriginal = word.includes(queryLower);
      const matchesNormalized = normalizedWord.includes(normalizedQuery);

      if (
        (matchesOriginal || matchesNormalized) &&
        word !== queryLower &&
        word.length > 2
      ) {
        keywords.add(word); // Luôn return từ có dấu cho đẹp
      }
    }

    // 2. Tìm two-word phrases
    for (let i = 0; i < words.length - 1; i++) {
      const phrase = `${words[i]} ${words[i + 1]}`;
      const normalizedPhrase = `${normalizedWords[i]} ${
        normalizedWords[i + 1]
      }`;

      if (
        (phrase.includes(queryLower) ||
          normalizedPhrase.includes(normalizedQuery)) &&
        phrase !== queryLower
      ) {
        keywords.add(phrase);
      }
    }

    // 3. Tìm three-word phrases
    for (let i = 0; i < words.length - 2; i++) {
      const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const normalizedPhrase = `${normalizedWords[i]} ${
        normalizedWords[i + 1]
      } ${normalizedWords[i + 2]}`;

      if (
        (phrase.includes(queryLower) ||
          normalizedPhrase.includes(normalizedQuery)) &&
        phrase !== queryLower
      ) {
        keywords.add(phrase);
      }
    }

    // 4. Suy luận thông minh - tìm các từ liền kề
    const queryIndex = normalizedWords.findIndex((word) =>
      word.includes(normalizedQuery)
    );
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
    .filter((keyword) => {
      const normalized = normalizeSearchText(keyword);
      return (
        keyword !== queryLower &&
        normalized !== normalizedQuery &&
        keyword.length > 2
      );
    })
    .sort((a, b) => {
      // Ưu tiên phrases ngắn hơn
      const aWords = a.split(" ").length;
      const bWords = b.split(" ").length;
      if (aWords !== bWords) return aWords - bWords;

      // Ưu tiên những từ bắt đầu bằng query (cả có và không dấu)
      const aNormalized = normalizeSearchText(a);
      const bNormalized = normalizeSearchText(b);
      const aStarts =
        a.toLowerCase().startsWith(queryLower) ||
        aNormalized.startsWith(normalizedQuery);
      const bStarts =
        b.toLowerCase().startsWith(queryLower) ||
        bNormalized.startsWith(normalizedQuery);

      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;

      return a.localeCompare(b);
    })
    .slice(0, 5); // Giới hạn 5 keywords
};

/**
 * Lấy top 5 sự kiện popular (hiển thị khi focus search bar)
 * @returns {Object} { popularEvents: [], popularKeywords: [] }
 */
const getPopularSearches = async () => {
  try {
    // Lấy top 5 events có view count cao nhất trong 7 ngày qua
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const popularEvents = await Event.aggregate([
      {
        $match: {
          status: { $in: ["approved", "upcoming", "ongoing"] },
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      // Join để lấy ticket info và price
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
          as: "ticketTypes",
        },
      },
      {
        $lookup: {
          from: "tickets",
          let: { showId: "$shows._id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$show", "$$showId"] },
                status: { $in: ["sold", "checked_in"] },
              },
            },
            { $count: "count" },
          ],
          as: "soldTickets",
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
          ticketsSoldCount: {
            $ifNull: [{ $arrayElemAt: ["$soldTickets.count", 0] }, 0],
          },
          minPrice: { $min: "$ticketTypes.price" },
        },
      },
      {
        $group: {
          _id: "$_id",
          name: { $first: "$name" },
          bannerImageUrl: { $first: "$bannerImageUrl" },
          startDate: { $first: "$startDate" },
          location: { $first: "$location" },
          format: { $first: "$format" },
          views: { $first: "$views" },
          ticketsSoldCount: { $sum: "$ticketsSoldCount" },
          lowestPrice: { $min: "$minPrice" },
          category: { $first: "$category" },
        },
      },
      // Calculate trending score: views * 0.6 + tickets * 0.4
      {
        $addFields: {
          trendingScore: {
            $add: [
              { $multiply: [{ $ifNull: ["$views", 0] }, 0.6] },
              { $multiply: ["$ticketsSoldCount", 0.4] },
            ],
          },
        },
      },
      { $sort: { trendingScore: -1 } },
      { $limit: 5 },
      {
        $project: {
          _id: 1,
          name: 1,
          bannerImageUrl: 1,
          startDate: 1,
          location: 1,
          format: 1,
          lowestPrice: 1,
          views: 1,
          ticketsSoldCount: 1,
          trendingScore: { $round: ["$trendingScore", 1] },
          category: {
            _id: 1,
            name: 1,
          },
        },
      },
    ]);

    // Transform to match home page format
    const formattedEvents = popularEvents.map((event) => ({
      id: event._id.toString(),
      name: event.name,
      bannerImageUrl: event.bannerImageUrl,
      startDate: event.startDate,
      location: event.location,
      format: event.format,
      lowestPrice: event.lowestPrice || 0,
      views: event.views || 0,
      ticketsSoldCount: event.ticketsSoldCount,
      trendingScore: event.trendingScore,
      category: event.category
        ? {
            id: event.category._id.toString(),
            name: event.category.name,
          }
        : null,
    }));

    // Popular keywords - lấy từ search queries thực tế
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const popularKeywords = await SearchQuery.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo },
          resultCount: { $gt: 0 }, // Chỉ lấy queries có kết quả
        },
      },
      {
        $group: {
          _id: "$query",
          count: { $sum: 1 },
        },
      },
      {
        $sort: { count: -1 },
      },
      {
        $limit: 10,
      },
      {
        $project: {
          _id: 0,
          keyword: "$_id",
          count: 1,
        },
      },
    ]);

    return {
      popularEvents: formattedEvents,
      popularKeywords: popularKeywords.length > 0 ? popularKeywords : [],
    };
  } catch (error) {
    console.error("[ERROR] getPopularSearches:", error);
    return { popularEvents: [], popularKeywords: [] };
  }
};

/**
 * Tìm kiếm sự kiện với filters đầy đủ (Search Results Page)
 * @param {Object} queryParams - Query parameters từ request
 * @returns {Object} { success, data, pagination, filters }
 */
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

  console.log("[SEARCH EVENTS]: Params =", queryParams);

  // --- BƯỚC 1: XÂY DỰNG ĐIỀU KIỆN LỌC BAN ĐẦU ($match) ---
  const initialMatchStage = {
    status: { $in: ["approved", "upcoming", "ongoing"] },
  };

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
        $nin: [1, 48, 79],
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
      initialMatchStage.startDate.$lte = new Date(endDate);
    }
  }

  // --- BƯỚC 2: XỬ LÝ QUERY TEXT (Fuzzy search) ---
  let textMatchStage = {};
  let shouldUseFuzzy = false;

  if (q) {
    // Expand query thành các variants
    const queryVariants = expandQueryVariants(q);
    console.log("[SEARCH EVENTS]: Query variants =", queryVariants);

    // Build regex cho tất cả variants
    const searchRegex = buildSearchRegex(queryVariants);

    textMatchStage = {
      $or: [
        { name: { $regex: searchRegex } },
        { description: { $regex: searchRegex } },
      ],
    };

    // Nếu query ngắn hoặc có dấu hiệu viết tắt -> enable fuzzy
    if (q.length <= 4 || queryVariants.length > 1) {
      shouldUseFuzzy = true;
    }
  }

  // --- BƯỚC 3: XÂY DỰNG PIPELINE ---
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

    // --- BƯỚC 4: ÁP DỤNG CÁC BỘ LỌC CÒN LẠI ($match) ---
    {
      $match: {
        // Lọc theo từ khóa tìm kiếm với fuzzy support
        ...textMatchStage,

        // Lọc theo khoảng giá
        ...((minPrice != null || maxPrice != null) && {
          minPrice: {
            ...(minPrice != null && { $gte: parseFloat(minPrice) }),
            ...(maxPrice != null && { $lte: parseFloat(maxPrice) }),
          },
        }),
      },
    },

    // --- Thêm similarity score nếu có query ---
    ...(q && shouldUseFuzzy
      ? [
          {
            $addFields: {
              searchScore: {
                $cond: [
                  {
                    $regexMatch: {
                      input: { $toLower: "$name" },
                      regex: buildSearchRegex(expandQueryVariants(q)),
                    },
                  },
                  10, // High score for name match
                  5, // Lower score for description match
                ],
              },
            },
          },
        ]
      : []),
  ];

  // --- BƯỚC 5: SẮP XẾP ---
  let sortStage = {};
  switch (sortBy) {
    case "price_asc":
      sortStage = {
        $sort: {
          ...(q && shouldUseFuzzy && { searchScore: -1 }),
          minPrice: 1,
        },
      };
      break;
    case "price_desc":
      sortStage = {
        $sort: {
          ...(q && shouldUseFuzzy && { searchScore: -1 }),
          minPrice: -1,
        },
      };
      break;
    case "date_desc":
      sortStage = {
        $sort: {
          ...(q && shouldUseFuzzy && { searchScore: -1 }),
          startDate: -1,
        },
      };
      break;
    case "relevance":
      // Sort by search score only
      sortStage = {
        $sort: {
          searchScore: -1,
          views: -1,
          startDate: 1,
        },
      };
      break;
    default: // date_asc
      sortStage = {
        $sort: {
          ...(q && shouldUseFuzzy && { searchScore: -1 }),
          startDate: 1,
        },
      };
      break;
  }
  aggregationPipeline.push(sortStage);

  // --- BƯỚC 6: PHÂN TRANG VÀ ĐẾM ($facet) ---
  const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);
  const facetStage = {
    $facet: {
      // Nhánh 1: Lấy tổng số kết quả (sau khi đã lọc)
      metadata: [{ $count: "total" }],
      // Nhánh 2: Lấy dữ liệu của trang hiện tại
      data: [
        { $skip: skip },
        { $limit: parseInt(limit, 10) },
        // Chọn các trường muốn trả về cho client
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
          },
        },
      ],
    },
  };
  aggregationPipeline.push(facetStage);

  // --- BƯỚC 7: Thực thi ---
  const results = await Event.aggregate(aggregationPipeline);

  // Sử dụng formatPaginatedResponse utility
  const formattedResponse = formatPaginatedResponse(results, page, limit);

  // --- Nếu không có kết quả và có query -> suggest related events ---
  let didYouMean = null;
  if (formattedResponse.data.length === 0 && q) {
    console.log("[SEARCH EVENTS]: No results, finding similar events...");

    // Tìm events có tên tương tự
    const allEvents = await Event.find({
      status: { $in: ["approved", "upcoming", "ongoing"] },
    })
      .limit(50)
      .select("name")
      .lean();

    const normalizedQuery = normalizeSearchText(q);
    const similarEvents = findSimilarWords(
      normalizedQuery,
      allEvents.map((e) => e.name),
      0.4
    );

    if (similarEvents.length > 0) {
      didYouMean = similarEvents[0].text;
    }
  }

  // --- BƯỚC 8: Lấy available categories cho filters UI ---
  const availableCategories = await Category.aggregate([
    {
      $lookup: {
        from: "events",
        localField: "_id",
        foreignField: "category",
        as: "events",
      },
    },
    {
      $addFields: {
        eventCount: { $size: "$events" },
      },
    },
    {
      $match: {
        eventCount: { $gt: 0 },
      },
    },
    {
      $project: {
        _id: 1,
        name: 1,
        slug: 1,
        count: "$eventCount",
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  // Transform data
  const events = formattedResponse.data.map((event) => ({
    id: event._id.toString(),
    name: event.name,
    bannerImageUrl: event.bannerImageUrl,
    startDate: event.startDate,
    location: event.location,
    format: event.format,
    lowestPrice: event.minPrice || 0,
    category: event.category
      ? {
          _id: event.category._id.toString(),
          name: event.category.name,
          slug: event.category.slug,
        }
      : null,
  }));

  return {
    success: true,
    data: events,
    pagination: formattedResponse.pagination,
    filters: {
      appliedFilters: {
        ...(q && { q }),
        ...(category && { category }),
        ...(city !== undefined && city !== null && { city }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
        ...(minPrice && { minPrice }),
        ...(maxPrice && { maxPrice }),
        sortBy,
      },
      availableCategories,
    },
    ...(didYouMean && { didYouMean }),
    ...(formattedResponse.data.length === 0 &&
      q && {
        message: didYouMean
          ? `Không tìm thấy "${q}". Có phải bạn muốn tìm "${didYouMean}"?`
          : `Không tìm thấy kết quả cho "${q}". Thử tìm kiếm với từ khóa khác.`,
      }),
  };
};

/**
 * Track search query vào database để phân tích
 * @param {string} query - Query từ user
 * @param {number} resultCount - Số kết quả tìm được
 * @param {ObjectId} userId - User ID (optional)
 */
const trackSearchQuery = async (query, resultCount = 0, userId = null) => {
  try {
    const normalizedQuery = normalizeSearchText(query);

    await SearchQuery.create({
      query: query.toLowerCase().trim(),
      normalizedQuery,
      resultCount,
      userId,
    });

    console.log(`[TRACK] Query: "${query}" (${resultCount} results)`);
  } catch (error) {
    console.error("[TRACK ERROR]:", error.message);
    // Không throw error để không ảnh hưởng đến search
  }
};

module.exports = {
  getSearchSuggestions,
  getPopularSearches,
  searchEvents,
  trackSearchQuery,
};
