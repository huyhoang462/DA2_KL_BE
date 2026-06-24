const Event = require("../models/event");
const Order = require("../models/order");
const OrderItem = require("../models/orderItem");
const TicketType = require("../models/ticketType");
const Show = require("../models/show");
const Booking = require("../models/booking");

// Hàm tính Cosine Similarity
const cosineSimilarity = (vecA, vecB) => {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

const getRecommendations = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : null;
    
    // 1. Lấy User Embedding nếu user đã login và có lịch sử mua vé
    let userEmbedding = null;
    let userPurchasedEventIds = [];

    if (userId) {
      // Tối ưu hóa: Tìm trực tiếp trong bảng Booking (O(1) lookup)
      const bookings = await Booking.find({ user: userId }).lean();
      
      if (bookings.length > 0) {
        userPurchasedEventIds = [...new Set(bookings.map(b => b.event.toString()))];
        
        // Cold-Start: Cần ít nhất 2 event để tạo user embedding
        if (userPurchasedEventIds.length >= 2) {
          // Lấy embedding của các sự kiện đã mua
          const purchasedEvents = await Event.find({
            _id: { $in: userPurchasedEventIds },
            embedding: { $exists: true, $not: { $size: 0 } }
          });

        if (purchasedEvents.length >= 2) {
          const vectorLength = purchasedEvents[0].embedding.length;
          userEmbedding = new Array(vectorLength).fill(0);
          
          for (const ev of purchasedEvents) {
            for (let i = 0; i < vectorLength; i++) {
              userEmbedding[i] += ev.embedding[i];
            }
          }
          
          // Tính trung bình
          for (let i = 0; i < vectorLength; i++) {
            userEmbedding[i] /= purchasedEvents.length;
          }
        }
        }
      }
    }

    // 2. Truy vấn các Event hợp lệ (đang mở bán)
    // Loại trừ các sự kiện user đã mua để recommend sự kiện mới
    const query = {
      status: { $in: ["approved", "upcoming", "ongoing"] },
    };
    if (userPurchasedEventIds.length > 0) {
      query._id = { $nin: userPurchasedEventIds };
    }

    const events = await Event.find(query).populate("category", "name").lean();
    if (events.length === 0) {
      return res.status(200).json([]);
    }

    // 3. Tính toán điểm số
    // Tìm maxPopularityScore để chuẩn hóa (từ 0 đến 1)
    const maxPopEvent = await Event.findOne().sort({ popularityScore: -1 }).select("popularityScore").lean();
    const maxPopularity = (maxPopEvent && maxPopEvent.popularityScore > 0) ? maxPopEvent.popularityScore : 1;

    const scoredEvents = events.map(event => {
      let simScore = 0;
      if (userEmbedding && event.embedding && event.embedding.length > 0) {
        simScore = cosineSimilarity(userEmbedding, event.embedding);
      }
      
      const popScore = (event.popularityScore || 0) / maxPopularity;
      
      // Nếu không có user embedding (Cold Start), finalScore chỉ dựa vào popularity
      const finalScore = userEmbedding ? (0.8 * simScore + 0.2 * popScore) : popScore;
      
      return {
        ...event,
        id: event._id.toString(),
        finalScore,
        similarityScore: simScore,
        popularityNormalized: popScore
      };
    });

    // 4. Sắp xếp và lấy Top 10
    scoredEvents.sort((a, b) => b.finalScore - a.finalScore);
    let top10 = scoredEvents.slice(0, 10).map(e => {
      delete e._id;
      delete e.__v;
      delete e.embedding; // Xóa mảng số lớn trước khi gửi xuống client
      return e;
    });

    // 5. Đảm bảo ít nhất 4 item (Nếu chưa đủ 4, lấy thêm các sự kiện mới nhất)
    if (top10.length < 4) {
      const top10Ids = top10.map(e => e.id);
      const excludeIds = [...userPurchasedEventIds, ...top10Ids];
      
      const newQuery = {
        status: { $in: ["approved", "upcoming", "ongoing"] },
        _id: { $nin: excludeIds }
      };
      
      const extraEvents = await Event.find(newQuery)
        .populate("category", "name")
        .sort({ createdAt: -1 })
        .limit(4 - top10.length)
        .lean();
        
      const formattedExtra = extraEvents.map(event => {
        const popScore = (event.popularityScore || 0) / maxPopularity;
        return {
          ...event,
          id: event._id.toString(),
          finalScore: popScore,
          similarityScore: 0,
          popularityNormalized: popScore
        };
      }).map(e => {
        delete e._id;
        delete e.__v;
        delete e.embedding;
        return e;
      });
      
      top10 = [...top10, ...formattedExtra];
    }

    // 6. Lấy giá vé thấp nhất (lowestPrice) cho các sự kiện
    const eventIds = top10.map(e => e.id);
    const shows = await Show.find({ event: { $in: eventIds } }).select('_id event').lean();
    const showIds = shows.map(s => s._id);
    const tickets = await TicketType.find({ show: { $in: showIds } }).select('show price').lean();

    const minPriceByEvent = {};
    for (const eventId of eventIds) {
      const eventShowIds = shows.filter(s => s.event.toString() === eventId).map(s => s._id.toString());
      const eventTickets = tickets.filter(t => eventShowIds.includes(t.show.toString()));
      if (eventTickets.length > 0) {
        minPriceByEvent[eventId] = Math.min(...eventTickets.map(t => t.price));
      } else {
        minPriceByEvent[eventId] = 0;
      }
    }

    top10 = top10.map(e => ({
      ...e,
      lowestPrice: minPriceByEvent[e.id] || 0
    }));

    res.status(200).json(top10);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getRecommendations,
};
