const {
  login,
  registerRequest,
  verifyEmail,
  forgotPassword,
  verifyResetCode,
  resetPassword,
} = require("../services/authService");

const handleLogin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const result = await login({ email, password });
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

const handleRegisterRequest = async (req, res, next) => {
  try {
    const { email, password, name, role, phone } = req.body;
    const result = await registerRequest({
      email,
      password,
      name,
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

module.exports = {
  login: handleLogin,
  register: handleRegisterRequest,
  verifyEmail: handleVerifyEmail,
  forgotPassword: handleForgotPassword,
  verifyResetCode: handleVerifyResetCode,
  resetPassword: handleResetPassword,
};
