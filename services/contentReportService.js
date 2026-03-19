const mongoose = require("mongoose");
const Report = require("../models/report");
const Post = require("../models/post");
const Comment = require("../models/comment");
const User = require("../models/user");

const VALID_REASONS = ["spam", "inappropriate", "scam", "harassment", "other"];
const VALID_STATUS = ["pending", "reviewing", "resolved", "dismissed"];
const VALID_ACTIONS = ["remove_content", "warn_user", "ban_user", "no_action"];

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

const mapReport = (report) => {
  return {
    id: report._id.toString(),
    reporter: mapUser(report.reporter),
    targetType: report.targetType,
    targetId: report.targetId ? report.targetId.toString() : null,
    reason: report.reason,
    description: report.description,
    status: report.status,
    reviewedBy: mapUser(report.reviewedBy),
    reviewNote: report.reviewNote,
    action: report.action,
    createdAt: report.createdAt,
    resolvedAt: report.resolvedAt,
    updatedAt: report.updatedAt,
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

// Lấy danh sách reports content (admin only)
const getReports = async ({ page = 1, limit = 20, status, targetType }) => {
  const parsedPage = validatePositiveInteger(page, "page");
  const parsedLimit = validatePositiveInteger(limit, "limit");

  if (parsedLimit > 100) {
    const error = new Error("limit must not exceed 100");
    error.status = 400;
    throw error;
  }

  const query = {};

  if (status) {
    if (!VALID_STATUS.includes(status)) {
      const error = new Error(
        `Invalid status. Must be one of: ${VALID_STATUS.join(", ")}`,
      );
      error.status = 400;
      throw error;
    }
    query.status = status;
  } else {
    // Default: show pending and reviewing
    query.status = { $in: ["pending", "reviewing"] };
  }

  if (targetType) {
    if (!["post", "comment"].includes(targetType)) {
      const error = new Error(
        "Invalid targetType. Must be 'post' or 'comment'",
      );
      error.status = 400;
      throw error;
    }
    query.targetType = targetType;
  }

  const skip = (parsedPage - 1) * parsedLimit;

  const [reports, totalItems] = await Promise.all([
    Report.find(query)
      .populate("reporter", "fullName email role")
      .populate("reviewedBy", "fullName email role")
      .sort({ status: 1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit),
    Report.countDocuments(query),
  ]);

  const totalPages = Math.ceil(totalItems / parsedLimit) || 1;

  return {
    message: "Reports fetched successfully",
    data: reports.map(mapReport),
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

// Tạo report mới (user report post/comment)
const createReport = async ({ user, data }) => {
  if (!user || !user._id) {
    const error = new Error("User information is required");
    error.status = 401;
    throw error;
  }

  const { targetType, targetId, reason, description } = data;

  // Validate targetType
  if (!targetType) {
    const error = new Error("targetType is required");
    error.status = 400;
    throw error;
  }

  if (!["post", "comment"].includes(targetType)) {
    const error = new Error("targetType must be 'post' or 'comment'");
    error.status = 400;
    throw error;
  }

  // Validate targetId
  if (!targetId) {
    const error = new Error("targetId is required");
    error.status = 400;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    const error = new Error("Invalid targetId format");
    error.status = 400;
    throw error;
  }

  // Validate reason
  if (!reason) {
    const error = new Error("reason is required");
    error.status = 400;
    throw error;
  }

  if (!VALID_REASONS.includes(reason)) {
    const error = new Error(
      `Invalid reason. Must be one of: ${VALID_REASONS.join(", ")}`,
    );
    error.status = 400;
    throw error;
  }

  // Validate description if provided
  if (description && typeof description !== "string") {
    const error = new Error("description must be a string");
    error.status = 400;
    throw error;
  }

  if (description && description.length > 500) {
    const error = new Error("description must not exceed 500 characters");
    error.status = 400;
    throw error;
  }

  // Check if target exists and get author
  let targetExists = false;
  let targetAuthor = null;

  if (targetType === "post") {
    const post = await Post.findById(targetId);
    if (!post) {
      const error = new Error("Post not found");
      error.status = 404;
      throw error;
    }
    targetExists = true;
    targetAuthor = post.author;
  } else if (targetType === "comment") {
    const comment = await Comment.findById(targetId);
    if (!comment) {
      const error = new Error("Comment not found");
      error.status = 404;
      throw error;
    }
    targetExists = true;
    targetAuthor = comment.author;
  }

  if (!targetExists) {
    const error = new Error("Target not found");
    error.status = 404;
    throw error;
  }

  // Check for duplicate report: 1 user chỉ report 1 lần cho 1 content
  const existingReport = await Report.findOne({
    reporter: user._id,
    targetId,
  });

  if (existingReport) {
    const error = new Error("You have already reported this content");
    error.status = 409;
    throw error;
  }

  // Cannot report yourself
  if (targetAuthor.toString() === user._id.toString()) {
    const error = new Error("You cannot report your own content");
    error.status = 400;
    throw error;
  }

  // Create report
  const newReport = new Report({
    reporter: user._id,
    targetType,
    targetId,
    reason,
    description: description || undefined,
    status: "pending",
  });

  await newReport.save();

  // Populate after save
  await newReport.populate("reporter", "fullName email role");

  return {
    message: "Report submitted successfully",
    data: mapReport(newReport),
  };
};

// Lấy report theo ID (admin only)
const getReportById = async ({ reportId }) => {
  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    const error = new Error("Invalid reportId format");
    error.status = 400;
    throw error;
  }

  const report = await Report.findById(reportId)
    .populate("reporter", "fullName email role")
    .populate("reviewedBy", "fullName email role");

  if (!report) {
    const error = new Error("Report not found");
    error.status = 404;
    throw error;
  }

  return {
    message: "Report fetched successfully",
    data: mapReport(report),
  };
};

// Review report (admin only)
const reviewReport = async ({ reportId, userId, userRole, data }) => {
  if (userRole !== "admin") {
    const error = new Error("Only admins can review reports");
    error.status = 403;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    const error = new Error("Invalid reportId format");
    error.status = 400;
    throw error;
  }

  const { status, action, reviewNote } = data;

  // Validate status
  if (!status) {
    const error = new Error("status is required");
    error.status = 400;
    throw error;
  }

  if (!VALID_STATUS.includes(status)) {
    const error = new Error(
      `Invalid status. Must be one of: ${VALID_STATUS.join(", ")}`,
    );
    error.status = 400;
    throw error;
  }

  // Validate action if provided
  if (action && !VALID_ACTIONS.includes(action)) {
    const error = new Error(
      `Invalid action. Must be one of: ${VALID_ACTIONS.join(", ")}`,
    );
    error.status = 400;
    throw error;
  }

  // Validate reviewNote if provided
  if (reviewNote && typeof reviewNote !== "string") {
    const error = new Error("reviewNote must be a string");
    error.status = 400;
    throw error;
  }

  const report = await Report.findById(reportId);

  if (!report) {
    const error = new Error("Report not found");
    error.status = 404;
    throw error;
  }

  // Update report
  report.status = status;
  report.reviewedBy = userId;
  report.reviewNote = reviewNote || undefined;
  report.action = action || undefined;

  if (["resolved", "dismissed"].includes(status)) {
    report.resolvedAt = new Date();
  }

  // If action is taken, update target (soft delete or warn user)
  if (action === "remove_content") {
    if (report.targetType === "post") {
      await Post.findByIdAndUpdate(report.targetId, {
        status: "removed",
      });
    } else if (report.targetType === "comment") {
      await Comment.findByIdAndUpdate(report.targetId, {
        status: "removed",
        content: "[comment removed]",
      });
    }
  }

  if (action === "warn_user" || action === "ban_user") {
    // Get the target author
    let targetAuthor = null;

    if (report.targetType === "post") {
      const post = await Post.findById(report.targetId);
      targetAuthor = post?.author;
    } else if (report.targetType === "comment") {
      const comment = await Comment.findById(report.targetId);
      targetAuthor = comment?.author;
    }

    if (targetAuthor) {
      const updates = {};

      if (action === "warn_user") {
        const user = await User.findById(targetAuthor);
        updates.warningCount = (user?.warningCount || 0) + 1;
      }

      if (action === "ban_user") {
        updates.isBanned = true;
        updates.bannedReason = `Banned due to report(s) on content`;
        updates.bannedAt = new Date();
      }

      await User.findByIdAndUpdate(targetAuthor, updates);
    }
  }

  await report.save();

  // Populate after save
  const populatedReport = await Report.findById(report._id)
    .populate("reporter", "fullName email role")
    .populate("reviewedBy", "fullName email role");

  return {
    message: "Report reviewed successfully",
    data: mapReport(populatedReport),
  };
};

// Xóa report (admin only)
const deleteReport = async ({ reportId, userRole }) => {
  if (userRole !== "admin") {
    const error = new Error("Only admins can delete reports");
    error.status = 403;
    throw error;
  }

  if (!mongoose.Types.ObjectId.isValid(reportId)) {
    const error = new Error("Invalid reportId format");
    error.status = 400;
    throw error;
  }

  const report = await Report.findByIdAndDelete(reportId);

  if (!report) {
    const error = new Error("Report not found");
    error.status = 404;
    throw error;
  }

  return {
    message: "Report deleted successfully",
    data: { id: report._id.toString() },
  };
};

module.exports = {
  getReports,
  createReport,
  getReportById,
  reviewReport,
  deleteReport,
};
