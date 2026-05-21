const { vnpayConfig } = require("../config/vnpayConfig");
const Order = require("../models/order");
const OrderItem = require("../models/orderItem");
const TicketType = require("../models/ticketType");
const Ticket = require("../models/ticket");
const { addMintJob } = require("../services/queueService");
const mongoose = require("mongoose");
const { createTicketsForOrder } = require("../services/ticketService");
const transactionService = require("../services/transactionService");
const { createNotificationSafe } = require("../services/notificationService");

const handleVnpayIpn = async (req, res) => {
  try {
    console.log("\n=== 📨 VNPay IPN RECEIVED ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Query params:", req.query);

    // Verify IPN call từ VNPay
    let verify;
    try {
      verify = vnpayConfig.verifyIpnCall(req.query);
      console.log("Verify result:", verify);
    } catch (error) {
      console.error("❌ Verify error:", error);
      return res
        .status(200)
        .json({ RspCode: "97", Message: "Invalid signature" });
    }

    if (!verify.isVerified) {
      console.error("❌ Invalid VNPay signature");
      return res
        .status(200)
        .json({ RspCode: "97", Message: "Invalid signature" });
    }

    console.log("✅ VNPay signature valid");

    // Lấy thông tin từ verify result
    const orderId = verify.vnp_TxnRef;
    const responseCode = verify.vnp_ResponseCode;
    const amount = verify.vnp_Amount; // VNPay package tự chia 100
    const transactionNo = verify.vnp_TransactionNo;
    const bankCode = verify.vnp_BankCode;
    const payDate = verify.vnp_PayDate;

    console.log("📋 Order info:", {
      orderId,
      responseCode,
      amount,
      transactionNo,
      bankCode,
      payDate,
    });

    // Kiểm tra order tồn tại
    const order = await Order.findById(orderId);
    if (!order) {
      console.error("❌ Order not found:", orderId);
      return res
        .status(200)
        .json({ RspCode: "01", Message: "Order not found" });
    }

    console.log(
      "✅ Order found:",
      order.id,
      "| Status:",
      order.status,
      "| Amount:",
      order.totalAmount,
    );

    // Kiểm tra order đã được xử lý chưa
    if (order.status !== "pending") {
      console.log("⚠️ Order already processed:", order.status);
      return res
        .status(200)
        .json({ RspCode: "02", Message: "Order already confirmed" });
    }

    // Kiểm tra số tiền
    if (order.totalAmount !== amount) {
      console.error("❌ Amount mismatch:", {
        orderAmount: order.totalAmount,
        vnpayAmount: amount,
      });
      return res.status(200).json({ RspCode: "04", Message: "Invalid amount" });
    }

    // Xử lý theo response code
    if (responseCode === "00") {
      // Thanh toán thành công
      await processSuccessfulPayment(order, transactionNo, bankCode);
      console.log(
        "🎉 ✅ PAYMENT SUCCESSFUL - Order:",
        orderId,
        "| Transaction:",
        transactionNo,
      );
      return res.status(200).json({ RspCode: "00", Message: "Success" });
    } else if (responseCode === "24") {
      // ⭐ User chủ động HỦY thanh toán
      await processCancelledPayment(order);
      console.log(
        "🚫 USER CANCELLED PAYMENT - Order:",
        orderId,
        "| ResponseCode:",
        responseCode,
      );
      return res.status(200).json({ RspCode: "00", Message: "Success" });
    } else {
      // Thanh toán thất bại (lỗi kỹ thuật, không đủ tiền, etc.)
      await processFailedPayment(order, responseCode);
      console.log(
        "❌ PAYMENT FAILED - Order:",
        orderId,
        "| ResponseCode:",
        responseCode,
      );
      return res.status(200).json({ RspCode: "00", Message: "Success" });
    }
  } catch (error) {
    console.error("❌ ⚠️ ERROR processing VNPay IPN:", error);
    return res.status(200).json({ RspCode: "99", Message: "Unknown error" });
  }
};

const handleVnpayReturn = async (req, res) => {
  try {
    console.log("\n=== 🔙 VNPay Return URL ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Query params:", req.query);

    // Verify return URL
    let verify;
    try {
      verify = vnpayConfig.verifyReturnUrl(req.query);
      console.log("Verify result:", verify);
    } catch (error) {
      console.error("❌ Verify return error:", error);
      return res.redirect(
        `${process.env.CLIENT_URL}/payment/failed?message=Invalid+signature`,
      );
    }

    if (!verify.isVerified) {
      console.error("❌ Invalid return signature");
      return res.redirect(
        `${process.env.CLIENT_URL}/payment/failed?message=Invalid+signature`,
      );
    }

    const orderId = verify.vnp_TxnRef;
    const responseCode = verify.vnp_ResponseCode;
    const transactionNo = verify.vnp_TransactionNo;

    console.log("📋 Return info:", {
      orderId,
      responseCode,
      transactionNo,
    });

    if (responseCode === "00") {
      console.log("✅ Payment successful, redirecting to success page");
      // Redirect về trang success với orderId
      return res.redirect(
        `${process.env.CLIENT_URL}/payment-success/${orderId}`,
      );
    } else if (responseCode === "24") {
      // ⭐ User HỦY thanh toán
      console.log("🚫 User cancelled payment, redirecting to cancelled page");
      return res.redirect(
        `${process.env.CLIENT_URL}/payment-cancelled?orderId=${orderId}`,
      );
    } else {
      console.log("❌ Payment failed, redirecting to failed page");
      return res.redirect(
        `${process.env.CLIENT_URL}/payment-failed?orderId=${orderId}&code=${responseCode}`,
      );
    }
  } catch (error) {
    console.error("❌ Error processing return URL:", error);
    return res.redirect(
      `${process.env.CLIENT_URL}/payment-failed?message=Error`,
    );
  }
};
const processSuccessfulPayment = async (order, transactionNo, bankCode) => {
  const session = await mongoose.startSession();

  // Biến dùng để tính toán Mint
  let totalTicketsToMint = 0;
  let buyerWallet = "";

  try {
    await session.startTransaction();

    console.log(`🔄 Processing successful payment for order ${order._id}...`);

    // ✅ KIỂM TRA IDEMPOTENCY
    if (order.status === "paid") {
      console.log(`⚠️ Order already paid. Skipping.`);
      await session.commitTransaction();

      const existingTickets = await Ticket.find({ order: order._id });
      const existingItems = await OrderItem.find({ order: order._id });

      return {
        tickets: existingTickets,
        orderItems: existingItems,
        message: "Order already processed",
      };
    }

    // 1. Update order status
    order.status = "paid";
    order.paymentInfo = {
      transactionNo,
      bankCode,
      paidAt: new Date(),
    };
    // Nếu trong order có lưu ví thì lấy luôn, nếu không thì để trống
    if (order.walletAddress) {
      buyerWallet = order.walletAddress;
    }

    await order.save({ session });

    // 2. TẠO TRANSACTION RECORD
    const transaction = await transactionService.createTransaction(
      {
        orderId: order._id,
        amount: order.totalAmount,
        paymentMethod: "vnpay",
        transactionCode: transactionNo,
        status: "success",
      },
      session,
    );

    // 3. Lấy OrderItems (Dùng biến này tính toán luôn, không query lại)
    const existingItems = await OrderItem.find({ order: order._id }).session(
      session,
    );

    if (existingItems.length === 0) {
      throw new Error("Order items not found. Cannot create tickets.");
    }

    // --- TÍNH TỔNG VÉ ĐỂ MINT ---
    // Sử dụng luôn existingItems, không cần query lại DB
    totalTicketsToMint = existingItems.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    console.log(
      `📊 [MINT CALC] Order ${order._id}: total tickets to mint = ${totalTicketsToMint}`,
    );

    // 4. Kiểm tra Tickets đã tồn tại chưa
    const existingTickets = await Ticket.find({ order: order._id }).session(
      session,
    );

    if (existingTickets.length > 0) {
      await session.commitTransaction();
      // Nếu vé đã có trong DB, có thể bạn vẫn muốn thử Mint lại nếu chưa mint?
      // Nhưng theo logic an toàn, ta return luôn ở đây.
      return {
        tickets: existingTickets,
        orderItems: existingItems,
        transaction,
      };
    }

    // 5. Tạo tickets trong DB
    const tickets = await createTicketsForOrder(
      order._id,
      order.buyer,
      session,
    );

    console.log(`🎫 Created ${tickets.length} tickets`);

    // ✅ COMMIT TRANSACTION (Lưu DB thành công rồi mới làm việc khác)
    await session.commitTransaction();
    console.log(`✅ Transaction committed successfully for order ${order._id}`);

    // ============================================================
    // 👉 ĐOẠN 2: BẮN JOB SANG WORKER + CẬP NHẬT mintStatus
    // (Đặt ở đây là an toàn nhất: DB đã xong, biến vẫn còn scope)
    // ============================================================
    try {
      if (buyerWallet && totalTicketsToMint > 0) {
        console.log(
          `💳 [MINT QUEUE] Kích hoạt Mint NFT cho Order ${order._id} -> Wallet: ${buyerWallet} | Tickets: ${totalTicketsToMint}`,
        );

        // 4.1 Cập nhật mintStatus của tất cả tickets thuộc order này sang "pending"
        const updateResult = await Ticket.updateMany(
          { order: order._id, mintStatus: "unminted" },
          { $set: { mintStatus: "pending" } },
        );

        const modifiedCount =
          updateResult.modifiedCount ?? updateResult.nModified ?? 0;

        console.log(
          `📌 [MINT STATUS] Order ${order._id}: set mintStatus=pending cho ${modifiedCount} ticket(s)`,
        );

        // 4.2 Gửi job Mint sang Worker (từng loại vé)
        const TicketType = require("../models/ticketType"); // Import model nếu chưa có

        for (const item of existingItems) {
          const tt = await TicketType.findById(item.ticketType).lean();
          if (tt && tt.onChainId) {
            console.log(
              `💳 [MINT QUEUE] Dispatching Mint Job: Order ${order._id} -> Wallet: ${buyerWallet} | onChainId: ${tt.onChainId} | QT: ${item.quantity}`,
            );
            await addMintJob(
              buyerWallet,
              item.quantity,
              order._id.toString(),
              tt.onChainId,
            );
          } else {
            console.warn(
              `⚠️ [MINT QUEUE] Thiếu onChainId cho TicketType ${item.ticketType} của Order ${order._id}`,
            );
          }
        }
      } else {
        console.warn(
          `⚠️ Bỏ qua Mint: Không tìm thấy ví hoặc số lượng vé = 0. (Wallet: ${buyerWallet})`,
        );
      }
    } catch (queueError) {
      // Chỉ log lỗi queue, không throw để tránh rollback lại transaction thanh toán
      console.error(
        "❌ Lỗi đẩy Job Mint (User đã thanh toán nhưng chưa Mint):",
        queueError,
      );
    }

    await createNotificationSafe({
      recipientId: order.buyer,
      type: "payment_success",
      title: "Thanh toan thanh cong",
      message: `Don hang ${order.orderCode || order._id} da thanh toan thanh cong.`,
      priority: "high",
      metadata: {
        orderId: order._id.toString(),
        orderCode: order.orderCode || null,
        amount: order.totalAmount,
        transactionNo,
        bankCode,
      },
      channels: ["in_app"],
    });

    // ✅ RETURN KẾT QUẢ (Biến tickets, transaction vẫn còn nhìn thấy được)
    return { tickets, orderItems: existingItems, transaction };
  } catch (error) {
    console.error("❌ Error processing successful payment:", error);

    if (session.inTransaction()) {
      await session.abortTransaction();
      console.log("❌ Transaction aborted");
    }
    throw error;
  } finally {
    await session.endSession();
  }
};

const processFailedPayment = async (order, responseCode = null) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    console.log(`🔄 Processing failed payment for order ${order._id}...`);

    // ✅ KIỂM TRA IDEMPOTENCY
    if (order.status === "failed") {
      console.log(`⚠️ Order already marked as failed. Skipping.`);
      await session.commitTransaction();
      return { message: "Order already failed" };
    }

    // 1. Update order status
    order.status = "failed";
    order.failureReason = getFailureReason(responseCode); // ⭐ Lưu lý do fail
    await order.save({ session });

    // ✅ 2. TẠO TRANSACTION RECORD (dùng service)
    await transactionService.createTransaction(
      {
        orderId: order._id,
        amount: order.totalAmount,
        paymentMethod: "vnpay",
        transactionCode: null,
        status: "failed",
      },
      session,
    );

    // 3. Release tickets
    const orderItems = await OrderItem.find({ order: order._id }).session(
      session,
    );

    let totalTicketsReleased = 0;
    for (const item of orderItems) {
      await TicketType.findByIdAndUpdate(
        item.ticketType,
        { $inc: { quantitySold: -item.quantity } },
        { session },
      );
      totalTicketsReleased += item.quantity;
    }

    console.log(`✅ Order ${order._id} marked as FAILED`);
    console.log(
      `🎫 Released ${totalTicketsReleased} tickets back to inventory`,
    );

    await session.commitTransaction();

    await createNotificationSafe({
      recipientId: order.buyer,
      type: "payment_failed",
      title: "Thanh toan that bai",
      message: `Don hang ${order.orderCode || order._id} thanh toan that bai.`,
      priority: "high",
      metadata: {
        orderId: order._id.toString(),
        orderCode: order.orderCode || null,
        amount: order.totalAmount,
        responseCode,
        failureReason: order.failureReason,
      },
      channels: ["in_app"],
    });
  } catch (error) {
    console.error("❌ Error processing failed payment:", error);

    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * ⭐ XỬ LÝ KHI USER HỦY THANH TOÁN (Response Code = 24)
 */
const processCancelledPayment = async (order) => {
  const session = await mongoose.startSession();

  try {
    await session.startTransaction();

    console.log(`🔄 Processing cancelled payment for order ${order._id}...`);

    // ✅ KIỂM TRA IDEMPOTENCY
    if (order.status === "cancelled") {
      console.log(`⚠️ Order already marked as cancelled. Skipping.`);
      await session.commitTransaction();
      return { message: "Order already cancelled" };
    }

    // 1. Update order status
    order.status = "cancelled";
    order.cancelledAt = new Date();
    order.cancelReason = "User cancelled payment"; // ⭐ Lý do cancel
    await order.save({ session });

    // ✅ 2. TẠO TRANSACTION RECORD
    await transactionService.createTransaction(
      {
        orderId: order._id,
        amount: order.totalAmount,
        paymentMethod: "vnpay",
        transactionCode: null,
        status: "cancelled", // ⭐ Status khác với failed
      },
      session,
    );

    // 3. Release tickets
    const orderItems = await OrderItem.find({ order: order._id }).session(
      session,
    );

    let totalTicketsReleased = 0;
    for (const item of orderItems) {
      await TicketType.findByIdAndUpdate(
        item.ticketType,
        { $inc: { quantitySold: -item.quantity } },
        { session },
      );
      totalTicketsReleased += item.quantity;
    }

    console.log(`✅ Order ${order._id} marked as CANCELLED`);
    console.log(
      `🎫 Released ${totalTicketsReleased} tickets back to inventory`,
    );

    await session.commitTransaction();

    await createNotificationSafe({
      recipientId: order.buyer,
      type: "payment_cancelled",
      title: "Thanh toan da huy",
      message: `Ban da huy thanh toan cho don hang ${order.orderCode || order._id}.`,
      priority: "medium",
      metadata: {
        orderId: order._id.toString(),
        orderCode: order.orderCode || null,
        amount: order.totalAmount,
      },
      channels: ["in_app"],
    });

    return {
      success: true,
      message: "Order cancelled by user",
      orderId: order._id,
    };
  } catch (error) {
    console.error("❌ Error processing cancelled payment:", error);

    if (session.inTransaction()) {
      await session.abortTransaction();
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

/**
 * ⭐ MAP VNPAY RESPONSE CODE → HUMAN READABLE MESSAGE
 */
const getFailureReason = (responseCode) => {
  const reasons = {
    "07": "Giao dịch bị nghi ngờ gian lận",
    "09": "Chưa hoàn tất xác thực 3D-Secure",
    10: "Thẻ/Tài khoản chưa đăng ký dịch vụ Internet Banking",
    11: "Giao dịch hết hạn timeout",
    12: "Tài khoản bị khóa",
    13: "Sai mật khẩu OTP quá số lần quy định",
    51: "Tài khoản không đủ số dư",
    65: "Vượt quá hạn mức giao dịch trong ngày",
    75: "Ngân hàng đang bảo trì",
    79: "Nhập sai mật khẩu thanh toán quá số lần quy định",
    99: "Lỗi không xác định",
  };

  return reasons[responseCode] || `Lỗi thanh toán (Code: ${responseCode})`;
};

// ✅ SỬA handleFinalizeOrder - THÊM KIỂM TRA
const handleFinalizeOrder = async (req, res) => {
  try {
    const { orderId, vnp_ResponseCode, vnp_TransactionNo, vnp_BankCode } =
      req.body;

    console.log("[FINALIZE ORDER] Request:", { orderId, vnp_ResponseCode });

    // ✅ KIỂM TRA ORDER TRƯỚC
    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    // Kiểm tra quyền
    if (req.user.id !== order.buyer.toString()) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ✅ KIỂM TRA ORDER ĐÃ XỬ LÝ CHƯA (TRƯỚC KHI GỌI processSuccessfulPayment)
    if (order.status !== "pending") {
      console.log(`⚠️ Order already processed: ${order.status}`);
      return res.status(200).json({
        success: true,
        message: `Order already ${order.status}`,
        status: order.status,
      });
    }

    // Xử lý theo response code
    if (vnp_ResponseCode === "00") {
      // ✅ GỌI processSuccessfulPayment (có idempotency check bên trong)
      const result = await processSuccessfulPayment(
        order,
        vnp_TransactionNo,
        vnp_BankCode,
      );

      return res.status(200).json({
        success: true,
        message: "Payment successful. Tickets created.",
        status: "paid",
        data: {
          ticketsCreated: result.tickets?.length || 0,
        },
      });
    } else if (vnp_ResponseCode === "24") {
      // ⭐ USER HỦY
      await processCancelledPayment(order);

      return res.status(200).json({
        success: true,
        message: "Payment cancelled by user",
        status: "cancelled",
      });
    } else {
      // ❌ FAILED
      await processFailedPayment(order, vnp_ResponseCode);

      return res.status(200).json({
        success: true,
        message: "Payment failed",
        status: "failed",
        failureReason: getFailureReason(vnp_ResponseCode),
      });
    }
  } catch (error) {
    console.error("[FINALIZE ORDER] Error:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  handleVnpayIpn,
  handleVnpayReturn,
  processSuccessfulPayment,
  processFailedPayment,
  processCancelledPayment, // ⭐ Export thêm
  getFailureReason, // ⭐ Export để dùng ở nơi khác
  handleFinalizeOrder,
};
