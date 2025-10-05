const router = require("express").Router();

const authController = require("../controllers/auth.controller");

router.post("/login", authController.login);
router.post("/register-request", authController.register);
router.post("/verify-email", authController.verifyEmail);

module.exports = router;
