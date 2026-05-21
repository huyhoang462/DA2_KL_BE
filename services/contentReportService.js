const mongoose = require("mongoose");
const Report = require("../models/report");
const Post = require("../models/post");
const Comment = require("../models/comment");
const User = require("../models/user");
const { createNotificationSafe } = require("./notificationService");

const VALID_REASONS = ["spam", "inappropriate", "scam", "harassment", "other"];
const VALID_STATUS = ["pending", "resolved"];
const VALID_ACTIONS = [
  "remove_content",
  "warn_user",
  "ban_user",
  "dismiss",
  "no_action",
];

const targetSelectFields = {
  post: "content images status moderationStatus reportCount author relatedEvent postType publishedAt createdAt updatedAt",
  comment:
    "content images status reportCount author post parentComment replyToUser depth createdAt updatedAt",
};

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
    target: report.target || null,
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

const truncateText = (value, maxLength = 180) => {
  if (!value) {
    return "";
  }

  const text = String(value).trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3).trimEnd()}...`;
};

const mapTargetPreview = (target, targetType) => {
  if (!target) {
    return null;
  }

  const base = {
    id: target._id.toString(),
    type: targetType,
    status: target.status,
    reportCount: target.reportCount ?? 0,
    createdAt: target.createdAt,
    updatedAt: target.updatedAt,
  };

  if (targetType === "post") {
    return {
      ...base,
      content: truncateText(target.content, 220),
      images: Array.isArray(target.images) ? target.images : [],
      moderationStatus: target.moderationStatus,
      postType: target.postType,
      publishedAt: target.publishedAt,
      author: mapUser(target.author),
      relatedEvent: target.relatedEvent ? target.relatedEvent.toString() : null,
    };
  }

  return {
    ...base,
    content: truncateText(target.content, 220),
    images: Array.isArray(target.images) ? target.images : [],
    author: mapUser(target.author),
    post: target.post
      ? {
          id: target.post._id?.toString?.() || target.post.toString(),
          content: truncateText(target.post.content, 140),
          status: target.post.status,
        }
      : null,
    depth: target.depth,
    parentComment: target.parentComment
      ? target.parentComment.toString?.() || target.parentComment
      : null,
  };
};

const loadTargetPreview = async (report) => {
  if (!report?.targetId || !report.targetType) {
    return null;
  }

  if (!targetSelectFields[report.targetType]) {
    return null;
  }

  if (report.targetType === "post") {
    const post = await Post.findById(report.targetId)
      .select(targetSelectFields.post)
      .populate("author", "fullName email role status");

    return mapTargetPreview(post, "post");
  }

  const comment = await Comment.findById(report.targetId)
    .select(targetSelectFields.comment)
    .populate("author", "fullName email role status")
    .populate("post", "content status")
    .populate("parentComment", "content status");

  return mapTargetPreview(comment, "comment");
};

const attachTargetPreview = async (reports) => {
  return Promise.all(
    reports.map(async (report) => {
      const plainReport = report.toObject ? report.toObject() : report;
      plainReport.target = await loadTargetPreview(report);
      return plainReport;
    }),
  );
};

const getReportStats = async () => {
  const [statusStats, typeStats, totalItems] = await Promise.all([
    Report.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Report.aggregate([{ $group: { _id: "$targetType", count: { $sum: 1 } } }]),
    Report.countDocuments({}),
  ]);

  const byStatus = VALID_STATUS.reduce((accumulator, status) => {
    accumulator[status] = 0;
    return accumulator;
  }, {});

  statusStats.forEach((item) => {
    if (item._id && Object.prototype.hasOwnProperty.call(byStatus, item._id)) {
      byStatus[item._id] = item.count;
    }
  });

  const byTargetType = ["post", "comment"].reduce((accumulator, type) => {
    accumulator[type] = 0;
    return accumulator;
  }, {});

  typeStats.forEach((item) => {
    if (
      item._id &&
      Object.prototype.hasOwnProperty.call(byTargetType, item._id)
    ) {
      byTargetType[item._id] = item.count;
    }
  });

  return {
    message: "Report stats fetched successfully",
    data: {
      totalItems,
      byStatus,
      byTargetType,
      unresolvedItems: byStatus.pending,
    },
  };
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
    query.status = { $in: ["pending", "resolved"] };
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
  } else query.targetType = { $in: ["comment", "post"] };

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

  const data = await attachTargetPreview(reports);

  const totalPages = Math.ceil(totalItems / parsedLimit) || 1;

  return {
    message: "Reports fetched successfully",
    data,
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

  if (targetType === "post") {
    await Post.findByIdAndUpdate(targetId, {
      $inc: { reportCount: 1 },
      $set: { moderationStatus: "flagged" },
    });
  } else if (targetType === "comment") {
    await Comment.findByIdAndUpdate(targetId, {
      $inc: { reportCount: 1 },
    });
  }

  // Populate after save
  await newReport.populate("reporter", "fullName email role");
  newReport.target = await loadTargetPreview(newReport);

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

  report.target = await loadTargetPreview(report);

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

  if (["resolved"].includes(status)) {
    report.resolvedAt = new Date();
  }

  // If action is taken, update target (soft delete or warn user)
  if (action === "remove_content") {
    if (report.targetType === "post") {
      await Post.findByIdAndUpdate(report.targetId, {
        status: "removed",
        moderationStatus: "reviewed",
        moderatedBy: userId,
        moderatedAt: new Date(),
      });
    } else if (report.targetType === "comment") {
      await Comment.findByIdAndUpdate(report.targetId, {
        status: "removed",
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

  await createNotificationSafe({
    recipientId: report.reporter,
    type: "report_reviewed",
    title: "Bao cao da duoc xu ly",
    message: `Bao cao cua ban da duoc xu ly voi ket qua: ${report.status}.`,
    priority: "medium",
    metadata: {
      reportId: report._id.toString(),
      targetType: report.targetType,
      targetId: report.targetId?.toString?.() || report.targetId,
      status: report.status,
      action: report.action || null,
      reviewNote: report.reviewNote || null,
    },
    channels: ["in_app"],
    createdBy: userId,
  });

  // Populate after save
  const populatedReport = await Report.findById(report._id)
    .populate("reporter", "fullName email role")
    .populate("reviewedBy", "fullName email role");

  populatedReport.target = await loadTargetPreview(populatedReport);

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

  if (report.targetType === "post") {
    await Post.findByIdAndUpdate(report.targetId, {
      $inc: { reportCount: -1 },
    });
  } else if (report.targetType === "comment") {
    await Comment.findByIdAndUpdate(report.targetId, {
      $inc: { reportCount: -1 },
    });
  }

  return {
    message: "Report deleted successfully",
    data: { id: report._id.toString() },
  };
};

const getReportSummary = async () => {
  return getReportStats();
};

module.exports = {
  getReports,
  createReport,
  getReportById,
  reviewReport,
  deleteReport,
  getReportSummary,
};
