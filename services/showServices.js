const Show = require("../models/show");

const createShow = async (data) => {
  console.log("[SHOW]: ", data);
  const newShow = new Show({
    name: data.name,
    startTime: data.startTime,
    endTime: data.endTime,
    event: data.eventId,
  });
};

module.exports = { createShow };
