const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    targetType: {
      type: String,
      enum: ["post", "comment"],
      required: true,
    },

    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    reason: {
      type: String,
      enum: ["spam", "inappropriate", "scam", "harassment", "other"],
      required: true,
    },

    description: {
      type: String,
      maxlength: 500,
    },

    status: {
      type: String,
      enum: ["pending", "reviewing", "resolved", "dismissed"],
      default: "pending",
    },

    // Admin review
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    reviewNote: String,

    action: {
      type: String,
      enum: ["remove_content", "warn_user", "ban_user", "no_action"],
    },

    resolvedAt: Date,
  },
  {
    timestamps: true,
  },
);

// Indexes
reportSchema.index({ targetType: 1, targetId: 1 });
reportSchema.index({ status: 1, createdAt: -1 });
// Unique: 1 user chỉ report 1 lần cho 1 content
reportSchema.index({ reporter: 1, targetId: 1 }, { unique: true });

// Transform JSON
reportSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Report", reportSchema);
