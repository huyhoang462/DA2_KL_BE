/**
 * Script để seed một số search queries mẫu
 * Chạy: node scripts/seed-search-queries.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const SearchQuery = require("../models/searchQuery");
const { normalizeSearchText } = require("../utils/searchHelper");

const sampleQueries = [
  { query: "concert", resultCount: 15 },
  { query: "hòa nhạc", resultCount: 12 },
  { query: "nhạc", resultCount: 25 },
  { query: "workshop", resultCount: 8 },
  { query: "hội thảo", resultCount: 10 },
  { query: "tết", resultCount: 18 },
  { query: "cuối tuần", resultCount: 22 },
  { query: "thể thao", resultCount: 7 },
  { query: "cafe", resultCount: 9 },
  { query: "yoga", resultCount: 5 },
  { query: "âm nhạc", resultCount: 14 },
  { query: "concert", resultCount: 16 }, // Duplicate để tăng count
  { query: "workshop", resultCount: 9 },
  { query: "nhạc", resultCount: 20 },
  { query: "tết nguyên đán", resultCount: 12 },
];

const seedSearchQueries = async () => {
  try {
    console.log("=== BẮT ĐẦU SEED SEARCH QUERIES ===");
    console.log("Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("✓ Connected to MongoDB");

    // Xóa dữ liệu cũ (optional)
    const deleteCount = await SearchQuery.countDocuments();
    if (deleteCount > 0) {
      console.log(`\nTìm thấy ${deleteCount} search queries cũ`);
      await SearchQuery.deleteMany({});
      console.log("✓ Đã xóa dữ liệu cũ");
    }

    // Insert sample data
    console.log("\nĐang insert sample queries...");
    const queries = sampleQueries.map((item) => ({
      query: item.query.toLowerCase().trim(),
      normalizedQuery: normalizeSearchText(item.query),
      resultCount: item.resultCount,
      createdAt: new Date(
        Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
      ), // Random trong 30 ngày
    }));

    await SearchQuery.insertMany(queries);
    console.log(`✓ Đã insert ${queries.length} search queries`);

    // Hiển thị thống kê
    const stats = await SearchQuery.aggregate([
      {
        $group: {
          _id: "$query",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    console.log("\n=== TOP 5 POPULAR KEYWORDS ===");
    stats.forEach((stat, index) => {
      console.log(`${index + 1}. "${stat._id}" - ${stat.count} searches`);
    });

    await mongoose.connection.close();
    console.log("\n✓ Hoàn thành!");
  } catch (error) {
    console.error("\n✗ LỖI:", error);
    process.exit(1);
  }
};

seedSearchQueries();
