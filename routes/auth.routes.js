const router = require("express").Router();

const authController = require("../controllers/auth.controller");

router.post("/login", authController.login);
router.post("/register-request", authController.register);
router.post("/verify-email", authController.verifyEmail);
router.post("/forgot-password", authController.forgotPassword);
router.post("/verify-reset-code", authController.verifyResetCode);
router.post("/reset-password", authController.resetPassword);
router.post("/change-password", authController.changePassword);
module.exports = router;
