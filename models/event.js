const mongoose = require("mongoose");

const addressComponentSchema = new mongoose.Schema(
  {
    code: { type: Number, required: true },
    name: { type: String, required: true },
  },
  { _id: false }
);
const eventSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    bannerImageUrl: { type: String, required: true },
    format: {
      type: String,
      enum: ["online", "offline"],
      required: true,
    },
    location: {
      address: { type: String, trim: true },
      street: { type: String, trim: true },
      ward: { type: addressComponentSchema },
      province: { type: addressComponentSchema, required: true },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    organizerInfo: {
      name: { type: String, required: true },
      email: { type: String },
      phone: { type: String },
      description: { type: String },
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    payoutMethod: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PayoutMethod",
      required: true,
    },
    status: {
      type: String,
      enum: [
        "draft",
        "pending",
        "upcoming",
        "ongoing",
        "completed",
        "rejected",
        "cancelled",
      ],
      default: "draft",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Validation logic: location is required for offline events
eventSchema.pre("validate", function (next) {
  // 1. Nếu là sự kiện offline, street phải là bắt buộc
  if (
    this.format === "offline" &&
    (!this.street || this.street.trim() === "")
  ) {
    this.invalidate(
      "location.street",
      "Street is required for offline events."
    );
  }

  // 2. Nếu là sự kiện online, xóa object location đi cho sạch sẽ
  if (this.format === "online") {
    this.location = undefined;
  }

  // 3. Tự động tạo fullAddress nếu các thành phần đã có
  if (this.format === "offline" && this.street && this.ward && this.province) {
    this.location.address = `${this.street}, ${this.ward.name}, ${this.province.name}`;
  }
  next();
});

eventSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Event", eventSchema);
