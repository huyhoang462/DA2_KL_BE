const contentReportService = require("../services/contentReportService");

// Lấy danh sách reports (admin only)
const handleGetReports = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, targetType } = req.query;

    const result = await contentReportService.getReports({
      page,
      limit,
      targetType,
      status,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Lấy thống kê report cho admin dashboard
const handleGetReportSummary = async (req, res, next) => {
  try {
    const result = await contentReportService.getReportSummary();

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Tạo report mới (user report post/comment)
const handleCreateReport = async (req, res, next) => {
  try {
    const result = await contentReportService.createReport({
      user: req.user,
      data: req.body,
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

// Lấy report theo ID (admin only)
const handleGetReportById = async (req, res, next) => {
  try {
    const { reportId } = req.params;

    const result = await contentReportService.getReportById({
      reportId,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Review report (admin only)
const handleReviewReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;

    const result = await contentReportService.reviewReport({
      reportId,
      userId: req.user._id,
      userRole: req.user.role,
      data: req.body,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

// Xóa report (admin only)
const handleDeleteReport = async (req, res, next) => {
  try {
    const { reportId } = req.params;

    const result = await contentReportService.deleteReport({
      reportId,
      userRole: req.user.role,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleGetReports,
  handleGetReportSummary,
  handleCreateReport,
  handleGetReportById,
  handleReviewReport,
  handleDeleteReport,
};
