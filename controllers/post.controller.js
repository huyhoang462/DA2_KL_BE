const postService = require("../services/postService");

const handleGetAllPosts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, postType, authorId } = req.query;

    const result = await postService.getAllPosts({
      page,
      limit,
      status,
      postType,
      authorId,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleCreatePost = async (req, res, next) => {
  try {
    const result = await postService.createPost({
      author: req.user,
      data: req.body,
    });

    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

const handleDeletePost = async (req, res, next) => {
  try {
    const postId = req.params.id;

    const result = await postService.deletePost({
      postId,
      userId: req.user._id,
      userRole: req.user.role,
    });

    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleGetAllPosts,
  handleCreatePost,
  handleDeletePost,
};
