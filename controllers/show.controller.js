const showService = require("../services/showServices");

const getOverview = async (req, res, next) => {
  try {
    const showId = req.params.id;
    const data = await showService.getShowOverview(showId);
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

const getCheckins = async (req, res, next) => {
  try {
    const showId = req.params.id;
    const { page, limit, search, status } = req.query;
    const data = await showService.getShowCheckins(showId, {
      page,
      limit,
      search,
      status,
    });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

// Listing shows that a staff is assigned to (used for App)
// GET /api/shows/listing?staffId&Page&limit
const getShows = async (req, res, next) => {
  try {
    const { staffId, page = 1, limit = 6 } = req.query;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    const targetStaffId = staffId || currentUserId;

    if (
      targetStaffId !== currentUserId &&
      currentUserRole !== "admin" &&
      currentUserRole !== "user"
    ) {
      const error = new Error(
        "You don't have permission to view this staff's shows"
      );
      error.status = 403;
      throw error;
    }

    const { shows, pagination } = await showService.getShowsByStaff(
      targetStaffId,
      Number(page) || 1,
      Number(limit) || 6
    );

    return res.json({
      success: true,
      total: pagination.totalItems,
      pagination,
      shows,
    });
  } catch (err) {
    console.error("[SHOW LISTING BY STAFF] Error:", err);
    next(err);
  }
};

module.exports = {
  getOverview,
  getCheckins,
  getShows,
};
