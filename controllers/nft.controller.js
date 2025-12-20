const Ticket = require("../models/ticket");

// GET /api/nft/:tokenId
const getMetadata = async (req, res) => {
  try {
    const { tokenId } = req.params;

    console.log("\n=== 🎟️ NFT METADATA REQUEST ===");
    console.log("Token ID:", tokenId);

    // 1. Tìm ticket theo tokenId, populate tới event qua ticketType -> show -> event
    const ticket = await Ticket.findOne({ tokenId })
      .populate({
        path: "ticketType",
        populate: {
          path: "show",
          populate: {
            path: "event",
          },
        },
      })
      .lean();

    if (!ticket) {
      console.warn("[NFT METADATA] Ticket not found or not revealed yet");
      return res
        .status(404)
        .json({ error: "Ticket not found or not revealed yet" });
    }

    const ticketType = ticket.ticketType;
    const show = ticketType?.show;
    const event = show?.event;

    console.log("[NFT METADATA] Found ticket:", {
      ticketId: ticket._id,
      eventName: event?.name,
      ticketTypeName: ticketType?.name,
    });

    // 2. Ảnh: ưu tiên ảnh sự kiện
    const imageUrl =
      event?.bannerImageUrl ||
      process.env.NFT_DEFAULT_IMAGE_URL ||
      "https://placeholder.com/default-ticket.png";

    // 3. Tên hiển thị
    const nftName = `${event?.name || "Event Ticket"} - #${tokenId}`;

    // 4. Link external (frontend) – tuỳ bạn chỉnh domain
    const baseClientUrl = process.env.CLIENT_URL || "https://shineticket.com";

    const externalUrl = event
      ? `${baseClientUrl}/events/${event._id.toString()}`
      : baseClientUrl;

    // 5. Metadata chuẩn
    const metadata = {
      name: nftName,
      description:
        event?.description ||
        "Vé tham dự sự kiện được phát hành dưới dạng NFT.",
      image: imageUrl,
      external_url: externalUrl,
      attributes: [
        {
          trait_type: "Event",
          value: event?.name || "Unknown Event",
        },
        {
          trait_type: "Ticket Type",
          value: ticketType?.name || "Standard",
        },
        {
          trait_type: "Status",
          value: ticket.mintStatus === "minted" ? "MINTED" : ticket.status,
        },
      ],
    };

    return res.json(metadata);
  } catch (error) {
    console.error("[NFT METADATA] Error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = { getMetadata };
