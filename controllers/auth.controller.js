const {
  login,
  registerRequest,
  verifyEmail,
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

module.exports = {
  login: handleLogin,
  register: handleRegisterRequest,
  verifyEmail: handleVerifyEmail,
};
