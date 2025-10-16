// models/ticket.js
const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    // --- LIÊN KẾT DỮ LIỆU ---
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

    // --- THÔNG TIN VÉ ---
    qrCode: {
      // Sẽ được sinh ra tự động
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["pending", "checkedIn", "out", "expired", "cancelled"],
      default: "pending",
      required: true,
    },

    // --- THÔNG TIN CHECK-IN/OUT ---
    checkinAt: { type: Date }, // Thời điểm check-in
    lastCheckOutAt: { type: Date }, // Thời điểm ra ngoài gần nhất (để quản lý lượt ra vào)

    // --- THÔNG TIN NFT (để dành) ---
    blockchainNetwork: { type: String },
    contractAddress: { type: String },
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
  }
);

ticketSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Ticket", ticketSchema);
