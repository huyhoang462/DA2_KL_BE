const transactionService = require("../services/transactionService");

const getTransactionsByOrder = async (req, res) => {
  try {
    const { orderId } = req.params;

    const transactions = await transactionService.getTransactionsByOrder(
      orderId
    );

    res.json({
      success: true,
      data: transactions,
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const getTransactionsByUser = async (req, res) => {
  try {
    const userId = req.user.id;

    const userTransactions = await transactionService.getTransactionsByUser(
      userId
    );

    res.json({
      success: true,
      data: userTransactions,
    });
  } catch (error) {
    console.error("Error fetching user transactions:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getTransactionsByOrder,
  getTransactionsByUser,
};
