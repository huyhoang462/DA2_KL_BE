const mongoose = require("mongoose");

const organizerProfileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // Mỗi user chỉ có 1 organizer profile
    },

    // Tên hiển thị cho organizer (có thể khác với fullName tài khoản)
    displayName: {
      type: String,
      trim: true,
      maxlength: 120,
    },

    // Email liên hệ, cho phép khác email đăng ký nếu organizer muốn
    contactEmail: {
      type: String,
      trim: true,
      lowercase: true,
    },

    phone: {
      type: String,
      trim: true,
      maxlength: 30,
    },

    address: {
      type: String,
      trim: true,
      maxlength: 255,
    },

    about: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  },
);

// Index
organizerProfileSchema.index({ user: 1 });

// Transform JSON
organizerProfileSchema.set("toJSON", {
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

module.exports = mongoose.model("OrganizerProfile", organizerProfileSchema);
