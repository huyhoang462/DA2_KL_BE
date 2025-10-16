const locationSchema = new mongoose.Schema({
  address: { type: String, required: true },
  street: { type: String },
  ward: { type: String },
  province: { type: String, required: true },
});

locationSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("Location", locationSchema);
