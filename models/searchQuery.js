const mongoose = require("mongoose");

/**
 * Model để tracking search queries từ users
 * Dùng để hiển thị popular keywords và phân tích xu hướng
 */
const searchQuerySchema = new mongoose.Schema(
  {
    query: {
      type: String,
      required: true,
      trim: true,
      lowercase: true, // Tự động lowercase để dễ group
    },
    normalizedQuery: {
      type: String,
      required: true,
      trim: true,
    },
    resultCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      // Không required vì có thể là anonymous user
    },
    clickedEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      // Tracking xem user có click vào event nào không
    },
  },
  {
    timestamps: true,
  }
);

// Index để query nhanh
searchQuerySchema.index({ normalizedQuery: 1 });
searchQuerySchema.index({ createdAt: -1 });
searchQuerySchema.index({ query: 1, createdAt: -1 });

// Compound index cho aggregation
searchQuerySchema.index({ normalizedQuery: 1, createdAt: -1 });

module.exports = mongoose.model("SearchQuery", searchQuerySchema);
