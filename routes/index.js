const authRoutes = require("./auth.routes");
const userRoutes = require("./user.routes");
const uploadRouter = require("./upload.routes");
const categoryRoutes = require("./category.routes");
const eventRoute = require("./event.routes");
const payoutMethodRoute = require("./payout.routes");
const initRoutes = (app) => {
  app.use("/api/auth", authRoutes);
  app.use("/api/user", userRoutes);
  app.use("/api/uploads", uploadRouter);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/events", eventRoute);
  app.use("/api/payout-methods", payoutMethodRoute);
};
module.exports = initRoutes;
