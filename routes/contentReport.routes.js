const router = require("express").Router();
const contentReportController = require("../controllers/contentReport.controller");
const { userExtractor } = require("../middlewares/authentication");
const { requireAdmin } = require("../middlewares/authorization");

router.get(
  "/",
  userExtractor,
  requireAdmin,
  contentReportController.handleGetReports,
);

router.get(
  "/summary",
  userExtractor,
  requireAdmin,
  contentReportController.handleGetReportSummary,
);

router.post("/", userExtractor, contentReportController.handleCreateReport);

router.get(
  "/:reportId",
  userExtractor,
  requireAdmin,
  contentReportController.handleGetReportById,
);

router.put(
  "/:reportId/review",
  userExtractor,
  requireAdmin,
  contentReportController.handleReviewReport,
);

router.delete(
  "/:reportId",
  userExtractor,
  requireAdmin,
  contentReportController.handleDeleteReport,
);

module.exports = router;
