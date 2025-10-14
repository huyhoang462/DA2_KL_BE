const authRoutes = require("./auth.routes");
const categoryRoutes = require("./category.routes");
const eventRoute = require("./event.routes");
const initRoutes = (app) => {
  app.use("/api/auth", authRoutes);
  app.use("/api/categories", categoryRoutes);
  app.use("/api/events", eventRoute);
};
module.exports = initRoutes;
