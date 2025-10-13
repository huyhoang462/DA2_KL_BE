const router = require("express").Router();
const categoryController = require("../controllers/category.controller");

router.post("/create", categoryController.handleCreateCategory);

module.exports = router;
