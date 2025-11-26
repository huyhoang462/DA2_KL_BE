const {
  getAllEvents,
  createEvent,
  getEventById,
  deleteEvent,
  cleanupOrphanedData,
  getEventsByUserId,
  getSearchSuggestions,
  searchEvents,
} = require("../services/eventService");

const handleCleanupData = async (req, res, next) => {
  try {
    const result = await cleanupOrphanedData();
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleSearchSuggestions = async (req, res, next) => {
  try {
    const query = req.query.q || "";
    const result = await getSearchSuggestions(query);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleSearchEvents = async (req, res, next) => {
  try {
    const queryParams = req.query;
    console.log("[PARAM]: ", queryParams);

    const result = await searchEvents(queryParams);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

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

const handleGetEventsByUserId = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const result = await getEventsByUserId(userId);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleCreateEvent = async (req, res, next) => {
  try {
    const data = req.body;
    const creatorId = req.user._id;
    const result = await createEvent(data, creatorId);
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
  handleCleanupData,
  handleSearchSuggestions,
  handleSearchEvents,
  handleGetAllEvents,
  handleGetEventById,
  handleGetEventsByUserId,
  handleCreateEvent,
  handleDeleteEvent,
};
