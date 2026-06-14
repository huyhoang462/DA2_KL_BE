const jwt = require("jsonwebtoken");
const User = require("../models/user");

// Middleware 1: Trích xuất Token từ header "Authorization" và gắn vào request.token
const tokenExtractor = (request, response, next) => {
  const authorization = request.get("authorization");
  if (authorization && authorization.startsWith("Bearer ")) {
    request.token = authorization.replace("Bearer ", "");
  } else {
    request.token = null;
  }
  next();
};

// Middleware 2: Xác thực token và tìm user, gắn vào request.user
const userExtractor = async (request, response, next) => {
  // Nếu không có token → Lỗi 401
  if (!request.token) {
    const error = new Error("Token missing");
    error.status = 401;
    return next(error);
  }

  try {
    // Verify access token
    const decodedToken = jwt.verify(
      request.token,
      process.env.ACCESS_TOKEN_SECRET,
    );

    if (!decodedToken.id) {
      const error = new Error("Token invalid or malformed");
      error.status = 401;
      return next(error);
    }

    // Tìm user trong database
    const user = await User.findById(decodedToken.id).select(
      "role email fullName phone",
    );
    if (!user) {
      const error = new Error("User associated with token not found");
      error.status = 401;
      return next(error);
    }

    // Gắn user vào request để các route handler sử dụng
    request.user = user;
    next();
  } catch (error) {
    // Token hết hạn → Frontend sẽ tự động gọi /refresh-token
    if (error.name === "TokenExpiredError") {
      const err = new Error("Token expired");
      err.status = 401;
      err.code = "TOKEN_EXPIRED";
      return next(err);
    }

    // Token invalid
    if (error.name === "JsonWebTokenError") {
      const err = new Error("Invalid token");
      err.status = 401;
      return next(err);
    }

    // Other errors
    error.status = 401;
    next(error);
  }
};

// Middleware 3: Optional user extractor (không throw 401 nếu không có token)
const optionalUserExtractor = async (request, response, next) => {
  if (!request.token) {
    return next();
  }

  try {
    const decodedToken = jwt.verify(
      request.token,
      process.env.ACCESS_TOKEN_SECRET,
    );

    if (decodedToken.id) {
      const user = await User.findById(decodedToken.id).select(
        "role email fullName phone",
      );
      if (user) {
        request.user = user;
      }
    }
    next();
  } catch (error) {
    // Không ném lỗi, coi như user chưa đăng nhập
    next();
  }
};

module.exports = {
  tokenExtractor,
  userExtractor,
  optionalUserExtractor,
};
