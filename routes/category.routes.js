const router = require("express").Router();
const categoryController = require("../controllers/category.controller");

router.get("/", categoryController.handleGetAllCategories);
router.post("/", categoryController.handleCreateCategory);

module.exports = router;
