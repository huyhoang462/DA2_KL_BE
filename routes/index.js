const authRoutes = require("./auth.routes");

const initRoutes = (app) => {
  app.use("/api/auth", authRoutes);
};
module.exports = initRoutes;
