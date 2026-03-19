const commentService = require("../services/commentService");

const handleGetCommentsByPost = async (req, res, next) => {
  try {
    const { postId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const result = await commentService.getCommentsByPost({
      postId,
      page,
      limit,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleCreateComment = async (req, res, next) => {
  try {
    const { postId } = req.params;

    const result = await commentService.createComment({
      postId,
      author: req.user,
      data: req.body,
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const handleUpdateComment = async (req, res, next) => {
  try {
    const commentId = req.params.id;

    const result = await commentService.updateComment({
      commentId,
      userId: req.user._id,
      userRole: req.user.role,
      data: req.body,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleDeleteComment = async (req, res, next) => {
  try {
    const commentId = req.params.id;

    const result = await commentService.deleteComment({
      commentId,
      userId: req.user._id,
      userRole: req.user.role,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleGetCommentsByPost,
  handleCreateComment,
  handleUpdateComment,
  handleDeleteComment,
};
