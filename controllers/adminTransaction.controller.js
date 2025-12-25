const adminTransactionService = require("../services/adminTransactionService");

/**
 * GET /api/admin/transactions
 * Lấy danh sách tất cả giao dịch với filters và pagination
 */
const getAllTransactions = async (req, res, next) => {
  try {
    const {
      status,
      paymentMethod,
      searchTerm,
      startDate,
      endDate,
      userId,
      eventId,
    } = req.query;

    const {
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const filters = {
      status,
      paymentMethod,
      searchTerm,
      startDate,
      endDate,
      userId,
      eventId,
    };

    const pagination = {
      page: parseInt(page),
      limit: parseInt(limit),
      sortBy,
      sortOrder,
    };

    const result = await adminTransactionService.getAllTransactions(
      filters,
      pagination
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/transactions/:id
 * Lấy chi tiết một giao dịch
 */
const getTransactionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await adminTransactionService.getTransactionById(id);

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * POST /api/admin/transactions/:id/refund
 * Hoàn tiền cho một giao dịch
 */
const refundTransaction = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Refund reason is required",
      });
    }

    const result = await adminTransactionService.refundTransaction(
      id,
      reason,
      adminId
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * GET /api/admin/transactions/statistics
 * Lấy thống kê về giao dịch
 */
const getTransactionStatistics = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const filters = { startDate, endDate };

    const result = await adminTransactionService.getTransactionStatistics(
      filters
    );

    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllTransactions,
  getTransactionById,
  refundTransaction,
  getTransactionStatistics,
};
