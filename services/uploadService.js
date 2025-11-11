const { cloudinary } = require("../config/cloudinary");

/**
 * Tạo chữ ký cho việc upload trực tiếp từ client
 * @returns {object} Chứa timestamp và signature
 */
const generateUploadSignature = () => {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const folder = "ticketbox-clone";

  const paramsToSign = {
    timestamp: timestamp,
    folder: folder,
  };

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET
  );

  return { timestamp, signature, folder };
};

/**
 * Xóa một ảnh trên Cloudinary bằng public_id
 * @param {string} publicId - public_id của ảnh cần xóa
 * @returns {Promise<object>} Kết quả từ Cloudinary
 */
const deleteImageByPublicId = (publicId) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        return reject(error);
      }
      // result sẽ có dạng { result: 'ok' } nếu thành công
      resolve(result);
    });
  });
};

module.exports = {
  generateUploadSignature,
  deleteImageByPublicId,
};
