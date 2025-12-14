const {
  getOrderItemsByOrderId,
  getOrderItemById,
  deleteOrderItem,
} = require("../services/orderItemService");

/**
 * Lấy tất cả order items của một order
 */
const handleGetOrderItemsByOrderId = async (req, res, next) => {
  try {
    const { orderId } = req.params;

    const orderItems = await getOrderItemsByOrderId(orderId);

    res.status(200).json({
      success: true,
      count: orderItems.length,
      data: orderItems,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy một order item theo ID
 */
const handleGetOrderItemById = async (req, res, next) => {
  try {
    const { orderItemId } = req.params;

    const orderItem = await getOrderItemById(orderItemId);

    res.status(200).json({
      success: true,
      data: orderItem,
    });
  } catch (error) {
    console.error("[GET ORDER ITEM] Error:", error);
    next(error);
  }
};

/**
 * Xóa order item
 */
const handleDeleteOrderItem = async (req, res, next) => {
  try {
    const { orderItemId } = req.params;

    const result = await deleteOrderItem(orderItemId);

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error("[DELETE ORDER ITEM] Error:", error);
    next(error);
  }
};

module.exports = {
  handleGetOrderItemsByOrderId,
  handleGetOrderItemById,
  handleDeleteOrderItem,
};
