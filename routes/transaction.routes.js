const router = require("express").Router();
const transactionController = require("../controllers/transaction.controller");
const { userExtractor } = require("../middlewares/authentication");

// Lấy transactions của user hiện tại
router.get(
  "/my-transactions",
  userExtractor,
  transactionController.getTransactionsByUser
);

// Lấy transactions của 1 order
router.get(
  "/order/:orderId",
  userExtractor,
  transactionController.getTransactionsByOrder
);

module.exports = router;
