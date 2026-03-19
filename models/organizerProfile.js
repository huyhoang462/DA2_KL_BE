const mongoose = require("mongoose");

const organizerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // Mỗi user chỉ có 1 organizer profile
    },

    // Thông tin công ty/tổ chức
    companyName: {
      type: String,
      trim: true,
    },

    taxId: {
      type: String, // Mã số thuế (optional)
      trim: true,
    },

    businessLicense: {
      type: String, // URL giấy phép kinh doanh (từ Cloudinary)
    },

    // Thông tin thanh toán (để nhận tiền từ bán vé)
    bankAccount: {
      bankName: String,
      accountNumber: String,
      accountHolder: String,
    },

    // Mô tả/giới thiệu về organizer
    bio: {
      type: String,
      maxlength: 1000,
    },

    // Social media links
    website: String,
    facebook: String,
    instagram: String,
    twitter: String,

    // Verification status (cho tương lai nếu cần admin duyệt)
    verificationStatus: {
      type: String,
      enum: ["incomplete", "pending", "approved", "rejected"],
      default: "incomplete",
    },

    verificationNote: String, // Ghi chú từ admin khi duyệt
    verifiedAt: Date,
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Stats (optional)
    totalEvents: { type: Number, default: 0 },
    totalTicketsSold: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

// Index
organizerProfileSchema.index({ user: 1 });
organizerProfileSchema.index({ verificationStatus: 1 });

// Transform JSON
organizerProfileSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("OrganizerProfile", organizerProfileSchema);
