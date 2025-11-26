const userService = require("../services/userService");

const handleCreateStaff = async (req, res, next) => {
  try {
    const creator = req.user;
    const staffData = req.body;
    const newStaff = await userService.createStaffAccount(staffData, creator);
    res.status(201).json(newStaff);
  } catch (error) {
    next(error);
  }
};

const handleGetMyStaff = async (req, res, next) => {
  try {
    const creator = req.user;
    const staffList = await userService.getStaffByCreator(creator);
    res.status(200).json(staffList);
  } catch (error) {
    next(error);
  }
};

const handleUpdateStaff = async (req, res, next) => {
  try {
    const creator = req.user;
    const staffId = req.params.id;
    const updateData = req.body;
    const updatedStaff = await userService.updateStaffAccount(
      staffId,
      updateData,
      creator
    );
    res.status(200).json(updatedStaff);
  } catch (error) {
    next(error);
  }
};

const handleDeleteStaff = async (req, res, next) => {
  try {
    const creator = req.user;
    const staffId = req.params.id;
    await userService.deleteStaffAccount(staffId, creator);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleCreateStaff,
  handleGetMyStaff,
  handleUpdateStaff,
  handleDeleteStaff,
};
