const mongoose = require("mongoose");
const Post = require("../models/post");
const Event = require("../models/event");

const POST_STATUS_VALUES = ["pending", "published", "rejected", "removed"];
const POST_TYPE_VALUES = ["event_promotion", "marketplace_listing"];

const getAllPosts = async ({
  page = 1,
  limit = 10,
  status,
  postType,
  authorId,
}) => {
  const parsedPage = Number(page);
  const parsedLimit = Number(limit);

  if (!Number.isInteger(parsedPage) || parsedPage < 1) {
    const error = new Error("page must be a positive integer");
    error.status = 400;
    throw error;
  }

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    const error = new Error("limit must be an integer between 1 and 100");
    error.status = 400;
    throw error;
  }

  const query = {};

  if (status) {
    if (!POST_STATUS_VALUES.includes(status)) {
      const error = new Error("Invalid status value");
      error.status = 400;
      throw error;
    }
    query.status = status;
  } else {
    query.status = { $in: ["pending", "published"] };
  }

  if (postType) {
    if (!POST_TYPE_VALUES.includes(postType)) {
      const error = new Error("Invalid postType value");
      error.status = 400;
      throw error;
    }
    query.postType = postType;
  }

  if (authorId) {
    if (!mongoose.Types.ObjectId.isValid(authorId)) {
      const error = new Error("Invalid authorId format");
      error.status = 400;
      throw error;
    }
    query.author = authorId;
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const [posts, totalItems] = await Promise.all([
    Post.find(query)
      .populate("author", "fullName email role")
      .populate("relatedEvent", "name startDate bannerImageUrl status location")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit),
    Post.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalItems / parsedLimit) || 1;

  return {
    message: "Posts fetched successfully",
    data: posts,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalItems,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPrevPage: parsedPage > 1,
    },
  };
};

const createPost = async ({ author, data }) => {
  if (!author || !author._id) {
    const error = new Error("Author information is required");
    error.status = 401;
    throw error;
  }

  const { content, images, relatedEvent, relatedTicket, postType } = data;

  if (!content || typeof content !== "string" || !content.trim()) {
    const error = new Error("content is required");
    error.status = 400;
    throw error;
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length < 50 || trimmedContent.length > 5000) {
    const error = new Error(
      "content length must be between 50 and 5000 characters",
    );
    error.status = 400;
    throw error;
  }

  let normalizedImages = [];
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      const error = new Error("images must be an array of image URLs");
      error.status = 400;
      throw error;
    }

    normalizedImages = images
      .filter((image) => typeof image === "string")
      .map((image) => image.trim())
      .filter(Boolean);
  }

  if (postType && !POST_TYPE_VALUES.includes(postType)) {
    const error = new Error("Invalid postType value");
    error.status = 400;
    throw error;
  }

  if (relatedEvent) {
    if (!mongoose.Types.ObjectId.isValid(relatedEvent)) {
      const error = new Error("Invalid relatedEvent ID format");
      error.status = 400;
      throw error;
    }

    const existingEvent = await Event.findById(relatedEvent).select("_id");
    if (!existingEvent) {
      const error = new Error("Related event not found");
      error.status = 404;
      throw error;
    }
  }

  if (relatedTicket && !mongoose.Types.ObjectId.isValid(relatedTicket)) {
    const error = new Error("Invalid relatedTicket ID format");
    error.status = 400;
    throw error;
  }

  const newPost = new Post({
    author: author._id,
    authorType: author.role === "organizer" ? "organizer" : "user",
    content: trimmedContent,
    images: normalizedImages,
    relatedEvent: relatedEvent || undefined,
    relatedTicket: relatedTicket || undefined,
    postType: postType || "event_promotion",
  });

  await newPost.save();

  const populatedPost = await Post.findById(newPost._id)
    .populate("author", "fullName email role")
    .populate("relatedEvent", "name startDate bannerImageUrl status");

  return {
    message: "Post created successfully",
    post: populatedPost,
  };
};

const deletePost = async ({ postId, userId, userRole }) => {
  if (!postId) {
    const error = new Error("Post ID is required");
    error.status = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(postId)) {
    const error = new Error("Invalid post ID format");
    error.status = 400;
    throw error;
  }

  const post = await Post.findById(postId);
  if (!post) {
    const error = new Error("Post not found");
    error.status = 404;
    throw error;
  }

  const isOwner = post.author.toString() === userId.toString();
  const isAdmin = userRole === "admin";

  if (!isOwner && !isAdmin) {
    const error = new Error(
      "Forbidden: You do not have permission to delete this post",
    );
    error.status = 403;
    throw error;
  }

  const deletedPost = await Post.findByIdAndDelete(postId);

  return {
    message: "Post deleted successfully",
    post: deletedPost,
  };
};

module.exports = {
  getAllPosts,
  createPost,
  deletePost,
};
