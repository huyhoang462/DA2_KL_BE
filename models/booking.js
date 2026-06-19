const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Đảm bảo 1 user chỉ có 1 bản ghi Booking duy nhất cho 1 event (tránh lưu trùng lặp)
bookingSchema.index({ user: 1, event: 1 }, { unique: true });

bookingSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Booking", bookingSchema);
