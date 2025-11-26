// routes/staffRoutes.js
const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { userExtractor } = require("../middlewares/authentication");

router.use(userExtractor);

router.post("/", userController.handleCreateStaff);

router.get("/", userController.handleGetMyStaff);

router.put("/:id", userController.handleUpdateStaff);

router.delete("/:id", userController.handleDeleteStaff);

module.exports = router;
