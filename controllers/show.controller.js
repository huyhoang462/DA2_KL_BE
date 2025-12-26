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
    const data = await showService.getShowCheckins(showId, { page, limit, search, status });
    return res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getOverview,
  getCheckins,
};
