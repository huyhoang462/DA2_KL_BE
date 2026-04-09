const mongoose = require("mongoose");
const Comment = require("../models/comment");
const Post = require("../models/post");
const { createNotificationSafe } = require("./notificationService");

const mapUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    id: user._id ? user._id.toString() : user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
  };
};

const mapComment = (comment) => {
  const author = mapUser(comment.author);
  const replyToUser = mapUser(comment.replyToUser);

  return {
    id: comment._id.toString(),
    post: comment.post ? comment.post.toString() : null,
    author,
    content: comment.content,
    images: comment.images || [],
    parentComment: comment.parentComment
      ? comment.parentComment.toString()
      : null,
    replyToUser,
    // FE có thể dùng trực tiếp để render: "Tên A > Tên B"
    replyDisplay:
      author && replyToUser
        ? `${author.fullName} > ${replyToUser.fullName}`
        : null,
    depth: comment.depth,
    // UI depth cho FE: root = 0, tất cả reply level = 1 (kiểu TikTok)
    displayDepth: comment.depth > 0 ? 1 : 0,
    replyCount: comment.replyCount,
    status: comment.status,
    isEdited: comment.isEdited,
    editedAt: comment.editedAt,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
};

const validatePositiveInteger = (value, fieldName) => {
  const parsedValue = Number(value);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    const error = new Error(`${fieldName} must be a positive integer`);
    error.status = 400;
    throw error;
  }

  return parsedValue;
};

const validateCommentPermission = ({ comment, userId, userRole }) => {
  const isOwner = comment.author.toString() === userId.toString();
  const isAdmin = userRole === "admin";

  if (!isOwner && !isAdmin) {
    const error = new Error(
      "Forbidden: You do not have permission to perform this action",
    );
    error.status = 403;
    throw error;
  }
};

const validateAndNormalizeImages = (images) => {
  if (images === undefined) {
    return undefined;
  }

  if (!Array.isArray(images)) {
    const error = new Error("images must be an array of image URLs");
    error.status = 400;
    throw error;
  }

  const normalizedImages = images
    .filter((image) => typeof image === "string")
    .map((image) => image.trim())
    .filter(Boolean);

  if (normalizedImages.length > 1) {
    const error = new Error("A comment can have at most 1 image");
    error.status = 400;
    throw error;
  }

  return normalizedImages;
};

const getCommentsByPost = async ({ postId, page = 1, limit = 20 }) => {
  if (!mongoose.Types.ObjectId.isValid(postId)) {
    const error = new Error("Invalid post ID format");
    error.status = 400;
    throw error;
  }

  const parsedPage = validatePositiveInteger(page, "page");
  const parsedLimit = validatePositiveInteger(limit, "limit");

  if (parsedLimit > 100) {
    const error = new Error("limit must be less than or equal to 100");
    error.status = 400;
    throw error;
  }

  const post = await Post.findById(postId).select("_id");
  if (!post) {
    const error = new Error("Post not found");
    error.status = 404;
    throw error;
  }

  const visibleFilter = {
    post: postId,
    status: { $ne: "removed" },
  };

  const visibleComments = await Comment.find(visibleFilter)
    .populate("author", "fullName email role")
    .populate("replyToUser", "fullName email role")
    .sort({ createdAt: 1 });

  const mappedComments = visibleComments.map((comment) => ({
    ...mapComment(comment),
    replies: [],
  }));

  const commentsById = new Map(
    mappedComments.map((comment) => [comment.id, comment]),
  );

  const threadRoots = [];

  for (const comment of mappedComments) {
    const parentId = comment.parentComment;

    // Nếu cha bị xóa hoặc không tồn tại trong tập visible, comment sẽ được nâng lên làm thread root.
    if (!parentId || !commentsById.has(parentId)) {
      threadRoots.push(comment);
      continue;
    }

    commentsById.get(parentId).replies.push(comment);
  }

  const totalThreadRoots = threadRoots.length;
  const totalCommentsInPost = mappedComments.length;

  const skip = (parsedPage - 1) * parsedLimit;
  const data = threadRoots.slice(skip, skip + parsedLimit);

  const totalPages = Math.ceil(totalThreadRoots / parsedLimit) || 1;

  return {
    message: "Comments fetched successfully",
    data,
    pagination: {
      page: parsedPage,
      limit: parsedLimit,
      totalItems: totalThreadRoots,
      totalPages,
      hasNextPage: parsedPage < totalPages,
      hasPrevPage: parsedPage > 1,
    },
    summary: {
      totalRootComments: totalThreadRoots,
      totalThreadRoots,
      totalCommentsInPost,
    },
  };
};

const createComment = async ({ postId, author, data }) => {
  if (!author || !author._id) {
    const error = new Error("Author information is required");
    error.status = 401;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(postId)) {
    const error = new Error("Invalid post ID format");
    error.status = 400;
    throw error;
  }

  const post = await Post.findById(postId).select("_id status");
  if (!post) {
    const error = new Error("Post not found");
    error.status = 404;
    throw error;
  }

  if (post.status === "removed" || post.status === "rejected") {
    const error = new Error("Cannot comment on this post");
    error.status = 400;
    throw error;
  }

  const { content, images, parentComment } = data;

  if (!content || typeof content !== "string" || !content.trim()) {
    const error = new Error("content is required");
    error.status = 400;
    throw error;
  }

  const trimmedContent = content.trim();
  if (trimmedContent.length < 1 || trimmedContent.length > 1000) {
    const error = new Error(
      "content length must be between 1 and 1000 characters",
    );
    error.status = 400;
    throw error;
  }

  const normalizedImages = validateAndNormalizeImages(images) || [];

  const payload = {
    post: postId,
    author: author._id,
    content: trimmedContent,
    images: normalizedImages,
    depth: 0,
  };

  if (
    parentComment !== undefined &&
    parentComment !== null &&
    parentComment !== ""
  ) {
    if (!mongoose.Types.ObjectId.isValid(parentComment)) {
      const error = new Error("Invalid parentComment ID format");
      error.status = 400;
      throw error;
    }

    const parent = await Comment.findOne({
      _id: parentComment,
      post: postId,
    }).select("_id author depth status");

    if (!parent) {
      const error = new Error("Parent comment not found");
      error.status = 404;
      throw error;
    }

    if (parent.status === "removed") {
      const error = new Error("Cannot reply to a removed comment");
      error.status = 400;
      throw error;
    }

    payload.parentComment = parent._id;
    payload.replyToUser = parent.author;
    payload.depth = (parent.depth || 0) + 1;
  }

  const newComment = new Comment(payload);
  await newComment.save();

  await Post.findByIdAndUpdate(postId, { $inc: { commentCount: 1 } });

  if (payload.parentComment) {
    await Comment.findByIdAndUpdate(payload.parentComment, {
      $inc: { replyCount: 1 },
    });

    if (payload.replyToUser?.toString() !== author._id.toString()) {
      await createNotificationSafe({
        recipientId: payload.replyToUser,
        type: "comment_reply",
        title: "Có phản hồi mới",
        message: "Bình luận của bạn vừa có phản hồi mới.",
        priority: "medium",
        metadata: {
          postId: postId.toString(),
          commentId: newComment._id.toString(),
          parentCommentId: payload.parentComment.toString(),
          repliedBy: author._id.toString(),
        },
        channels: ["in_app"],
        createdBy: author._id,
      });
    }
  }

  const populatedComment = await Comment.findById(newComment._id)
    .populate("author", "fullName email role")
    .populate("replyToUser", "fullName email role");

  return {
    message: "Comment created successfully",
    comment: mapComment(populatedComment),
  };
};

const updateComment = async ({ commentId, userId, userRole, data }) => {
  if (!commentId) {
    const error = new Error("Comment ID is required");
    error.status = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    const error = new Error("Invalid comment ID format");
    error.status = 400;
    throw error;
  }

  const existingComment = await Comment.findById(commentId);
  if (!existingComment) {
    const error = new Error("Comment not found");
    error.status = 404;
    throw error;
  }

  if (existingComment.status === "removed") {
    const error = new Error("Cannot update a removed comment");
    error.status = 400;
    throw error;
  }

  validateCommentPermission({ comment: existingComment, userId, userRole });

  const { content, images } = data;

  if (content === undefined && images === undefined) {
    const error = new Error(
      "At least one field (content or images) must be provided",
    );
    error.status = 400;
    throw error;
  }

  if (content !== undefined) {
    if (typeof content !== "string" || !content.trim()) {
      const error = new Error("content must be a non-empty string");
      error.status = 400;
      throw error;
    }

    const trimmedContent = content.trim();
    if (trimmedContent.length < 1 || trimmedContent.length > 1000) {
      const error = new Error(
        "content length must be between 1 and 1000 characters",
      );
      error.status = 400;
      throw error;
    }

    existingComment.content = trimmedContent;
  }

  const normalizedImages = validateAndNormalizeImages(images);
  if (normalizedImages !== undefined) {
    existingComment.images = normalizedImages;
  }

  existingComment.isEdited = true;
  existingComment.editedAt = new Date();

  await existingComment.save();

  const populatedComment = await Comment.findById(existingComment._id)
    .populate("author", "fullName email role")
    .populate("replyToUser", "fullName email role");

  return {
    message: "Comment updated successfully",
    comment: mapComment(populatedComment),
  };
};

const deleteComment = async ({ commentId, userId, userRole }) => {
  if (!commentId) {
    const error = new Error("Comment ID is required");
    error.status = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(commentId)) {
    const error = new Error("Invalid comment ID format");
    error.status = 400;
    throw error;
  }

  const existingComment = await Comment.findById(commentId);
  if (!existingComment) {
    const error = new Error("Comment not found");
    error.status = 404;
    throw error;
  }

  validateCommentPermission({ comment: existingComment, userId, userRole });

  if (existingComment.status === "removed") {
    const populatedRemovedComment = await Comment.findById(existingComment._id)
      .populate("author", "fullName email role")
      .populate("replyToUser", "fullName email role");

    return {
      message: "Comment already removed",
      comment: mapComment(populatedRemovedComment),
    };
  }

  existingComment.status = "removed";
  existingComment.content = "[comment removed]";
  existingComment.images = [];
  existingComment.isEdited = true;
  existingComment.editedAt = new Date();
  await existingComment.save();

  await Post.findByIdAndUpdate(existingComment.post, {
    $inc: { commentCount: -1 },
  });

  const updatedPost = await Post.findById(existingComment.post).select(
    "commentCount",
  );
  if (updatedPost && updatedPost.commentCount < 0) {
    updatedPost.commentCount = 0;
    await updatedPost.save();
  }

  if (existingComment.parentComment) {
    const parent = await Comment.findById(existingComment.parentComment).select(
      "replyCount",
    );

    if (parent) {
      parent.replyCount = Math.max(0, parent.replyCount - 1);
      await parent.save();
    }
  }

  const populatedComment = await Comment.findById(existingComment._id)
    .populate("author", "fullName email role")
    .populate("replyToUser", "fullName email role");

  return {
    message: "Comment removed successfully",
    comment: mapComment(populatedComment),
  };
};

module.exports = {
  getCommentsByPost,
  createComment,
  updateComment,
  deleteComment,
};
