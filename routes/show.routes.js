const express = require("express");
const router = express.Router();
const showController = require("../controllers/show.controller");

// GET /api/shows/:id/overview
router.get("/:id/overview", showController.getOverview);

// GET /api/shows/:id/checkins
router.get("/:id/checkins", showController.getCheckins);

module.exports = router;
