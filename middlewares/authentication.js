// middlewares/auth.js
const jwt = require("jsonwebtoken");
const User = require("../models/user");

// Middleware 1: Trích xuất Token (giữ nguyên)
// Nhiệm vụ: Lấy chuỗi token từ header "Authorization" và gắn vào request.token
const tokenExtractor = (request, response, next) => {
  const authorization = request.get("authorization");
  if (authorization && authorization.startsWith("Bearer ")) {
    request.token = authorization.replace("Bearer ", "");
  } else {
    request.token = null;
  }
  next();
};

// Middleware 2: Trích xuất User (cải thiện)
// Nhiệm vụ: Xác thực token và tìm user tương ứng, sau đó gắn vào request.user
// Middleware này chỉ xác thực, chưa kiểm tra quyền.
const userExtractor = async (request, response, next) => {
  if (!request.token) {
    // Nếu không có token, không thể xác thực user
    const error = new Error("Token missing");
    error.status = 401;
    return next(error);
  }

  try {
    const decodedToken = jwt.verify(request.token, process.env.JWT_SECRET);

    if (!decodedToken.id) {
      const error = new Error("Token invalid or malformed");
      error.status = 401;
      return next(error);
    }

    const user = await User.findById(decodedToken.id).select("role");
    if (!user) {
      const error = new Error("User associated with token not found");
      error.status = 401;
      return next(error);
    }

    request.user = user; // Gắn user vào request
    next();
  } catch (error) {
    // Chuyển lỗi từ jwt.verify (TokenExpiredError, JsonWebTokenError) cho error handler
    error.status = 401;
    next(error);
  }
};

module.exports = {
  tokenExtractor,
  userExtractor,
};
