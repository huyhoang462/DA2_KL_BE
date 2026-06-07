const { Server } = require("socket.io");

let io;
const onlineUsers = new Map();

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: "http://localhost:5173" || process.env.CLIENT_URL,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // Khi user login/load trang, FE sẽ gửi userId lên để định danh
    socket.on("addNewUser", (userId) => {
      if (userId) {
        onlineUsers.set(userId, socket.id);
        console.log(
          `[SOCKET] User ${userId} is online. Total: ${onlineUsers.size}`,
        );
      }
    });
    // Khi user ngắt kết nối (tắt tab, mất mạng)
    socket.on("disconnect", () => {
      // Tìm và xóa user khỏi danh sách online
      for (let [userId, socketId] of onlineUsers.entries()) {
        if (socketId === socket.id) {
          onlineUsers.delete(userId);
          console.log(`[SOCKET] User ${userId} disconnected.`);
          break;
        }
      }
    });
    return io;
  });
};
// Hàm tiện ích để gọi từ các Service khác
const getIo = () => {
  if (!io) throw new Error("Socket.io is not initialized!");
  return io;
};

const getReceiverSocketId = (userId) => {
  console.log("[SOCKET hàm get recuever ID]:", userId);
  return onlineUsers.get(userId);
};

module.exports = { initSocket, getIo, getReceiverSocketId };
