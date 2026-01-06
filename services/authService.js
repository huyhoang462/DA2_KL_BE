const User = require("../models/user");
const bcrypt = require("bcryptjs");
const Verification = require("../models/verification");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const {
  sendVerificationEmail,
  sendResetPasswordCode,
} = require("../utils/mailer");

// [PRIVY UPDATE] Helper: đọc RSA private key để ký JWT kiểu RS256
let cachedPrivyPrivateKey = null;

const loadPrivyPrivateKey = () => {
  try {
    if (process.env.PRIVY_PRIVATE_KEY_BASE64) {
      const pem = Buffer.from(
        process.env.PRIVY_PRIVATE_KEY_BASE64,
        "base64"
      ).toString("utf8");
      return pem;
    }

    const keyPath =
      process.env.PRIVY_PRIVATE_KEY_PATH ||
      path.join(__dirname, "..", "config", "privy-private.pem");

    if (fs.existsSync(keyPath)) {
      return fs.readFileSync(keyPath, "utf8");
    }

    console.error(
      "[PRIVY] Không tìm thấy private key. Thiết lập PRIVY_PRIVATE_KEY_BASE64 hoặc PRIVY_PRIVATE_KEY_PATH."
    );
    return null;
  } catch (err) {
    console.error("[PRIVY] Lỗi đọc private key:", err);
    return null;
  }
};

const getPrivyPrivateKey = () => {
  if (!cachedPrivyPrivateKey) {
    cachedPrivyPrivateKey = loadPrivyPrivateKey();
  }
  return cachedPrivyPrivateKey;
};

// [PRIVY UPDATE] 1. Hàm helper để tạo Token cho Privy (RS256)
// userId dùng cho claim `sub`, email (optional) thêm vào payload để Privy map user
const generatePrivyAuthToken = (userId, email) => {
  const PRIVY_APP_ID = process.env.PRIVY_APP_ID; // app id của Privy (không dùng để ký nữa)
  const PRIVY_JWT_AUD = process.env.PRIVY_JWT_AUD; // phải trùng với JWT aud claim trên Privy (shine-ticket-auth)
  const PRIVY_JWT_ISS = process.env.PRIVY_JWT_ISS; // optional, vì trong Dashboard bạn chưa bật verify iss
  const privateKey = getPrivyPrivateKey();

  // Theo Dashboard hiện tại: chỉ bắt buộc aud. iss là tùy chọn.
  if (!PRIVY_APP_ID || !PRIVY_JWT_AUD || !privateKey) {
    console.error(
      "[PRIVY] Thiếu cấu hình PRIVY_APP_ID / PRIVY_JWT_AUD hoặc privateKey. Không tạo được privyToken."
    );
    return null;
  }

  const nowInSeconds = Math.floor(Date.now() / 1000);
  const expiresInSeconds = 60 * 60; // 1 giờ

  const payload = {
    sub: userId.toString(),
    aud: PRIVY_JWT_AUD,
    app_id: PRIVY_APP_ID, // thêm để Privy biết app nào (tuỳ chọn nhưng hữu ích)
    iat: nowInSeconds,
    exp: nowInSeconds + expiresInSeconds,
  };

  if (PRIVY_JWT_ISS) {
    payload.iss = PRIVY_JWT_ISS;
  }

  if (email) {
    payload.email = email;
  }

  try {
    const token = jwt.sign(payload, privateKey, {
      algorithm: "RS256",
    });
    return token;
  } catch (err) {
    console.error("[PRIVY] Lỗi ký privyToken:", err);
    return null;
  }
};

const login = async ({ email, password }) => {
  if (!email || !password) {
    const error = new Error("Email and password are required");
    error.status = 400;
    throw error;
  }

  const user = await User.findOne({ email });
  if (!user) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  const accessTokenPayload = {
    id: user._id,
    email: user.email,
    role: user.role,
  };
  const accessToken = jwt.sign(
    accessTokenPayload,
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: "2d",
    }
  );

  const refreshTokenPayload = {
    id: user._id,
  };
  const refreshToken = jwt.sign(
    refreshTokenPayload,
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: "7d",
    }
  );
  // [PRIVY UPDATE] 2. Tạo Privy Token khi đăng nhập thành công
  // Khi frontend nhận token này, nó sẽ tự động mở lại ví cũ của user này
  const privyToken = generatePrivyAuthToken(user._id, user.email);
  return {
    accessToken,
    refreshToken,
    privyToken, // trả về cho frontend
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
    },
  };
};

const refreshToken = async (token) => {
  if (!token) {
    const error = new Error("Refresh token is required");
    error.status = 401;
    throw error;
  }

  try {
    //  Xác thực Refresh Token
    const decoded = jwt.verify(token, process.env.REFRESH_TOKEN_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) {
      const error = new Error("User not found");
      error.status = 403;
      throw error;
    }

    // Tạo Access Token mới
    const accessTokenPayload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };
    const newAccessToken = jwt.sign(
      accessTokenPayload,
      process.env.ACCESS_TOKEN_SECRET,
      {
        expiresIn: "15m",
      }
    );

    // Trả về Access Token mới
    // Có thể trả về privyToken mới ở đây nếu cần, nhưng thường chỉ cần lúc login
    return { accessToken: newAccessToken };
  } catch (err) {
    const error = new Error("Invalid refresh token");
    error.status = 403;
    throw error;
  }
};

const registerRequest = async ({ email, password, fullName, role, phone }) => {
  if (!email || !password || !fullName || !role || !phone) {
    const error = new Error("All fields are required");
    error.status = 400;
    throw error;
  }

  if (password.length < 6) {
    const error = new Error("Password must be at least 6 characters long");
    error.status = 400;
    throw error;
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    const error = new Error("User already exists");
    error.status = 400;
    throw error;
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  const newVerification = new Verification({
    email,
    passwordHash,
    fullName,
    role: "user",
    phone,
    otp,
  });
  await newVerification.save();

  await sendVerificationEmail(email, otp);

  return {
    message: "Verification code sent to your email. Please check your inbox.",
  };
};

const verifyEmail = async ({ email, otp }) => {
  if (!email || !otp) {
    const error = new Error("Email and OTP are required");
    error.status = 400;
    throw error;
  }

  const verificationRecord = await Verification.findOne({ email });

  if (!verificationRecord) {
    const error = new Error(
      "Verification record not found. Please try registering again."
    );
    error.status = 404;
    throw error;
  }

  if (verificationRecord.otp !== otp) {
    const error = new Error("Invalid verification code.");
    error.status = 400;
    throw error;
  }

  const newUser = new User({
    email: verificationRecord.email,
    passwordHash: verificationRecord.passwordHash,
    fullName: verificationRecord.fullName,
    phone: verificationRecord.phone,
    role: verificationRecord.role,
  });

  await newUser.save();
  await Verification.findByIdAndDelete(verificationRecord._id);
  // [PRIVY UPDATE] 3. Tạo Privy Token ngay khi đăng ký thành công
  // Để frontend có thể tạo ví MỚI ngay lập tức
  const privyToken = generatePrivyAuthToken(newUser._id, newUser.email);
  return { message: "User created and verified successfully!", privyToken };
};

const forgotPassword = async ({ email }) => {
  if (!email) {
    const error = new Error("Email is required");
    error.status = 400;
    throw error;
  }
  const user = await User.findOne({ email });
  if (user) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordCode = code;
    user.resetPasswordExpires = Date.now() + 1000 * 60 * 10;
    await user.save();

    await sendResetPasswordCode(email, code);
  }
  return {
    message:
      "We have sent a verification code to your email. Please check your inbox.",
  };
};

const verifyResetCode = async ({ email, code }) => {
  if (!email || !code) {
    const error = new Error("Email and code are required");
    error.status = 400;
    throw error;
  }
  const user = await User.findOne({ email });

  if (
    !user ||
    user.resetPasswordCode !== code ||
    !user.resetPasswordExpires ||
    user.resetPasswordExpires < Date.now()
  ) {
    const error = new Error("Invalid or expired code");
    error.status = 400;
    throw error;
  }
  return { message: "Code verified. You can now reset your password." };
};

const resetPassword = async ({ email, code, newPassword }) => {
  if (!email || !code || !newPassword) {
    const error = new Error("All fields are required");
    error.status = 400;
    throw error;
  }
  const user = await User.findOne({ email });
  if (
    !user ||
    user.resetPasswordCode !== code ||
    !user.resetPasswordExpires ||
    user.resetPasswordExpires < Date.now()
  ) {
    const error = new Error("Invalid or expired code");
    error.status = 400;
    throw error;
  }
  if (newPassword.length < 6) {
    const error = new Error("Password must be at least 6 characters");
    error.status = 400;
    throw error;
  }
  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(newPassword, salt);
  user.resetPasswordCode = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  return { message: "Password reset successfully!" };
};

const changePassword = async ({ userId, oldPassword, newPassword }) => {
  if (!userId || !oldPassword || !newPassword) {
    const error = new Error("All fields are required");
    error.status = 400;
    throw error;
  }

  if (oldPassword === newPassword) {
    const error = new Error("New password must be different from old password");
    error.status = 400;
    throw error;
  }

  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  const isMatch = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!isMatch) {
    const error = new Error("Old password is incorrect");
    error.status = 400;
    throw error;
  }

  if (newPassword.length < 6) {
    const error = new Error("New password must be at least 6 characters");
    error.status = 400;
    throw error;
  }

  const salt = await bcrypt.genSalt(10);
  user.passwordHash = await bcrypt.hash(newPassword, salt);
  await user.save();

  return { message: "Password changed successfully!" };
};

const editProfile = async ({ userId, fullName, phone }) => {
  if (!userId || !fullName || !phone) {
    const error = new Error("All fields are required");
    error.status = 400;
    throw error;
  }
  const user = await User.findById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }
  user.fullName = fullName;
  user.phone = phone;
  await user.save();
  return {
    message: "Profile updated successfully!",
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
    },
  };
};
// [THÊM MỚI] Hàm xử lý Logic cập nhật ví trong Database
const syncWallet = async ({ userId, walletAddress }) => {
  if (!userId || !walletAddress) {
    const error = new Error("Missing userId or walletAddress");
    error.status = 400;
    throw error;
  }

  // Tìm user hiện tại
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  // Nếu user đã có wallet address này rồi thì không cần update
  if (user.walletAddress === walletAddress) {
    return {
      message: "Wallet already synced",
      walletAddress: user.walletAddress,
    };
  }

  // Cập nhật wallet address mới
  user.walletAddress = walletAddress;
  await user.save();

  return {
    message: "Wallet synced successfully",
    walletAddress: user.walletAddress,
  };
};
module.exports = {
  syncWallet,
  login,
  refreshToken,
  registerRequest,
  verifyEmail,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  changePassword,
  editProfile,
};
