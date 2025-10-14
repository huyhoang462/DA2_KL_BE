const router = require("express").Router();
const {
  handleCreateEvent,
  handleGetEventById,
  handleGetAllEvents,
  handleDeleteEvent,
} = require("../controllers/event.controller");
const { userExtractor } = require("../middlewares/authentication");
const { checkEventOwnership } = require("../middlewares/authorization");

router.get("/", handleGetAllEvents);
router.get("/:id", handleGetEventById);
router.post("/", userExtractor, handleCreateEvent);
router.delete("/:id", userExtractor, checkEventOwnership, handleDeleteEvent);

module.exports = router;
