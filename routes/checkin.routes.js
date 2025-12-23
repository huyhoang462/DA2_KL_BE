const router = require("express").Router();
const { verifyCheckIn } = require("../controllers/checkin.controller");
const { userExtractor } = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization");

// POST /api/check-in/verify
// Body: { ticketId, walletAddress, timestamp, signature }
router.post("/verify", userExtractor, verifyCheckIn);

module.exports = router;
