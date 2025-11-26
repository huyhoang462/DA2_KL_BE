const router = require("express").Router();
const eventController = require("../controllers/event.controller");
const { userExtractor } = require("../middlewares/authentication");
const { checkEventOwnership } = require("../middlewares/authorization");

router.post("/cleanup", eventController.handleCleanupData);
router.get("/search", eventController.handleSearchSuggestions);
router.get("/search/events", eventController.handleSearchEvents);
router.get("/", eventController.handleGetAllEvents);
router.get("/:id", eventController.handleGetEventById);
router.get("/user/:id", eventController.handleGetEventsByUserId);
router.post("/", userExtractor, eventController.handleCreateEvent);
router.delete(
  "/:id",
  userExtractor,
  checkEventOwnership,
  eventController.handleDeleteEvent
);

module.exports = router;
