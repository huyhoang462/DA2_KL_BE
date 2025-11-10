const express = require("express");
const router = express.Router();

const payoutMethodController = require("../controllers/payoutMethod.controller");
const { userExtractor } = require("../middlewares/authentication");

router.post(
  "/",
  userExtractor,
  payoutMethodController.handleCreatePayoutMethod
);

router.get("/", payoutMethodController.handleGetMyPayoutMethods);

router.delete(
  "/:id",
  userExtractor,
  payoutMethodController.handleDeletePayoutMethod
);
module.exports = router;
