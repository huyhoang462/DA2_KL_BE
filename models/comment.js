const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: true,
    },

    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    content: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 1000,
    },

    images: [
      {
        type: String, // Max 1 ảnh trong comment
      },
    ],

    // Nested comments
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Comment",
    },

    replyToUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    depth: {
      type: Number,
      default: 0,
      // 0 = root comment
      // >= 1 = reply levels
    },

    replyCount: { type: Number, default: 0 },

    // Moderation
    status: {
      type: String,
      enum: ["published", "pending", "removed"],
      default: "published",
    },

    isEdited: { type: Boolean, default: false },
    editedAt: Date,

    reportCount: { type: Number, default: 0 },
  },
  {
    timestamps: true,
  },
);

// Indexes
commentSchema.index({ post: 1, createdAt: 1 });
commentSchema.index({ author: 1 });
commentSchema.index({ parentComment: 1 });

// Transform JSON
commentSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Comment", commentSchema);
