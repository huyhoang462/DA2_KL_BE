const category = require("../models/category");

const getAllCategories = async () => {
  return await category.find({});
};

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

const updateCategory = async ({ categoryId, name }) => {
  if (!categoryId || !name) {
    const error = new Error("All fields are required");
    error.status = 400;
    throw error;
  }
  const cat = await category.findOne({ name });
  if (cat && cat._id.toString() !== categoryId) {
    const error = new Error("Category name already exists!");
    error.status = 400;
    throw error;
  }

  const updatedCategory = await category.findByIdAndUpdate(
    categoryId,
    { name },
    { new: true }
  );
  if (!updatedCategory) {
    const error = new Error("Category not found");
    error.status = 404;
    throw error;
  }
  return {
    message: "Category updated successfully",
    category: updatedCategory,
  };
};

const deleteCategory = async ({ categoryId }) => {
  if (!categoryId) {
    const error = new Error("Category ID is required");
    error.status = 400;
    throw error;
  }
  const deletedCategory = await category.findByIdAndDelete(categoryId);
  if (!deletedCategory) {
    const error = new Error("Category not found");
    error.status = 404;
    throw error;
  }
  return {
    message: "Category deleted successfully",
    category: deletedCategory,
  };
};

module.exports = {
  createCategory,
  getAllCategories,
  updateCategory,
  deleteCategory,
};
