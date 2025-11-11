// routes/uploadRoutes.js
const express = require("express");
const router = express.Router();

const uploadController = require("../controllers/upload.controller");
const { userExtractor } = require("../middlewares/authentication");

// GET /api/uploads/signature - Lấy chữ ký để upload
router.get(
  "/signature",
  userExtractor,
  uploadController.handleGenerateSignature
);

// POST /api/uploads/delete-image - Xóa ảnh đã upload (khi người dùng đổi ảnh)
router.post("/delete-image", userExtractor, uploadController.handleDeleteImage);

module.exports = router;
