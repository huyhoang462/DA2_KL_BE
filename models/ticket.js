// models/ticket.js
const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    ticketType: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TicketType",
      required: true,
    },
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    qrCode: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "checkedIn", "out", "selling", "expired", "cancelled"],
      default: "pending",
      required: true,
    },

    checkinAt: { type: Date },
    lastCheckOutAt: { type: Date },

    // --- THÔNG TIN NFT ---
    blockchainNetwork: { type: String },
    // sparse: true → chỉ enforce unique khi giá trị không phải null/undefined
    // (tránh lỗi duplicate key khi nhiều vé chưa mint đều có contractAddress = null)
    contractAddress: { type: String, unique: true, sparse: true },
    tokenId: { type: String },
    mintStatus: {
      type: String,
      enum: ["unminted", "pending", "minted", "failed"],
      default: "unminted",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

ticketSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
    }
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Ticket", ticketSchema);
