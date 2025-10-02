require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const initRoutes = require("./routes");

const app = express();

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to mongodb"))
  .catch((e) => console.log("Error to connect: ", e));

app.use(cors());
app.use(express.json());
initRoutes(app);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Serrver running on port ${PORT}`);
});
