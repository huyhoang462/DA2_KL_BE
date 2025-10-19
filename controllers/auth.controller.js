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
} = require("../services/authService");

const handleLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const { accessToken, refreshToken, user } = await login({
      email,
      password,
    });
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
    });
  } catch (error) {
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

module.exports = {
  login: handleLogin,
  refreshToken: handleRefreshToken,
  register: handleRegisterRequest,
  verifyEmail: handleVerifyEmail,
  forgotPassword: handleForgotPassword,
  verifyResetCode: handleVerifyResetCode,
  resetPassword: handleResetPassword,
  changePassword: handleChangePassword,
  editProfile: handleEditProfile,
};
