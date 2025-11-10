const categoryService = require("../services/categoryService");

const handleGetAllCategories = async (req, res, next) => {
  try {
    const result = await categoryService.getAllCategories();
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleCreateCategory = async (req, res, next) => {
  try {
    const { name } = req.body;
    const result = await categoryService.createCategory({ name });
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { handleGetAllCategories, handleCreateCategory };
