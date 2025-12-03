const router = require("express").Router();
const eventController = require("../controllers/event.controller");
const { userExtractor } = require("../middlewares/authentication");
const { checkEventOwnership } = require("../middlewares/authorization");

router.post("/cleanup", eventController.handleCleanupData);
router.get("/search", eventController.handleSearchSuggestions);
router.get("/search/events", eventController.handleSearchEvents);
router.get("/", eventController.handleGetAllEvents);
router.get("/pending", eventController.handleGetPendingEvents);
router.get("/:id", eventController.handleGetEventById);
router.put(
  "/:id",
  userExtractor,
  checkEventOwnership,
  eventController.handleUpdateEvent
);
router.get("/user/:id", eventController.handleGetEventsByUserId);
router.post("/", userExtractor, eventController.handleCreateEvent);
router.patch(
  "/status/:id",

  eventController.handleUpdateEventStatus
);
router.delete(
  "/:id",
  userExtractor,
  checkEventOwnership,
  eventController.handleDeleteEvent
);

module.exports = router;
