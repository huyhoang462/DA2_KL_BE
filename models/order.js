const mongoose = require("mongoose");

// Helper function để generate order code
const generateOrderCode = () => {
  const timestamp = Date.now().toString(36).toUpperCase(); // Base36 timestamp
  const random = Math.random().toString(36).substring(2, 6).toUpperCase(); // 4 ký tự random
  return `${timestamp}${random}`;
};

const orderSchema = new mongoose.Schema(
  {
    orderCode: {
      type: String,
      unique: true,
    },
    buyer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "paid", "cancelled", "failed"],
      default: "pending",
      required: true,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// Pre-save hook để tự động generate orderCode nếu chưa có
orderSchema.pre("save", function (next) {
  if (!this.orderCode) {
    this.orderCode = generateOrderCode();
  }
  next();
});

orderSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Order", orderSchema);
