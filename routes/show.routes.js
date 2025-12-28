const express = require("express");
const router = express.Router();
const showController = require("../controllers/show.controller");
const { userExtractor } = require("../middlewares/authentication");

// GET /api/shows/:id/overview
router.get("/:id/overview", showController.getOverview);

// GET /api/shows/:id/checkins
router.get("/:id/checkins", showController.getCheckins);

// GET /api/shows/listing
router.get("/listing", userExtractor, showController.getShows);

module.exports = router;
