const router = require("express").Router();
const {
  handleMintSuccessWebhook,
  handleTicketsAutoCheckinWebhook,
} = require("../controllers/webhook.controller");

// Webhook từ hệ thống mint NFT (không cần auth, nhưng nên bảo vệ bằng secret ở môi trường production)
router.post("/mint-success", handleMintSuccessWebhook);

// Webhook từ Worker đồng bộ auto check-in / expire tickets trên Blockchain
router.post("/tickets-auto-checkin", handleTicketsAutoCheckinWebhook);

module.exports = router;
