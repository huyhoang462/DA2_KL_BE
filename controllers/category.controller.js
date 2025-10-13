const { createCategory } = require("../services/categoryService");

const handleCreateCategory = async (req, res, next) => {
  try {
    const { name } = req.body;
    const result = await createCategory({ name });
    return res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = { handleCreateCategory };
