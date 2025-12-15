const Order = require("../models/order");
const OrderItem = require("../models/orderItem");
const TicketType = require("../models/ticketType");
const Show = require("../models/show");
const Event = require("../models/event");
const Transaction = require("../models/transaction");
const Ticket = require("../models/ticket");
const mongoose = require("mongoose");

const createOrder = async (orderData, buyerId, retryCount = 0) => {
  const { eventId, showId, items } = orderData;
  const maxRetries = 3;

  if (
    !eventId ||
    !showId ||
    !items ||
    !Array.isArray(items) ||
    items.length === 0
  ) {
    const error = new Error("Missing required fields: eventId, showId, items");
    error.status = 400;
    throw error;
  }

  if (
    !mongoose.Types.ObjectId.isValid(eventId) ||
    !mongoose.Types.ObjectId.isValid(showId) ||
    !mongoose.Types.ObjectId.isValid(buyerId)
  ) {
    const error = new Error("Invalid ID format");
    error.status = 400;
    throw error;
  }

  // Validate items structure
  for (const item of items) {
    if (
      !item.ticketTypeId ||
      !item.quantity ||
      !mongoose.Types.ObjectId.isValid(item.ticketTypeId) ||
      item.quantity < 1
    ) {
      const error = new Error("Invalid item format or quantity");
      error.status = 400;
      throw error;
    }
  }

  try {
    // ✅ TÌM VÀ CANCEL TẤT CẢ ORDER PENDING CŨ (TRONG 5 PHÚT)
    const recentOrders = await Order.find({
      buyer: buyerId,
      status: "pending",
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    });

    if (recentOrders.length > 0) {
      console.log(
        `Found ${recentOrders.length} recent pending order(s). Cancelling...`
      );

      for (const oldOrder of recentOrders) {
        await cancelOrderAndReleaseTickets(oldOrder._id);
      }

      console.log("✅ All old pending orders cancelled");
    }

    // --- KIỂM TRA SƠ BỘ TRƯỚC KHI TẠO SESSION ---
    const [event, show] = await Promise.all([
      Event.findById(eventId),
      Show.findOne({ _id: showId, event: eventId }),
    ]);

    if (!event) {
      const error = new Error("Event not found");
      error.status = 404;
      throw error;
    }

    if (!show) {
      const error = new Error("Show not found or doesn't belong to this event");
      error.status = 404;
      throw error;
    }

    // Kiểm tra thời gian show
    const now = new Date();
    if (show.startTime <= now) {
      const error = new Error("Show has already started");
      error.status = 400;
      throw error;
    }

    // Kiểm tra ticket types trước
    const ticketTypeIds = items.map((item) => item.ticketTypeId);
    const ticketTypes = await TicketType.find({
      _id: { $in: ticketTypeIds },
      show: showId,
    });

    if (ticketTypes.length !== ticketTypeIds.length) {
      const error = new Error(
        "Some ticket types not found or don't belong to this show"
      );
      error.status = 404;
      throw error;
    }

    // --- BẮT ĐẦU TRANSACTION SAU KHI VALIDATE ---
    const session = await mongoose.startSession();

    try {
      await session.startTransaction();

      // Tạo map để dễ lookup
      const ticketTypeMap = new Map();
      ticketTypes.forEach((tt) => {
        ticketTypeMap.set(tt._id.toString(), tt);
      });

      let totalAmount = 0;
      const orderItemsData = [];
      const updateOperations = [];

      // Xử lý từng item
      for (const item of items) {
        const ticketType = ticketTypeMap.get(item.ticketTypeId);

        // Lấy thông tin mới nhất trong session
        const currentTicketType = await TicketType.findById(
          ticketType._id
        ).session(session);

        if (!currentTicketType) {
          const error = new Error(`Ticket type ${item.ticketTypeId} not found`);
          error.status = 404;
          throw error;
        }

        // Kiểm tra số lượng còn lại
        const availableQuantity =
          currentTicketType.quantityTotal - currentTicketType.quantitySold;
        if (item.quantity > availableQuantity) {
          const error = new Error(
            `Not enough tickets available for ${ticketType.name}. Available: ${availableQuantity}, Requested: ${item.quantity}`
          );
          error.status = 400;
          throw error;
        }

        // Kiểm tra min/max purchase (nếu có)
        if (ticketType.minPurchase && item.quantity < ticketType.minPurchase) {
          const error = new Error(
            `Minimum purchase for ${ticketType.name} is ${ticketType.minPurchase}`
          );
          error.status = 400;
          throw error;
        }

        if (ticketType.maxPurchase && item.quantity > ticketType.maxPurchase) {
          const error = new Error(
            `Maximum purchase for ${ticketType.name} is ${ticketType.maxPurchase}`
          );
          error.status = 400;
          throw error;
        }

        // Tính toán
        const itemTotal = ticketType.price * item.quantity;
        totalAmount += itemTotal;

        // Chuẩn bị data cho OrderItem
        orderItemsData.push({
          ticketType: ticketType._id,
          quantity: item.quantity,
          priceAtPurchase: ticketType.price,
        });

        // Chuẩn bị update quantitySold (reserve tickets)
        updateOperations.push({
          updateOne: {
            filter: { _id: ticketType._id },
            update: { $inc: { quantitySold: item.quantity } },
          },
        });
      }

      // Kiểm tra tổng tiền phải > 0
      if (totalAmount <= 0) {
        const error = new Error("Total amount must be greater than 0");
        error.status = 400;
        throw error;
      }

      // --- TẠO ORDER ---
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 15);

      const newOrder = new Order({
        buyer: buyerId,
        totalAmount,
        status: "pending",
        expiresAt,
      });

      const savedOrder = await newOrder.save({ session });
      console.log(`Order ${savedOrder.id} created successfully`);

      // --- TẠO ORDER ITEMS ---
      const orderItemsWithOrderId = orderItemsData.map((item) => ({
        ...item,
        order: savedOrder._id,
      }));

      await OrderItem.insertMany(orderItemsWithOrderId, { session });
      console.log(`${orderItemsWithOrderId.length} order items created`);

      // --- RESERVE TICKETS ---
      if (updateOperations.length > 0) {
        try {
          const bulkResult = await TicketType.bulkWrite(updateOperations, {
            session,
            ordered: false,
          });
          console.log(`Bulk write result:`, bulkResult);
        } catch (bulkError) {
          if (
            (bulkError.code === 112 ||
              bulkError.codeName === "WriteConflict") &&
            retryCount < maxRetries
          ) {
            console.log(
              `Write conflict in bulkWrite, retrying... (${
                retryCount + 1
              }/${maxRetries})`
            );
            await session.abortTransaction();
            await session.endSession();

            await new Promise((resolve) =>
              setTimeout(resolve, 100 * Math.pow(2, retryCount))
            );
            return createOrder(orderData, buyerId, retryCount + 1);
          }
          throw bulkError;
        }
      }

      await session.commitTransaction();
      console.log(`Transaction committed for order ${savedOrder.id}`);

      // --- TRẢ VỀ KẾT QUẢ ---
      return {
        orderId: savedOrder.id,
        totalAmount: savedOrder.totalAmount,
        expiresAt: savedOrder.expiresAt,
        status: savedOrder.status,
        items: orderItemsData.map((item) => ({
          ticketTypeId: item.ticketType.toString(),
          ticketTypeName: ticketTypes.find(
            (tt) => tt._id.toString() === item.ticketType.toString()
          ).name,
          quantity: item.quantity,
          priceAtPurchase: item.priceAtPurchase,
          subtotal: item.quantity * item.priceAtPurchase,
        })),
      };
    } catch (transactionError) {
      await session.abortTransaction();

      if (
        (transactionError.code === 112 ||
          transactionError.codeName === "WriteConflict" ||
          transactionError.message?.includes("WriteConflict")) &&
        retryCount < maxRetries
      ) {
        console.log(
          `Transaction conflict, retrying... (${retryCount + 1}/${maxRetries})`
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 100 * Math.pow(2, retryCount))
        );
        return createOrder(orderData, buyerId, retryCount + 1);
      }

      console.error("Transaction Error in createOrder:", transactionError);
      throw transactionError;
    } finally {
      await session.endSession();
    }
  } catch (error) {
    if (
      (error.code === 112 ||
        error.codeName === "WriteConflict" ||
        error.message?.includes("WriteConflict")) &&
      retryCount < maxRetries
    ) {
      console.log(
        `Top-level conflict, retrying... (${retryCount + 1}/${maxRetries})`
      );
      await new Promise((resolve) =>
        setTimeout(resolve, 100 * Math.pow(2, retryCount))
      );
      return createOrder(orderData, buyerId, retryCount + 1);
    }

    console.error("Error in createOrder:", error);
    throw error;
  }
};

const getOrderStatus = async (orderId) => {
  if (!mongoose.Types.ObjectId.isValid(orderId)) {
    const error = new Error("Invalid order ID format");
    error.status = 400;
    throw error;
  }

  const order = await Order.findById(orderId).populate({
    path: "buyer",
    select: "fullName email",
  });

  if (!order) {
    const error = new Error("Order not found");
    error.status = 404;
    throw error;
  }

  // Kiểm tra và cập nhật trạng thái hết hạn
  const now = new Date();
  if (order.status === "pending" && order.expiresAt < now) {
    // Sử dụng session riêng cho việc update này
    const session = await mongoose.startSession();
    try {
      await session.startTransaction();

      // Cập nhật order status
      const updatedOrder = await Order.findByIdAndUpdate(
        orderId,
        { status: "cancelled" },
        { session, new: true }
      );

      if (updatedOrder) {
        // Release tickets (trừ lại quantitySold)
        const orderItems = await OrderItem.find({ order: orderId }).session(
          session
        );

        for (const item of orderItems) {
          await TicketType.findByIdAndUpdate(
            item.ticketType,
            { $inc: { quantitySold: -item.quantity } },
            { session }
          );
        }

        console.log(`Order ${orderId} auto-cancelled due to expiration`);
      }

      await session.commitTransaction();
      order.status = "cancelled"; // Update local object
    } catch (updateError) {
      await session.abortTransaction();
      console.error("Error auto-cancelling expired order:", updateError);
    } finally {
      await session.endSession();
    }
  }

  return {
    orderId: order.id,
    status: order.status,
    totalAmount: order.totalAmount,
    expiresAt: order.expiresAt,
    createdAt: order.createdAt,
    buyer: order.buyer,
  };
};

// Hàm helper để cleanup expired orders (có thể chạy định kỳ)
const cleanupExpiredOrders = async () => {
  try {
    const expiredOrders = await Order.find({
      status: "pending",
      expiresAt: { $lt: new Date() },
    });

    for (const order of expiredOrders) {
      const session = await mongoose.startSession();
      try {
        await session.startTransaction();

        // Update order status
        await Order.findByIdAndUpdate(
          order._id,
          { status: "cancelled" },
          { session }
        );

        // Release tickets
        const orderItems = await OrderItem.find({ order: order._id }).session(
          session
        );
        for (const item of orderItems) {
          await TicketType.findByIdAndUpdate(
            item.ticketType,
            { $inc: { quantitySold: -item.quantity } },
            { session }
          );
        }

        await session.commitTransaction();
        console.log(`Cleaned up expired order: ${order.id}`);
      } catch (error) {
        await session.abortTransaction();
        console.error(`Error cleaning up order ${order.id}:`, error);
      } finally {
        await session.endSession();
      }
    }
  } catch (error) {
    console.error("Error in cleanupExpiredOrders:", error);
  }
};

/**
 * Lấy tất cả orders của user với đầy đủ thông tin
 * @param {String} userId - ID của user
 * @returns {Array} Danh sách orders với items, transactions, tickets
 */
const getOrdersByUserId = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    const error = new Error("Invalid user ID format");
    error.status = 400;
    throw error;
  }

  try {
    const orders = await Order.find({ buyer: userId })
      .sort({ createdAt: -1 }) // Mới nhất trước
      .lean(); // Sử dụng lean() để performance tốt hơn

    // Lấy tất cả order IDs
    const orderIds = orders.map((order) => order._id);

    // Parallel fetch các thông tin liên quan
    const [orderItems, transactions, tickets] = await Promise.all([
      // Lấy order items với populate full chain
      OrderItem.find({ order: { $in: orderIds } })
        .populate({
          path: "ticketType",
          populate: {
            path: "show",
            populate: {
              path: "event",
              select: "name bannerImageUrl location startDate endDate format",
            },
          },
        })
        .lean(),

      // Lấy transactions
      Transaction.find({ order: { $in: orderIds } })
        .select("order amount paymentMethod status transactionCode createdAt")
        .lean(),

      // Lấy tickets count cho mỗi order (chỉ đếm thôi)
      Ticket.aggregate([
        { $match: { order: { $in: orderIds } } },
        { $group: { _id: "$order", count: { $sum: 1 } } },
      ]),
    ]);

    // Tạo map để lookup nhanh
    const itemsByOrder = {};
    const transactionsByOrder = {};
    const ticketCountByOrder = {};

    orderItems.forEach((item) => {
      const orderId = item.order.toString();
      if (!itemsByOrder[orderId]) {
        itemsByOrder[orderId] = [];
      }
      itemsByOrder[orderId].push(item);
    });

    transactions.forEach((txn) => {
      const orderId = txn.order.toString();
      if (!transactionsByOrder[orderId]) {
        transactionsByOrder[orderId] = [];
      }
      transactionsByOrder[orderId].push(txn);
    });

    tickets.forEach((ticket) => {
      const orderId = ticket._id.toString();
      ticketCountByOrder[orderId] = ticket.count;
    });

    // Combine tất cả thông tin
    const ordersWithDetails = orders.map((order) => {
      const orderId = order._id.toString();
      return {
        id: orderId,
        orderCode: order.orderCode,
        totalAmount: order.totalAmount,
        status: order.status,
        expiresAt: order.expiresAt,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        items: itemsByOrder[orderId] || [],
        transactions: transactionsByOrder[orderId] || [],
        ticketCount: ticketCountByOrder[orderId] || 0,
      };
    });

    return ordersWithDetails;
  } catch (error) {
    console.error("Error in getOrdersByUserId:", error);
    throw error;
  }
};

module.exports = {
  createOrder,
  getOrderStatus,
  getOrdersByUserId,
  cleanupExpiredOrders,
};
