const OrderItem = require("../models/orderItem");
const Order = require("../models/order");
const TicketType = require("../models/ticketType");
const mongoose = require("mongoose");

/**
 * Tạo order items khi thanh toán thành công
 * @param {String} orderId - ID của order
 * @param {Array} items - Array of { ticketTypeId, quantity, priceAtPurchase }
 * @param {mongoose.ClientSession} session - MongoDB session cho transaction
 */
const createOrderItems = async (orderId, items, session = null) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid order ID format");
    error.status = 400;
    throw error;
  }

  if (!items || items.length === 0) {
    const error = new Error("Items array is required");
    error.status = 400;
    throw error;
  }

  console.log(
    `[CREATE ORDER ITEMS] Creating ${items.length} items for order ${orderId}`
  );

  const orderItems = items.map((item) => ({
    order: orderId,
    ticketType: item.ticketTypeId,
    quantity: item.quantity,
    priceAtPurchase: item.priceAtPurchase,
  }));

  const createdItems = await OrderItem.insertMany(orderItems, { session });

  console.log(
    `[CREATE ORDER ITEMS] Created ${createdItems.length} order items`
  );

  return createdItems;
};

/**
 * Lấy tất cả order items của một order
 */
const getOrderItemsByOrderId = async (orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid order ID format");
    error.status = 400;
    throw error;
  }

  const orderItems = await OrderItem.find({ order: orderId })
    .populate({
      path: "ticketType",
      select: "name price description",
      populate: {
        path: "show",
        select: "name startTime endTime venue",
        populate: {
          path: "event",
          select: "name poster",
        },
      },
    })
    .lean();

  return orderItems.map((item) => ({
    id: item._id.toString(),
    orderId: item.order.toString(),
    ticketType: {
      id: item.ticketType._id.toString(),
      name: item.ticketType.name,
      price: item.ticketType.price,
      description: item.ticketType.description,
      show: item.ticketType.show
        ? {
            id: item.ticketType.show._id.toString(),
            name: item.ticketType.show.name,
            startTime: item.ticketType.show.startTime,
            endTime: item.ticketType.show.endTime,
            venue: item.ticketType.show.venue,
            event: item.ticketType.show.event
              ? {
                  id: item.ticketType.show.event._id.toString(),
                  name: item.ticketType.show.event.name,
                  poster: item.ticketType.show.event.poster,
                }
              : null,
          }
        : null,
    },
    quantity: item.quantity,
    priceAtPurchase: item.priceAtPurchase,
    subtotal: item.quantity * item.priceAtPurchase,
  }));
};

/**
 * Lấy một order item theo ID
 */
const getOrderItemById = async (orderItemId) => {
  if (!mongoose.Types.ObjectId.isValid(orderItemId)) {
    const error = new Error("Invalid order item ID format");
    error.status = 400;
    throw error;
  }

  const orderItem = await OrderItem.findById(orderItemId)
    .populate("order")
    .populate({
      path: "ticketType",
      populate: {
        path: "show",
        populate: "event",
      },
    })
    .lean();

  if (!orderItem) {
    const error = new Error("Order item not found");
    error.status = 404;
    throw error;
  }

  return {
    id: orderItem._id.toString(),
    order: orderItem.order,
    ticketType: orderItem.ticketType,
    quantity: orderItem.quantity,
    priceAtPurchase: orderItem.priceAtPurchase,
    subtotal: orderItem.quantity * orderItem.priceAtPurchase,
  };
};

/**
 * Xóa order item (chỉ khi order chưa paid)
 */
const deleteOrderItem = async (orderItemId) => {
  if (!mongoose.Types.ObjectId.isValid(orderItemId)) {
    const error = new Error("Invalid order item ID format");
    error.status = 400;
    throw error;
  }

  const orderItem = await OrderItem.findById(orderItemId).populate("order");

  if (!orderItem) {
    const error = new Error("Order item not found");
    error.status = 404;
    throw error;
  }

  // Kiểm tra order status
  if (orderItem.order.status === "paid") {
    const error = new Error("Cannot delete order item from paid order");
    error.status = 400;
    throw error;
  }

  await OrderItem.findByIdAndDelete(orderItemId);

  console.log(`[DELETE ORDER ITEM] Deleted order item ${orderItemId}`);

  return { message: "Order item deleted successfully" };
};

module.exports = {
  createOrderItems,
  getOrderItemsByOrderId,
  getOrderItemById,
  deleteOrderItem,
};
