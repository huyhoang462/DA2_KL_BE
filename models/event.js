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
      province: { type: addressComponentSchema },
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    organizer: {
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

eventSchema.pre("validate", function (next) {
  if (
    this.format === "offline" &&
    (!this.location.street ||
      this.location.street.trim() === "" ||
      !this.location.ward ||
      !this.location.province)
  ) {
    this.invalidate("Location data is required for offline events.");
  }

  if (this.format === "online") {
    this.location = undefined;
  }

  if (
    this.format === "offline" &&
    this.location.street &&
    this.location.ward &&
    this.location.province
  ) {
    this.location.address = `${this.location.street}, ${this.location.ward.name}, ${this.location.province.name}`;
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
