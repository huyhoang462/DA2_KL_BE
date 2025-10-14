const {
  getAllEvents,
  createEvent,
  getEventById,
  deleteEvent,
} = require("../services/eventService");

const handleGetAllEvents = async (req, res, next) => {
  try {
    const result = await getAllEvents();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleGetEventById = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const result = await getEventById(eventId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleCreateEvent = async (req, res, next) => {
  try {
    const data = req.body;
    const result = await createEvent(data);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const handleDeleteEvent = async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const result = await deleteEvent(eventId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleGetAllEvents,
  handleGetEventById,
  handleCreateEvent,
  handleDeleteEvent,
};
