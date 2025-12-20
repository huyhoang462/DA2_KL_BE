const router = require("express").Router();
const ticketController = require("../controllers/ticket.controller");
const { userExtractor } = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization"); // ← SỬA: import từ authorization

// Lấy tất cả tickets của user hiện tại
router.get("/my-tickets", userExtractor, ticketController.handleGetMyTickets);

// Lấy ticket types của show
router.get(
  "/show/:showId/ticket-types",
  ticketController.handleGetTicketTypesByShow
);

// Lấy tất cả tickets của show (cho quản lý check-in)
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
