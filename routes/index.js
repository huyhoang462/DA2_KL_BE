const authRoutes = require("./auth.routes");
const categoryRoutes = require("./category.routes");
const eventRoute = require("./event.routes");
const initRoutes = (app) => {
  app.use("/api/auth", authRoutes);
  app.use("/api/category", categoryRoutes);
  app.use("/api/event", eventRoute);
};
module.exports = initRoutes;
