const uploadService = require("../services/uploadService");

const handleGenerateSignature = (req, res, next) => {
  try {
    const { timestamp, signature, folder } =
      uploadService.generateUploadSignature();
    res.status(200).json({
      timestamp,
      signature,
      folder,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    });
  } catch (error) {
    next(error);
  }
};

const handleDeleteImage = async (req, res, next) => {
  try {
    const { publicId } = req.body;

    if (!publicId) {
      const error = new Error("Public ID is required");
      error.status = 400;
      throw error;
    }

    await uploadService.deleteImageByPublicId(publicId);
    res.status(200).json({ message: "Image deleted successfully" });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  handleGenerateSignature,
  handleDeleteImage,
};
