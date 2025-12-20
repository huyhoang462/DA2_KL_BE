const router = require("express").Router();
const {
  handleMintSuccessWebhook,
} = require("../controllers/webhook.controller");

// Webhook từ hệ thống mint NFT (không cần auth, nhưng nên bảo vệ bằng secret ở môi trường production)
router.post("/mint-success", handleMintSuccessWebhook);

module.exports = router;
