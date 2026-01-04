const router = require("express").Router();
const ticketController = require("../controllers/ticket.controller");
const { userExtractor } = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization");

// ⭐ NEW: Organizer endpoints (Desktop) - Có checkinRate & chỉ vé đã thanh toán
router.get(
  "/organizer/show/:showId/stats",
  userExtractor,
  ticketController.handleGetOrganizerStats
);

router.get(
  "/organizer/show/:showId/list",
  userExtractor,
  ticketController.handleGetOrganizerTickets
);

// Lấy tất cả tickets của user hiện tại
router.get("/my-tickets", userExtractor, ticketController.handleGetMyTickets);

// Lấy ticket types của show (Mobile - Staff check-in)
router.get(
  "/show/:showId/ticket-types",
  ticketController.handleGetTicketTypesByShow
);

// Lấy tất cả tickets của show (Mobile - Staff check-in)
router.get(
  "/show/:showId/tickets",
  userExtractor,
  ticketController.handleGetTicketsByShow
);

// Lấy tickets theo order ID
router.get(
  "/order/:orderId",
  userExtractor,
  ticketController.handleGetTicketsByOrderId
);

// Lấy một ticket theo ID
router.get("/:ticketId", userExtractor, ticketController.handleGetTicketById);

// Xóa ticket (chỉ admin)
router.delete(
  "/:ticketId",
  userExtractor,
  requireAdmin,
  ticketController.handleDeleteTicket
);

module.exports = router;
