const mongoose = require("mongoose");
const Ticket = require("../models/ticket");
const Order = require("../models/order");

/**
 * Webhook: /api/webhooks/mint-success
 * Body:
 * {
 *   "txHash": "0x384df110d43db75fd7f3af069baedcc23e52cb2052afcde4d2d1857d0da94c76",
 *   "orderIds": ["ORDER_A", "ORDER_B"],
 *   "mapping": [
 *     { "orderId": "ORDER_A", "tokenIds": ["10", "11"] },
 *     { "orderId": "ORDER_B", "tokenIds": ["12"] }
 *   ],
 *   "timestamp": "2025-12-20T09:30:15.123Z"
 * }
 */
const handleMintSuccessWebhook = async (req, res) => {
  console.log("\n=== 🎫 MINT SUCCESS WEBHOOK RECEIVED ===");
  console.log("Timestamp (server):", new Date().toISOString());
  console.log("Request body:", req.body);
  try {
    const { orderIds, txHash, mapping, timestamp } = req.body || {};

    // Validate input
    if (!Array.isArray(orderIds) || orderIds.length === 0) {
      console.warn("⚠️ Invalid or empty orderIds in webhook payload");
      return res.status(400).json({
        success: false,
        message: "orderIds must be a non-empty array",
      });
    }

    // Validate ObjectId format cho orderIds
    const invalidIds = orderIds.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id),
    );

    if (invalidIds.length > 0) {
      console.warn("⚠️ Invalid MongoDB ObjectId(s):", invalidIds);
      return res.status(400).json({
        success: false,
        message: "Some orderIds are not valid ObjectId",
        invalidIds,
      });
    }

    console.log("🔗 Tx hash:", txHash || "<no-tx-hash-provided>");
    console.log("⏱  Mint timestamp (client):", timestamp || "<no-timestamp>");
    console.log("📝 Order IDs:", orderIds);

    // 1. Cập nhật txHash cho tất cả orders liên quan
    if (txHash) {
      const orderUpdateResult = await Order.updateMany(
        { _id: { $in: orderIds } },
        { $set: { txHash } },
      );

      const ordersMatched =
        orderUpdateResult.matchedCount ?? orderUpdateResult.n ?? 0;
      const ordersModified =
        orderUpdateResult.modifiedCount ?? orderUpdateResult.nModified ?? 0;

      console.log(
        `📦 [MINT WEBHOOK] Updated txHash for orders: matched=${ordersMatched}, updated=${ordersModified}`,
      );
    } else {
      console.warn("⚠️ No txHash provided in webhook payload");
    }

    // 2. Nếu có mapping, gán tokenId cho từng ticket tương ứng
    let totalTicketsMatched = 0;
    let totalTicketsUpdated = 0;

    if (Array.isArray(mapping) && mapping.length > 0) {
      console.log("📚 [MINT WEBHOOK] Processing tokenId mapping...");

      for (const mapEntry of mapping) {
        const { orderId, tokenIds } = mapEntry || {};
        if (!orderId || !Array.isArray(tokenIds) || tokenIds.length === 0) {
          console.warn(
            "⚠️ [MINT WEBHOOK] Invalid mapping entry, skip:",
            mapEntry,
          );
          continue;
        }

        if (!mongoose.Types.ObjectId.isValid(orderId)) {
          console.warn(
            "⚠️ [MINT WEBHOOK] Invalid orderId in mapping (not ObjectId):",
            orderId,
          );
          continue;
        }

        console.log(
          `🔁 [MINT WEBHOOK] Mapping order ${orderId} with tokenIds:`,
          tokenIds,
        );

        // Lấy danh sách tickets của order này cần được gán tokenId
        const tickets = await Ticket.find({
          order: orderId,
          mintStatus: { $in: ["unminted", "pending"] },
        })
          .sort({ createdAt: 1 })
          .lean();

        if (!tickets || tickets.length === 0) {
          console.warn(
            `⚠️ [MINT WEBHOOK] No tickets found for order ${orderId} with mintStatus=unminted|pending`,
          );
          continue;
        }

        const countToUpdate = Math.min(tickets.length, tokenIds.length);
        totalTicketsMatched += tickets.length;

        if (tokenIds.length !== tickets.length) {
          console.warn(
            `⚠️ [MINT WEBHOOK] TokenIds length (${tokenIds.length}) != tickets length (${tickets.length}) for order ${orderId}. Will map first ${countToUpdate} items.`,
          );
        }

        const bulkOps = [];

        for (let i = 0; i < countToUpdate; i++) {
          const ticket = tickets[i];
          const tokenId = tokenIds[i];

          bulkOps.push({
            updateOne: {
              filter: { _id: ticket._id },
              update: {
                $set: {
                  tokenId,
                  mintStatus: "minted",
                },
              },
            },
          });

          console.log(
            `✅ [MINT WEBHOOK] Will set tokenId=${tokenId} for ticket ${ticket._id} (order ${orderId})`,
          );
        }

        if (bulkOps.length > 0) {
          const bulkResult = await Ticket.bulkWrite(bulkOps, {
            ordered: false,
          });
          const modified =
            bulkResult.modifiedCount ?? bulkResult.nModified ?? 0;
          totalTicketsUpdated += modified;

          console.log(
            `📌 [MINT WEBHOOK] Updated ${modified}/${countToUpdate} tickets for order ${orderId}`,
          );
        }
      }
    } else {
      console.log(
        "ℹ️ [MINT WEBHOOK] No mapping array provided. Skipping tokenId assignment.",
      );

      // Fallback đơn giản: chỉ update mintStatus cho tất cả tickets của các order này
      const updateResult = await Ticket.updateMany(
        {
          order: { $in: orderIds },
          mintStatus: "unminted",
        },
        {
          $set: { mintStatus: "minted" },
        },
      );

      totalTicketsMatched = updateResult.matchedCount ?? updateResult.n ?? 0;
      totalTicketsUpdated =
        updateResult.modifiedCount ?? updateResult.nModified ?? 0;
    }

    console.log(
      `🎯 [MINT WEBHOOK] DONE: totalTicketsMatched=${totalTicketsMatched}, totalTicketsUpdated=${totalTicketsUpdated}`,
    );

    return res.status(200).json({
      success: true,
      message: "Mint status and tokenIds updated successfully",
      data: {
        orderIds,
        txHash,
        timestamp,
        totalTicketsMatched,
        totalTicketsUpdated,
      },
    });
  } catch (error) {
    console.error("❌ Error handling mint-success webhook:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while processing mint-success webhook",
    });
  }
};

/**
 * Webhook: /api/webhooks/tickets-auto-checkin
 * Body ví dụ:
 * {
 *   "ticketIds": ["101", "102", "103"],
 *   "showId": "SHOW_ABC_2025_01_01",
 *   "processedAt": "2026-01-04T12:34:56.789Z",
 *   "txHash": "0xabc123..."
 * }
 *
 * Hiện tại: chỉ ghi log lại payload.
 */
const handleTicketsAutoCheckinWebhook = async (req, res) => {
  try {
    console.log("\n=== 🎫 TICKETS AUTO CHECK-IN WEBHOOK RECEIVED ===");
    console.log("Timestamp (server):", new Date().toISOString());
    console.log("Request body:", req.body);

    const { ticketIds, showId, processedAt, txHash } = req.body || {};

    console.log("➡ ticketIds:", ticketIds);
    console.log("➡ showId:", showId);
    console.log("➡ processedAt:", processedAt);
    console.log("➡ txHash:", txHash);

    return res.status(200).json({
      success: true,
      message: "tickets-auto-checkin webhook received and logged",
    });
  } catch (error) {
    console.error(
      "❌ Error handling tickets-auto-checkin webhook (log only):",
      error,
    );
    return res.status(500).json({
      success: false,
      message:
        "Internal server error while processing tickets-auto-checkin webhook",
    });
  }
};

const handleEventMintResult = async (req, res) => {
  // 1. Bảo mật: Chỉ cho phép Worker nhà mình gọi API này
  const secret = req.headers["x-webhook-secret"];
  if (secret !== process.env.INTERNAL_WEBHOOK_SECRET) {
    return res.status(403).json({ error: "Unauthorized access" });
  }

  const { eventId, txHash, status } = req.body;

  const Event = require("../models/event"); // import locally hoặc ở đầu file
  const event = await Event.findById(eventId);
  if (!event) return res.status(404).json({ error: "Event not found" });

  // 2. Xử lý logic dựa trên kết quả từ Blockchain
  if (status === "SUCCESS") {
    event.status = "upcoming";

    await event.save();
    console.log(`[WEBHOOK] Event ${eventId} is now upcoming On-chain!`);
  } else if (status === "FAILED") {
    // Giao dịch trên mạng lưới bị xịt (hết gas, lỗi logic...)
    event.status = "approved"; // Trả về trạng thái cũ
    await event.save();
    console.log(`[WEBHOOK] Event ${eventId} minting failed. Ready for retry.`);
  }

  return res.status(200).json({ message: "Webhook processed" });
};

module.exports = {
  handleMintSuccessWebhook,
  handleTicketsAutoCheckinWebhook,
  handleEventMintResult,
};
