require("dotenv").config();
const mongoose = require("mongoose");
const {
  backfillExpireTicketsForEndedShows,
} = require("../services/ticketStatusBackfillService");

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("Missing MONGODB_URI in environment");
  }

  const dryRun = process.argv.includes("--dry-run");
  const batchArg = process.argv.find((a) => a.startsWith("--batch="));
  const batchSize = batchArg ? parseInt(batchArg.split("=")[1], 10) : undefined;

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    console.log(
      `\n🔧 Backfill expire tickets (dryRun=${dryRun}${
        batchSize ? `, batch=${batchSize}` : ""
      })...\n`,
    );

    const result = await backfillExpireTicketsForEndedShows({
      dryRun,
      ...(batchSize ? { batchSize } : {}),
    });

    console.log("✅ Backfill result:");
    console.log(`   • Ended shows: ${result.endedShows}`);
    console.log(
      `   • ${dryRun ? "Would update" : "Updated"} tickets: ${result.updatedTickets}`,
    );
    console.log(" ");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((e) => {
  console.error("❌ Backfill failed:", e);
  process.exit(1);
});
