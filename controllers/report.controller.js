const reportService = require("../services/reportService");

/**
 * GET /api/admin/reports/revenue
 * Lấy báo cáo doanh thu
 */
const handleGetRevenueReport = async (req, res, next) => {
  try {
    const { startDate, endDate, groupBy } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const result = await reportService.getRevenueReport(
      startDate,
      endDate,
      groupBy || "day"
    );

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/reports/tickets
 * Lấy báo cáo về vé
 */
const handleGetTicketReport = async (req, res, next) => {
  try {
    const filters = {
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      category: req.query.category,
      eventId: req.query.eventId,
      status: req.query.status,
    };

    const result = await reportService.getTicketReport(filters);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/reports/users
 * Lấy báo cáo người dùng
 */
const handleGetUserReport = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: "Start date and end date are required",
      });
    }

    const result = await reportService.getUserReport(startDate, endDate);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/reports/categories
 * Lấy báo cáo theo danh mục
 */
const handleGetCategoryReport = async (req, res, next) => {
  try {
    const result = await reportService.getCategoryReport();

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/reports/export
 * Export báo cáo
 */
const handleExportReport = async (req, res, next) => {
  try {
    const { reportType, ...filters } = req.body;

    if (!reportType) {
      return res.status(400).json({
        success: false,
        message: "Report type is required",
      });
    }

    const result = await reportService.exportReport(reportType, filters);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleGetRevenueReport,
  handleGetTicketReport,
  handleGetUserReport,
  handleGetCategoryReport,
  handleExportReport,
};
