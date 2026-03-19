const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    fullName: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
    },

    // 👉 Thêm trường walletAddress
    walletAddress: {
      type: String,
      trim: true,
      unique: true, // nếu mỗi user chỉ có 1 ví (có thể bỏ nếu không cần)
      sparse: true, // cho phép nhiều user chưa có walletAddress
    },

    role: {
      type: String,
      enum: ["customer", "organizer", "admin", "staff", "user"],
      default: "customer",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "banned", "suspended"],
      default: "active",
      required: true,
    },
    banReason: {
      type: String,
    },
    bannedAt: {
      type: Date,
    },
    bannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resetPasswordCode: {
      type: String,
    },
    resetPasswordExpires: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
    delete returnedObject.passwordHash;
  },
});

module.exports = mongoose.model("User", userSchema);
