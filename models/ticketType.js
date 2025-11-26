const mongoose = require("mongoose");

const ticketTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantityTotal: { type: Number, required: true, min: 1 },
    quantitySold: { type: Number, required: true, default: 0 },
    minPurchase: { type: Number, required: true, default: 1 },
    maxPurchase: { type: Number, required: true, default: 10 },
    description: { type: String },
    show: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Show",
      required: true,
    },
  },
  { timestamps: true }
);

ticketTypeSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("TicketType", ticketTypeSchema);
