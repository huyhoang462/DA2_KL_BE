const express = require("express");
const router = express.Router();
const recommendationController = require("../controllers/recommendation.controller");
const authentication = require("../middlewares/authentication");

// GET /api/recommendation
// Có thể có hoặc không có token. Nếu có token, ta sẽ lấy User Embedding.
router.get(
  "/",
  authentication.tokenExtractor,
  authentication.optionalUserExtractor,
  recommendationController.getRecommendations
);

module.exports = router;
