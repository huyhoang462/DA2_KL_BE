const payoutMethodService = require("../services/payoutMethodService");

const handleCreatePayoutMethod = async (req, res, next) => {
  try {
    const user = req.user;
    const data = req.body;

    const newMethod = await payoutMethodService.createPayoutMethod(user, data);
    res.status(201).json(newMethod);
  } catch (error) {
    next(error);
  }
};

const handleGetMyPayoutMethods = async (req, res, next) => {
  try {
    const user = req.user;
    const methods = await payoutMethodService.getMyPayoutMethods(user);
    res.status(200).json(methods);
  } catch (error) {
    next(error);
  }
};

const handleDeletePayoutMethod = async (req, res, next) => {
  try {
    const user = req.user;
    const methodId = req.params.id;

    await payoutMethodService.deletePayoutMethod(methodId, user);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleCreatePayoutMethod,
  handleGetMyPayoutMethods,
  handleDeletePayoutMethod,
};
