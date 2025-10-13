const router = require("express").Router();
const {
  handleCreateEvent,
  handleGetEventById,
  handleGetAllEvents,
} = require("../controllers/event.controller");

router.get("/get-all", handleGetAllEvents);
router.get("/get-event/:id", handleGetEventById);
router.post("/create-event", handleCreateEvent);

module.exports = router;
