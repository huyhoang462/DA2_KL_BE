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
      enum: ["pending", "checkedIn", "out", "expired", "cancelled"],
      default: "pending",
      required: true,
    },

    checkinAt: { type: Date },
    lastCheckOutAt: { type: Date },

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
