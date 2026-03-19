const router = require("express").Router();
const commentController = require("../controllers/comment.controller");
const { userExtractor } = require("../middlewares/authentication");

router.put("/:id", userExtractor, commentController.handleUpdateComment);
router.delete("/:id", userExtractor, commentController.handleDeleteComment);

module.exports = router;
