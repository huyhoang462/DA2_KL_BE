const category = require("../models/category");

const createCategory = async ({ name }) => {
  if (!name) {
    const error = new Error("Category name is required");
    error.status = 400;
    throw error;
  }

  const cat = await category.findOne({ name });
  if (cat) {
    const error = new Error("Category has already existed!");
    error.status = 400;
    throw error;
  }
  const newCategory = new category({ name });
  await newCategory.save();
  return { message: "Category created successfully", category: newCategory };
};
module.exports = {
  createCategory,
};
