const router = require("express").Router();
const {
  handleIncrementView,
  handleGetFeatured,
  handleGetByCategory,
  handleGetNewEvents,
  handleGetThisWeekend,
  handleGetTrending,
  handleGetSellingFast,
} = require("../controllers/home.controller");

// Home page endpoints
router.get("/featured", handleGetFeatured);
router.get("/category/:categoryId", handleGetByCategory);
router.get("/new-events", handleGetNewEvents);
router.get("/this-weekend", handleGetThisWeekend);
router.get("/trending", handleGetTrending);
router.get("/selling-fast", handleGetSellingFast);

// View tracking endpoint
router.post("/event/:id/view", handleIncrementView);

module.exports = router;
