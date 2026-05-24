const { vnpayConfig } = require("../config/vnpayConfig");
const Order = require("../models/order");
const OrderItem = require("../models/orderItem");
const TicketType = require("../models/ticketType");
const Ticket = require("../models/ticket");
const { addRelayerBuyTicketJob } = require("../services/queueService");
const mongoose = require("mongoose");
const { createTicketsForOrder } = require("../services/ticketService");
const transactionService = require("../services/transactionService");
const { createNotificationSafe } = require("../services/notificationService");
const { ethers } = require("ethers");

// Callback từ Worker sau khi relayer mua vé on-chain xong (cập nhật mintStatus của vé, lưu txHash, etc.)
const handleRelayerCallback = async (req, res) => {
  try {
    console.log("\n=== 🔁 RELAYER CALLBACK RECEIVED ===");
    console.log("Timestamp:", new Date().toISOString());

    const {
      orderId,
      status,
      txHash,
      chainId,
      contractAddress,
      blockNumber,
      relayerAddress,
      errorMessage,
      receipt,
    } = req.body;

    console.log("[RELAYER CALLBACK] Payload summary:", {
      orderId,
      status,
      txHash,
      chainId,
      contractAddress,
      blockNumber,
      relayerAddress,
    });

    if (!orderId || !status) {
      console.warn("[RELAYER CALLBACK] Missing required fields", {
        orderId,
        status,
      });
      return res.status(400).json({
        success: false,
        message: "Missing required fields: orderId, status",
      });
    }

    const normalizedStatus = String(status).toLowerCase();
    if (!["success", "failed"].includes(normalizedStatus)) {
      console.warn("[RELAYER CALLBACK] Invalid status received", {
        status,
      });
      return res.status(400).json({
        success: false,
        message: "Invalid status. Expected success or failed",
      });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      console.warn("[RELAYER CALLBACK] Order not found", { orderId });
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status !== "paid") {
      console.warn("[RELAYER CALLBACK] Order is not in paid state", {
        orderId,
        currentStatus: order.status,
      });
      return res.status(409).json({
        success: false,
        message: `Order status must be paid before relayer callback. Current status: ${order.status}`,
      });
    }

    order.paymentInfo = {
      ...(order.paymentInfo || {}),
      relayer: {
        status: normalizedStatus,
        txHash: txHash || null,
        chainId: chainId || null,
        contractAddress: contractAddress || null,
        blockNumber: blockNumber || null,
        relayerAddress: relayerAddress || null,
        errorMessage: errorMessage || null,
        callbackReceivedAt: new Date(),
        receipt: receipt || null,
      },
    };

    if (normalizedStatus === "success" && txHash) {
      order.txHash = txHash;
    }

    await order.save();
    console.log("[RELAYER CALLBACK] Updated order paymentInfo.relayer", {
      orderId: order._id.toString(),
      relayerStatus: normalizedStatus,
      txHash: order.txHash || null,
    });

    // If relayer reports success, attempt to mark tickets as minted and set order status
    if (normalizedStatus === "success") {
      try {
        const session = await mongoose.startSession();
        try {
          await session.startTransaction();

          // Update tickets for this order: set mintStatus = 'minted' and record some on-chain info
          const ticketUpdate = {
            $set: {
              mintStatus: "minted",
              blockchainNetwork:
                chainId || (receipt && receipt.chainId) || null,
              contractAddress: contractAddress || null,
            },
          };

          const updateResult = await Ticket.updateMany(
            { order: order._id, mintStatus: { $in: ["unminted", "pending"] } },
            ticketUpdate,
            { session },
          );

          const modifiedCount =
            updateResult.modifiedCount ?? updateResult.nModified ?? 0;

          // Also mark order as completed (new enum value)
          // Only change if current status is 'paid' to preserve other flows
          if (order.status === "paid") {
            await Order.findByIdAndUpdate(
              order._id,
              { $set: { status: "completed" } },
              { session },
            );
            console.log("[RELAYER CALLBACK] Updated order status", {
              orderId: order._id.toString(),
              from: "paid",
              to: "completed",
            });
          }

          await session.commitTransaction();

          console.log(
            `[RELAYER CALLBACK] Marked ${modifiedCount} tickets as minted and set order ${order._id} status=completed`,
          );
        } catch (innerErr) {
          if (session.inTransaction()) await session.abortTransaction();
          console.error(
            "[RELAYER CALLBACK] Error updating tickets/order:",
            innerErr,
          );
        } finally {
          await session.endSession();
        }
      } catch (sessErr) {
        console.error("[RELAYER CALLBACK] Could not start session:", sessErr);
      }
    } else {
      console.log("[RELAYER CALLBACK] Received failed status from worker", {
        orderId: order._id.toString(),
        errorMessage: errorMessage || null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Relayer callback processed successfully",
      orderId: order._id.toString(),
      relayerStatus: normalizedStatus,
    });
  } catch (error) {
    console.error("[RELAYER CALLBACK] Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

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
    // ============================================================
    try {
      // Guardrails kiểm tra ví và số lượng vé
      const isValidWallet =
        buyerWallet &&
        buyerWallet.trim() !== "" &&
        buyerWallet.toLowerCase() !== "0x0" &&
        buyerWallet !== "0x0000000000000000000000000000000000000000" &&
        buyerWallet !== "0x" &&
        buyerWallet !== "0X0000000000000000000000000000000000000000";

      if (!isValidWallet) {
        console.error(
          `❌ [RELAYER QUEUE] Lỗi nghiêm trọng: Địa chỉ ví không hợp lệ (Wallet: ${buyerWallet}). Không thể đẩy Job đúc vé On-chain cho Order ${order._id}!`,
        );
      } else if (totalTicketsToMint <= 0) {
        console.error(
          `❌ [RELAYER QUEUE] Lỗi nghiêm trọng: Tổng số lượng vé cần đúc <= 0. Không thể đẩy Job cho Order ${order._id}!`,
        );
      } else {
        console.log(
          `💳 [RELAYER QUEUE] Kích hoạt Mint NFT cho Order ${order._id} -> Wallet: ${buyerWallet} | Tickets: ${totalTicketsToMint}`,
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

        // 4.2 Cấu trúc Payload mảng phẳng
        const TicketType = require("../models/ticketType");
        const eventIds = [];
        const quantities = [];

        for (const item of existingItems) {
          const tt = await TicketType.findById(item.ticketType).lean();
          if (tt && tt.onChainId) {
            // Đẩy vào mảng song song
            eventIds.push(Number(tt.onChainId)); // onChainId từ DB
            quantities.push(Number(item.quantity)); // số lượng vé
          } else {
            console.error(
              `⚠️ [RELAYER QUEUE] Thiếu onChainId cho TicketType ${item.ticketType} của Order ${order._id}`,
            );
          }
        }

        // Validate payload mảng trước khi đẩy
        if (eventIds.length === 0 || eventIds.length !== quantities.length) {
          console.error(
            `❌ [RELAYER QUEUE] Payload không hợp lệ cho Order ${order._id}! eventIds: ${eventIds.length}, quantities: ${quantities.length}`,
          );
        } else {
          // Chỉ đẩy nếu là thanh toán bằng fiat qua VNPay
          if (
            order.paymentMethod === "vnd" ||
            order.paymentMethod === "vnpay"
          ) {
            const relayerPayload = {
              orderId: order._id.toString(),
              eventIds: eventIds,
              quantities: quantities,
              buyerAddress: buyerWallet,
            };

            await addRelayerBuyTicketJob(relayerPayload);
            console.log(
              `🚀 [RELAYER BATCH BUY] Enqueued for order ${order._id} from payment success flow`,
              relayerPayload,
            );
          }
        }
      }
    } catch (queueError) {
      // Chỉ log lỗi queue, không throw để tránh rollback lại transaction thanh toán
      console.error(
        "❌ Lỗi đẩy Job Queue sau thanh toán thành công:",
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
  handleRelayerCallback,
  processSuccessfulPayment,
  processFailedPayment,
  processCancelledPayment, // ⭐ Export thêm
  getFailureReason, // ⭐ Export để dùng ở nơi khác
  handleFinalizeOrder,
  handleFinalizeOrderWeb3,
};

/**
 * Handle finalize order for Web3 flow
 * - FE provides `orderId` and `txHash`
 * - BE verifies tx on-chain, extracts tokenIds from Transfer events
 * - Creates tickets (if missing) and assigns tokenIds + mintStatus = 'minted'
 */
async function handleFinalizeOrderWeb3(req, res) {
  try {
    const { orderId, txHash } = req.body;

    if (!orderId || !txHash) {
      return res
        .status(400)
        .json({ success: false, message: "Missing orderId or txHash" });
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return res
        .status(404)
        .json({ success: false, message: "Order not found" });
    }

    // Authz: caller must be buyer
    if (req.user.id !== order.buyer.toString()) {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    // Idempotency: if already processed with same txHash or already paid
    if (order.status === "paid" && order.txHash === txHash) {
      return res
        .status(200)
        .json({ success: true, message: "Order already processed" });
    }

    const session = await mongoose.startSession();

    try {
      await session.startTransaction();

      // 1) Verify on-chain
      const rpcUrl = process.env.WEB3_RPC_URL;
      if (!rpcUrl) {
        throw new Error("WEB3_RPC_URL is not configured");
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt) {
        throw new Error("Transaction receipt not found or not yet mined");
      }

      // Check status
      if (Number(receipt.status) !== 1) {
        // mark failed
        await processFailedPayment(order, `web3_tx_status_${receipt.status}`);
        await session.commitTransaction();
        return res
          .status(400)
          .json({ success: false, message: "On-chain transaction failed" });
      }

      const contractAddress = (
        process.env.SMART_CONTRACT_ADDRESS || ""
      ).toLowerCase();
      if (!contractAddress) {
        throw new Error("SMART_CONTRACT_ADDRESS not configured");
      }

      if (!receipt.to || receipt.to.toLowerCase() !== contractAddress) {
        throw new Error(
          "Transaction 'to' does not match expected contract address",
        );
      }

      // NOTE: Do not enforce strict 'from' equality here. FE may submit txs sent
      // by a relayer or different signer; we instead rely on Transfer events
      // to attribute minted tokenIds to buyer. Keep an audit log for tracing.
      console.log(
        "[FINALIZE ORDER WEB3] receipt.from:",
        receipt.from,
        "order.walletAddress:",
        order.walletAddress,
      );

      // Extract Transfer tokenIds
      const transferTopic = ethers.id("Transfer(address,address,uint256)");
      const tokenIds = [];
      for (const log of receipt.logs || []) {
        if (!log.topics || log.topics.length === 0) continue;
        if (
          log.address &&
          log.address.toLowerCase() === contractAddress &&
          log.topics[0] === transferTopic
        ) {
          // tokenId is topics[3] (indexed)
          const raw = log.topics[3];
          try {
            const id = ethers.toBigInt(raw).toString();
            tokenIds.push(id);
          } catch (e) {
            console.warn("Unable to parse tokenId from log topic:", raw, e);
          }
        }
      }

      // 2) Verify counts vs order items
      const orderItems = await OrderItem.find({ order: order._id }).session(
        session,
      );
      const totalQty = orderItems.reduce((s, it) => s + it.quantity, 0);

      if (tokenIds.length !== totalQty) {
        throw new Error(
          `Token IDs count (${tokenIds.length}) does not match order quantity (${totalQty})`,
        );
      }

      // 3) Update order status & payment info
      order.status = "paid";
      order.txHash = txHash;
      order.paymentInfo = {
        ...(order.paymentInfo || {}),
        method: "web3",
        txHash,
        contractAddress: receipt.to,
        blockNumber: receipt.blockNumber,
        verifiedAt: new Date(),
      };

      await order.save({ session });

      // 4) Create tickets (if not exist) — reuse createTicketsForOrder
      const existingTickets = await Ticket.find({ order: order._id }).session(
        session,
      );
      let createdTickets = existingTickets;
      if (existingTickets.length === 0) {
        createdTickets = await createTicketsForOrder(
          order._id,
          order.buyer,
          session,
        );
      }

      if (createdTickets.length !== tokenIds.length) {
        throw new Error("Created tickets count mismatch");
      }

      // 5) Assign tokenIds to tickets and mark minted
      for (let i = 0; i < createdTickets.length; i++) {
        const t = createdTickets[i];
        const tokenId = tokenIds[i];
        await Ticket.findByIdAndUpdate(
          t._id,
          {
            tokenId: tokenId.toString(),
            mintStatus: "minted",
            blockchainNetwork: receipt.chainId || null,
          },
          { session },
        );
      }

      // 6) Create transaction record
      await transactionService.createTransaction(
        {
          orderId: order._id,
          amount: order.totalAmount,
          paymentMethod: "web3",
          transactionCode: txHash,
          status: "success",
        },
        session,
      );

      await session.commitTransaction();

      // Notification (best-effort, outside tx)
      await createNotificationSafe({
        recipientId: order.buyer,
        type: "payment_success",
        title: "Thanh toán on-chain thành công",
        message: `Đơn hàng ${order.orderCode || order._id} đã xác thực on-chain và hoàn tất.`,
        priority: "high",
        metadata: {
          orderId: order._id.toString(),
          txHash,
          tokenIds,
        },
        channels: ["in_app"],
      });

      return res.status(200).json({
        success: true,
        message: "Order verified and updated successfully",
      });
    } catch (err) {
      if (session.inTransaction()) await session.abortTransaction();
      console.error("[FINALIZE ORDER WEB3] Error:", err);
      return res.status(400).json({ success: false, message: err.message });
    } finally {
      await session.endSession();
    }
  } catch (error) {
    console.error("[FINALIZE ORDER WEB3] Fatal:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
}
