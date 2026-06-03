const router = require("express").Router();
const {
  handleMintSuccessWebhook,
  handleTicketsAutoCheckinWebhook,
  handleEventMintResult,
  handleMarketplaceTicketListed,
  handleMarketplaceTicketCanceled,
  handleMarketplaceTicketSold,
} = require("../controllers/webhook.controller");

// Webhook từ hệ thống mint NFT (không cần auth, nhưng nên bảo vệ bằng secret ở môi trường production)
router.post("/mint-success", handleMintSuccessWebhook);

// Webhook từ Worker đồng bộ auto check-in / expire tickets trên Blockchain
router.post("/tickets-auto-checkin", handleTicketsAutoCheckinWebhook);

// Webhook nội bộ nhận kết quả duyệt/mint sự kiện từ hệ thống Worker
router.post("/internal/event-mint-result", handleEventMintResult);

// Webhook từ Smart Contract - Second Marketplace
router.post("/marketplace/listed", handleMarketplaceTicketListed);
router.post("/marketplace/canceled", handleMarketplaceTicketCanceled);
router.post("/marketplace/sold", handleMarketplaceTicketSold);

module.exports = router;
