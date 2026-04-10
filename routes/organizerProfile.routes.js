const router = require("express").Router();
const organizerProfileController = require("../controllers/organizerProfile.controller");
const { userExtractor } = require("../middlewares/authentication");

router.use(userExtractor);

router.get("/me", organizerProfileController.handleGetMyOrganizerProfile);
router.put("/me", organizerProfileController.handleUpdateMyOrganizerProfile);

module.exports = router;
