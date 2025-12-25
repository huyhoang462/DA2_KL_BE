const {
  login,
  registerRequest,
  verifyEmail,
  forgotPassword,
  verifyResetCode,
  resetPassword,
  changePassword,
  editProfile,
  refreshToken,
  syncWallet,
} = require("../services/authService");

const handleLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { accessToken, refreshToken, user, privyToken } = await login({
      email,
      password,
    });

    // Log access token sau khi đăng nhập thành công (phục vụ debug check-in)
    console.log(
      "[AUTH LOGIN SUCCESS] user=%s role=%s accessToken=%s",
      user.id,
      user.role,
      accessToken
    );

    res.cookie("jwt", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    });

    // 2. Gửi Access Token và thông tin user trong body JSON
    res.status(200).json({
      accessToken,
      user,
      privyToken,
    });
  } catch (error) {
    next(error);
  }
};

// Đăng nhập dành riêng cho staff trên app
const handleStaffLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    console.log("[STAFF LOGIN REQUEST] email=%s", email);
    const { accessToken, refreshToken, user, privyToken } = await login({
      email,
      password,
    });

    if (user.role !== "staff") {
      console.warn(
        "[STAFF LOGIN DENIED] email=%s role=%s",
        user.email,
        user.role
      );
      const error = new Error("Access denied. Staff role required");
      error.status = 403;
      throw error;
    }

    res.cookie("jwt", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    });

    console.log(
      "[STAFF LOGIN SUCCESS] user=%s role=%s accessToken=%s",
      user.id,
      user.role,
      accessToken
    );

    res.status(200).json({
      accessToken,
      user,
      privyToken,
    });
  } catch (error) {
    console.error(
      "[STAFF LOGIN ERROR] email=%s error=%s",
      req.body.email,
      error.message
    );
    next(error);
  }
};

// controllers/authController.js (thêm vào file cũ)

const handleRefreshToken = async (req, res, next) => {
  try {
    // 1. Lấy refresh token từ cookie
    const token = req.cookies.jwt;

    // 2. Gọi service
    const { accessToken } = await refreshToken(token);

    // 3. Gửi access token mới về cho client
    res.status(200).json({ accessToken });
  } catch (error) {
    next(error);
  }
};

const handleRegisterRequest = async (req, res, next) => {
  try {
    const { email, password, fullName, role, phone } = req.body;
    const result = await registerRequest({
      email,
      password,
      fullName,
      role,
      phone,
    });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleVerifyEmail = async (req, res, next) => {
  try {
    const { email, otp } = req.body;
    const result = await verifyEmail({ email, otp });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleForgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const result = await forgotPassword({ email });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleVerifyResetCode = async (req, res, next) => {
  try {
    const { email, code } = req.body;
    const result = await verifyResetCode({ email, code });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleResetPassword = async (req, res, next) => {
  try {
    const { email, code, newPassword } = req.body;
    const result = await resetPassword({ email, code, newPassword });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
const handleChangePassword = async (req, res, next) => {
  try {
    const { userId, oldPassword, newPassword } = req.body;
    const result = await changePassword({ userId, oldPassword, newPassword });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleEditProfile = async (req, res, next) => {
  try {
    const { userId, fullName, phone } = req.body;
    const result = await editProfile({ userId, fullName, phone });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
// [2] Viết hàm Controller mới
const handleSyncWallet = async (req, res, next) => {
  try {
    // Lấy walletAddress từ body, userId lấy từ token (req.user)
    const { walletAddress } = req.body;
    const userId = req.user && req.user.id;

    const result = await syncWallet({ userId, walletAddress });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
module.exports = {
  login: handleLogin,
  staffLogin: handleStaffLogin,
  refreshToken: handleRefreshToken,
  register: handleRegisterRequest,
  verifyEmail: handleVerifyEmail,
  forgotPassword: handleForgotPassword,
  verifyResetCode: handleVerifyResetCode,
  resetPassword: handleResetPassword,
  changePassword: handleChangePassword,
  editProfile: handleEditProfile,
  syncWallet: handleSyncWallet,
};
