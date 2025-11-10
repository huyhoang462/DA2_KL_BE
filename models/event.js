const mongoose = require("mongoose");

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
      type: mongoose.Schema.Types.ObjectId,
      ref: "Location",
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
  if (
    this.format === "offline" &&
    (!this.location || this.location.trim() === "")
  ) {
    this.invalidate("location", "Location is required for offline events.");
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
