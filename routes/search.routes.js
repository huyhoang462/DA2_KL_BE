const router = require("express").Router();
const searchController = require("../controllers/search.controller");

// Search suggestions (autocomplete) khi user đang gõ
router.get("/suggestions", searchController.handleSearchSuggestions);

// Popular searches (hiển thị khi focus vào search bar)
router.get("/popular", searchController.handleGetPopularSearches);

// Search events với filters đầy đủ (trang search results)
router.get("/events", searchController.handleSearchEvents);

module.exports = router;
