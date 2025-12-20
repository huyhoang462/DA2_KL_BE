const {
  getTicketsByUserId,
  getTicketsByOrderId,
  getTicketById,
  deleteTicket,
  getTicketTypesByShow,
  getTicketsByShowId,
} = require("../services/ticketService");

/**
 * Lấy tất cả tickets của user hiện tại
 */
const handleGetMyTickets = async (req, res, next) => {
  try {
    const userId = req.user.id;

    console.log("[GET MY TICKETS] Request:", { userId });

    const tickets = await getTicketsByUserId(userId);

    res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    console.error("[GET MY TICKETS] Error:", error);
    next(error);
  }
};

/**
 * Lấy tickets theo order ID
 */
const handleGetTicketsByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    console.log("[GET TICKETS BY ORDER] Request:", { orderId });

    const tickets = await getTicketsByOrderId(orderId);

    res.status(200).json({
      success: true,
      count: tickets.length,
      data: tickets,
    });
  } catch (error) {
    console.error("[GET TICKETS BY ORDER] Error:", error);
    next(error);
  }
};

/**
 * Lấy một ticket theo ID
 */
const handleGetTicketById = async (req, res, next) => {
  try {
    const { ticketId } = req.params;
    const userId = req.user?.id;

    console.log("[GET TICKET] Request:", { ticketId, userId });

    const ticket = await getTicketById(ticketId, userId);

    res.status(200).json({
      success: true,
      data: ticket,
    });
  } catch (error) {
    console.error("[GET TICKET] Error:", error);
    next(error);
  }
};

/**
 * Xóa ticket
 */
const handleDeleteTicket = async (req, res, next) => {
  try {
    const { ticketId } = req.params;

    console.log("[DELETE TICKET] Request:", { ticketId });

    const result = await deleteTicket(ticketId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[DELETE TICKET] Error:", error);
    next(error);
  }
};

/**
 * Lấy danh sách ticket types của show
 * GET /api/tickets/show/:showId/ticket-types
 */
const handleGetTicketTypesByShow = async (req, res, next) => {
  try {
    const { showId } = req.params;

    console.log("[GET TICKET TYPES BY SHOW] Request:", { showId });

    const result = await getTicketTypesByShow(showId);

    res.status(200).json(result);
  } catch (error) {
    console.error("[GET TICKET TYPES BY SHOW] Error:", error);
    next(error);
  }
};

/**
 * Lấy tất cả tickets của một show (cho quản lý check-in)
 * GET /api/shows/:showId/tickets
 */
const handleGetTicketsByShow = async (req, res, next) => {
  try {
    const { showId } = req.params;
    const { status, ticketTypeId, search, page, limit } = req.query;

    console.log("[GET TICKETS BY SHOW] Request:", {
      showId,
      status,
      ticketTypeId,
      search,
      page,
      limit,
    });

    const result = await getTicketsByShowId(showId, {
      status,
      ticketTypeId,
      search,
      page,
      limit,
    });

    res.status(200).json(result);
  } catch (error) {
    console.error("[GET TICKETS BY SHOW] Error:", error);
    next(error);
  }
};

module.exports = {
  handleGetMyTickets,
  handleGetTicketsByOrderId,
  handleGetTicketById,
  handleDeleteTicket,
  handleGetTicketTypesByShow,
  handleGetTicketsByShow,
};
