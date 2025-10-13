const { default: mongoose } = require("mongoose");

const showSchema = new mongoose.Schema({
  name: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  event: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
});

showSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});
module.exports = mongoose.model("Show", showSchema);
