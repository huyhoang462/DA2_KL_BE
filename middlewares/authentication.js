const jwt = require("jsonwebtoken");
const User = require("../models/user");
const { refreshToken: refreshAccessToken } = require("../services/authService");

//  Trích xuất Token: Lấy chuỗi token từ header "Authorization" và gắn vào request.token
const tokenExtractor = (request, response, next) => {
  const authorization = request.get("authorization");
  if (authorization && authorization.startsWith("Bearer ")) {
    request.token = authorization.replace("Bearer ", "");
  } else {
    request.token = null;
  }
  next();
};

// Middleware 2: Trích xuất User : Xác thực token và tìm user tương ứng, sau đó gắn vào request.user
const userExtractor = async (request, response, next) => {
  if (!request.token) {
    const error = new Error("Token missing");
    error.status = 401;
    return next(error);
  }

  try {
    const decodedToken = jwt.verify(
      request.token,
      process.env.ACCESS_TOKEN_SECRET
    );

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

    request.user = user;
    next();
  } catch (error) {
    // Trường hợp access token hết hạn -> thử dùng refresh token để tự động cấp token mới
    if (error.name === "TokenExpiredError") {
      try {
        const refreshTokenCookie = request.cookies && request.cookies.jwt;

        if (!refreshTokenCookie) {
          const err = new Error(
            "Access token expired and no refresh token provided"
          );
          err.status = 401;
          return next(err);
        }

        // Gọi logic refresh token đã có trong authService
        const { accessToken: newAccessToken } = await refreshAccessToken(
          refreshTokenCookie
        );

        // Xác thực lại access token mới để lấy thông tin user
        const decodedNewToken = jwt.verify(
          newAccessToken,
          process.env.ACCESS_TOKEN_SECRET
        );

        const user = await User.findById(decodedNewToken.id).select("role");
        if (!user) {
          const err = new Error(
            "User associated with refreshed token not found"
          );
          err.status = 401;
          return next(err);
        }

        // Gắn user vào request để các route phía sau sử dụng
        request.user = user;

        // Gửi lại access token mới cho client (client có thể đọc từ header để cập nhật)
        response.set("x-access-token", newAccessToken);

        return next();
      } catch (refreshError) {
        refreshError.status = refreshError.status || 401;
        return next(refreshError);
      }
    }

    error.status = 401;
    next(error);
  }
};

module.exports = {
  tokenExtractor,
  userExtractor,
};
