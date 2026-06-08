const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    // Thông tin tác giả
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    authorType: {
      type: String,
      enum: ["organizer", "user"],
      default: "organizer",
      // 'organizer' = đăng quảng cáo event
      // 'user' = đăng bán vé (future marketplace)
    },

    //
    // title: {
    //   type: String,
    //   required: true,
    //   minlength: 10,
    //   maxlength: 200,
    //   trim: true,
    // },
    content: {
      type: String,
      required: true,
      minlength: 10,
      maxlength: 5000,
    },
    images: [
      {
        type: String, // URLs từ Cloudinary
      },
    ],

    // Liên kết
    relatedEvent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
    },

    // 🔮 FUTURE: Cho marketplace bán lại vé NFT
    relatedTickets: [
      {
        ticket: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Ticket",
          required: true,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],

    // Địa chỉ ví crypto của người bán (dùng cho marketplace_listing)
    walletAddress: {
      type: String,
      trim: true,
    },

    // Phân loại
    postType: {
      type: String,
      enum: ["event_promotion", "marketplace_listing"],
      default: "event_promotion",
      // 'event_promotion' = Organizer quảng cáo event
      // 'marketplace_listing' = User bán lại vé (future)
    },
    // price: moved into relatedTicket[].price (each ticket can have its own price)

    // category: {
    //   type: String,
    //   enum: ["announcement", "discussion", "question"],
    //   default: "announcement",
    // },

    // Trạng thái & Kiểm duyệt
    status: {
      type: String,
      enum: ["pending", "published", "rejected", "removed"],
      default: "pending",
    },

    moderationStatus: {
      type: String,
      enum: ["auto_approved", "flagged", "reviewed"],
      default: "auto_approved",
    },

    rejectionReason: String,
    moderatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    moderatedAt: Date,

    // Metrics (chỉ đếm, không có tương tác like)
    viewCount: { type: Number, default: 0 },
    commentCount: { type: Number, default: 0 },
    reportCount: { type: Number, default: 0 },

    publishedAt: Date,
  },
  {
    timestamps: true,
  },
);

// Indexes cho performance
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ relatedEvent: 1 });
postSchema.index({ status: 1, publishedAt: -1 });
postSchema.index({ postType: 1, status: 1 });
postSchema.index({ "relatedTickets.ticket": 1 }); // Marketplace listing tickets

// Transform khi trả về JSON
postSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
    }
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Post", postSchema);
