const router = require("express").Router();
const postController = require("../controllers/post.controller");
const commentController = require("../controllers/comment.controller");
const { userExtractor } = require("../middlewares/authentication");

router.get("/", postController.handleGetAllPosts);
router.post("/", userExtractor, postController.handleCreatePost);
router.get("/:postId/comments", commentController.handleGetCommentsByPost);
router.post(
  "/:postId/comments",
  userExtractor,
  commentController.handleCreateComment,
);
router.delete("/:id", userExtractor, postController.handleDeletePost);

module.exports = router;
