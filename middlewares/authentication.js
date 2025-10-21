const jwt = require("jsonwebtoken");
const User = require("../models/user");

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
    error.status = 401;
    next(error);
  }
};

module.exports = {
  tokenExtractor,
  userExtractor,
};
