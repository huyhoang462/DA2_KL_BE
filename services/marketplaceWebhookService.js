const Ticket = require("../models/ticket");
const User = require("../models/user");

const normalizeAddress = (address) => {
  if (typeof address !== "string") return "";
  return address.trim().toLowerCase();
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const findUserByWalletAddress = async (walletAddress) => {
  const normalized = normalizeAddress(walletAddress);
  if (!normalized) return null;

  // Case-insensitive exact match (handles addresses stored with mixed-case)
  return User.findOne({
    walletAddress: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, "i") },
  });
};

const findTicketByTokenId = async (tokenId) => {
  const normalized = String(tokenId ?? "").trim();
  if (!normalized) return null;

  return Ticket.findOne({ tokenId: normalized });
};

const ticketToPayload = (ticketDoc) => {
  if (!ticketDoc) return null;

  return {
    id: ticketDoc._id?.toString?.() ?? undefined,
    tokenId: ticketDoc.tokenId,
    status: ticketDoc.status,
    owner: ticketDoc.owner?.toString?.() ?? ticketDoc.owner,
    updatedAt: ticketDoc.updatedAt,
  };
};

const onTicketListed = async ({ tokenId, price, seller } = {}) => {
  const ticket = await findTicketByTokenId(tokenId);
  if (!ticket) {
    const err = new Error("Ticket not found for tokenId");
    err.statusCode = 404;
    err.details = { tokenId };
    throw err;
  }

  if (ticket.status === "selling") {
    return {
      applied: false,
      message: "Ticket already in selling status",
      ticket: ticketToPayload(ticket),
    };
  }

  if (ticket.status !== "pending") {
    const err = new Error("Invalid ticket status for listing");
    err.statusCode = 409;
    err.details = {
      tokenId,
      currentStatus: ticket.status,
      expected: "pending",
    };
    throw err;
  }

  ticket.status = "selling";
  await ticket.save();

  return {
    applied: true,
    message: "Ticket moved pending -> selling",
    meta: { tokenId: String(tokenId), price, seller },
    ticket: ticketToPayload(ticket),
  };
};

const onTicketCanceled = async ({ tokenId } = {}) => {
  const ticket = await findTicketByTokenId(tokenId);
  if (!ticket) {
    const err = new Error("Ticket not found for tokenId");
    err.statusCode = 404;
    err.details = { tokenId };
    throw err;
  }

  if (ticket.status === "pending") {
    return {
      applied: false,
      message: "Ticket already in pending status",
      ticket: ticketToPayload(ticket),
    };
  }

  if (ticket.status !== "selling") {
    const err = new Error("Invalid ticket status for canceling");
    err.statusCode = 409;
    err.details = {
      tokenId,
      currentStatus: ticket.status,
      expected: "selling",
    };
    throw err;
  }

  ticket.status = "pending";
  await ticket.save();

  return {
    applied: true,
    message: "Ticket moved selling -> pending",
    ticket: ticketToPayload(ticket),
  };
};

const onTicketSold = async ({ tokenId, buyerPrivy, price } = {}) => {
  const ticket = await findTicketByTokenId(tokenId);
  if (!ticket) {
    const err = new Error("Ticket not found for tokenId");
    err.statusCode = 404;
    err.details = { tokenId };
    throw err;
  }

  const buyer = await findUserByWalletAddress(buyerPrivy);
  if (!buyer) {
    const err = new Error("Buyer not found for buyerPrivy/walletAddress");
    err.statusCode = 404;
    err.details = { buyerPrivy };
    throw err;
  }

  const buyerId = buyer._id.toString();
  const currentOwnerId = ticket.owner?.toString?.();

  // Idempotency: if already applied (pending + owner=buyer)
  if (ticket.status === "pending" && currentOwnerId === buyerId) {
    return {
      applied: false,
      message: "Ticket already transferred to buyer",
      meta: { tokenId: String(tokenId), price, buyerPrivy },
      ticket: ticketToPayload(ticket),
    };
  }

  if (ticket.status !== "selling") {
    const err = new Error("Invalid ticket status for selling");
    err.statusCode = 409;
    err.details = {
      tokenId,
      currentStatus: ticket.status,
      expected: "selling",
    };
    throw err;
  }

  ticket.status = "pending";
  ticket.owner = buyer._id;
  await ticket.save();

  return {
    applied: true,
    message: "Ticket moved selling -> pending and owner transferred",
    meta: { tokenId: String(tokenId), price, buyerPrivy },
    ticket: ticketToPayload(ticket),
    buyer: { id: buyerId, walletAddress: buyer.walletAddress },
  };
};

module.exports = {
  onTicketListed,
  onTicketCanceled,
  onTicketSold,
};
