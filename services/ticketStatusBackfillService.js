const Show = require("../models/show");
const TicketType = require("../models/ticketType");
const Ticket = require("../models/ticket");

const DEFAULT_BATCH_SIZE = 2000;

const chunkArray = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

/**
 * Backfill: Expire tickets for shows that are already ended.
 *
 * Use-case: DB currently has show status correct (completed/expired) but ticket status is stale.
 * This function is meant to be run one-time (manual script), not on an interval.
 *
 * Rule:
 * - If a show's status is `completed` (or legacy `expired`), then all its tickets become `expired`
 *   except tickets already `expired` or `cancelled`.
 */
async function backfillExpireTicketsForEndedShows(options = {}) {
  const {
    showStatuses = ["completed", "expired"],
    ticketStatusesToSkip = ["expired", "cancelled"],
    batchSize = DEFAULT_BATCH_SIZE,
    dryRun = false,
  } = options;

  const startedAt = new Date();

  const endedShowIds = await Show.find({ status: { $in: showStatuses } })
    .select("_id")
    .lean();

  const showIds = endedShowIds.map((s) => s._id);

  if (showIds.length === 0) {
    return {
      success: true,
      startedAt,
      endedShows: 0,
      updatedTickets: 0,
      message: "No ended shows found for backfill.",
    };
  }

  let totalUpdatedTickets = 0;
  const showIdChunks = chunkArray(showIds, batchSize);

  for (const showIdChunk of showIdChunks) {
    const ticketTypeIds = await TicketType.distinct("_id", {
      show: { $in: showIdChunk },
    });

    if (!ticketTypeIds || ticketTypeIds.length === 0) continue;

    if (dryRun) {
      const countToUpdate = await Ticket.countDocuments({
        ticketType: { $in: ticketTypeIds },
        status: { $nin: ticketStatusesToSkip },
      });
      totalUpdatedTickets += countToUpdate;
      continue;
    }

    const updateResult = await Ticket.updateMany(
      {
        ticketType: { $in: ticketTypeIds },
        status: { $nin: ticketStatusesToSkip },
      },
      { $set: { status: "expired" } },
    );

    totalUpdatedTickets += updateResult.modifiedCount || 0;
  }

  return {
    success: true,
    startedAt,
    endedShows: showIds.length,
    updatedTickets: totalUpdatedTickets,
    dryRun,
  };
}

module.exports = {
  backfillExpireTicketsForEndedShows,
};
