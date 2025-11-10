const mongoose = require("mongoose");

const payoutMethodSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    methodType: {
      type: String,
      enum: ["bank_account", "momo"],
      required: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    bankDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      accountHolderName: { type: String },
      bankBranch: { type: String },
    },
    momoDetails: {
      phoneNumber: { type: String },
      accountHolderName: { type: String },
    },
  },
  {
    timestamps: true,
  }
);

payoutMethodSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});
module.exports = mongoose.model("PayoutMethod", payoutMethodSchema);
