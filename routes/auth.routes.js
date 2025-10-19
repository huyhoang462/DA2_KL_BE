const router = require("express").Router();

const authController = require("../controllers/auth.controller");
const { userExtractor } = require("../middlewares/authentication");

router.post("/login", authController.login);
router.post("/refresh-token", authController.refreshToken);
router.post("/register-request", authController.register);
router.post("/verify-email", authController.verifyEmail);
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-reset-code", authController.verifyResetCode);
router.post("/reset-password", authController.resetPassword);
router.post("/change-password", userExtractor, authController.changePassword);
router.put("/edit-profile", userExtractor, authController.editProfile);

module.exports = router;
