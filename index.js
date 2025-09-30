require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const Event = require("./models/event");

const app = express();
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to mongodb"))
  .catch((e) => console.log("Error to connect: ", e));

app.use(cors());
app.use(express.json());

app.get("/api/events", (request, response) => {
  Event.find({})
    .then((events) => response.json(events))
    .then(() => console.log("GET has just been called"));
});
app.post("/api/events", (request, response) => {
  const body = request.body;

  if (!body.name || !body.description || !body.bannerImage || !body.location) {
    return response
      .status(400)
      .json({ error: "one or more fields are missing" });
  }

  const event = new Event({
    name: body.name,
    description: body.description,
    bannerImage: body.bannerImage,
    location: body.location,
  });

  event.save().then((savedEvent) => {
    response.status(201).json(savedEvent);
  });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Serrver running on port ${PORT}`);
});
