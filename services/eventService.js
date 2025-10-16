const Event = require("../models/event");
const User = require("../models/user");
const Show = require("../models/show");
const Category = require("../models/category");
const mongoose = require("mongoose");

const getAllEvents = async () => {
  const events = await Event.find({});
  return events;
};

const getEventById = async (eventId) => {
  if (!eventId) {
    const error = new Error("Event ID is required");
    error.status = 400;
    throw error;
  }
  const event = await Event.findById(eventId);
  if (!event) {
    const error = new Error("Event not found");
    error.status = 404;
    throw error;
  }
  // Lấy luôn các show liên quan
  const shows = await Show.find({ event: eventId });
  const eventAsJson = event.toJSON();
  eventAsJson.shows = shows.map((show) => show.toJSON());
  return eventAsJson;
};

const createEvent = async (data) => {
  const {
    creator,
    name,
    bannerImageUrl,
    description,
    location,
    format,
    category,
    organization,
    shows,
    startDate,
    endDate,
  } = data;

  if (
    !creator ||
    !name ||
    !bannerImageUrl ||
    !description ||
    !location ||
    !format ||
    !category ||
    !organization ||
    !startDate ||
    !endDate
  ) {
    const error = new Error("Missing required fields to create event!");
    error.status = 400;
    throw error;
  }
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start) || isNaN(end) || start >= end) {
    const error = new Error("Invalid event start/end date!");
    error.status = 400;
    throw error;
  }

  if (!Array.isArray(shows) || shows.length === 0) {
    const error = new Error("At least one show is required!");
    error.status = 400;
    throw error;
  }

  for (const show of shows) {
    if (
      !show.name ||
      !show.startTime ||
      !show.endTime
      // || !show.tickets || !Array.isArray(show.tickets) || show.tickets.length === 0
    ) {
      const error = new Error(
        "Each show must have name, startTime, endTime, and at least one ticket!"
      );
      error.status = 400;
      throw error;
    }
    const showStart = new Date(show.startTime);
    const showEnd = new Date(show.endTime);
    if (
      isNaN(showStart) ||
      isNaN(showEnd) ||
      showStart < start ||
      showEnd > end ||
      showStart >= showEnd
    ) {
      const error = new Error("Show time must be within event time and valid!");
      error.status = 400;
      throw error;
    }
  }

  const creatorFind = await User.findById(creator);
  if (!creatorFind) {
    const error = new Error("Creator not found!");
    error.status = 404;
    throw error;
  }

  const categoryFind = await Category.findById(category);
  if (!categoryFind) {
    const error = new Error("Category not found!");
    error.status = 404;
    throw error;
  }

  const newEvent = new Event({
    creator: creatorFind._id,
    name,
    bannerImageUrl,
    description,
    location,
    format,
    category: categoryFind._id,
    organization,
    startDate,
    endDate,
  });

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    //lưu event vào db
    const eventSaved = await newEvent.save({ session });

    //chuẩn bị các show mới,gắn event vào show
    const newShows = shows.map((show) => ({ ...show, event: eventSaved._id }));
    // lưu tất cả show vào db
    const savedShows = await Show.insertMany(newShows, { session });
    //nếu tất cả thành công, commit
    await session.commitTransaction();
    // trả về event mới tạo
    const eventAsJson = eventSaved.toJSON();

    // 2. Thêm thuộc tính 'shows' vào object đó
    eventAsJson.shows = savedShows.map((show) => show.toJSON());
    return {
      message: "Event created successfully",
      event: eventAsJson,
    };
    // nếu có lỗi, rollback
  } catch (e) {
    const error = new Error("Creating event failed, please try again.");
    console.error("Transaction Error in createEvent:", e);
    error.status = 500;
    throw error;
  } finally {
    session.endSession();
  }
};

const deleteEvent = async (eventId) => {
  if (!eventId) {
    const error = new Error("Event ID is required");
    error.status = 400;
    throw error;
  }
  const event = await Event.findById(eventId);
  if (!event) {
    const error = new Error("Event not found");
    error.status = 404;
    throw error;
  }
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Show.deleteMany({ event: eventId }, { session });
    await Event.findByIdAndDelete(eventId, { session });
    await session.commitTransaction();
    return { message: "Event and associated shows deleted successfully" };
  } catch (e) {
    const error = new Error("Deleting event failed, please try again.");
    console.error("Transaction Error in deleteEvent:", e);
    error.status = 500;
    throw error;
  } finally {
    session.endSession();
  }
};
module.exports = { getAllEvents, getEventById, createEvent, deleteEvent };
