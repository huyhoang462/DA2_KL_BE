const TicketType = require("../models/ticketType");

const getTicketTypesByShow = async (showId) => {
  if (!showId) {
    const err = new Error("Show ID is required");
    err.status = 400;
    throw err;
  }
  const tickets = await TicketType.find({ show: showId }).lean();
  return tickets;
};

module.exports = { getTicketTypesByShow };
