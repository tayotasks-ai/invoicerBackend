var cloudinary = require('cloudinary').v2;
var dotenv = require('dotenv');

dotenv.config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

function uploadImage(filePath, folder) {
  return cloudinary.uploader.upload(filePath, {
    folder: folder || undefined
  }).then(function(result) {
    return result;
  }).catch(function(error) {
    throw new Error(
      'Cloudinary upload failed: ' + (error.message || JSON.stringify(error))
    );
  });
}

function deleteImage(publicId) {
  return cloudinary.uploader.destroy(publicId)
    .then(function(result) {
      return result;
    })
    .catch(function(error) {
      throw new Error('Cloudinary delete failed: ' + error);
    });
}

module.exports = {
  uploadImage: uploadImage,
  deleteImage: deleteImage
};
