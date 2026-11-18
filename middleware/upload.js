const multer = require('multer');

const memoryStorage = multer.memoryStorage();

const uploadPdfMiddleware = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 15 * 1024 * 1024, // Maksimal 15 MB per file PDF sebelum dikompresi
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Hanya berkas berformat PDF (application/pdf) yang diizinkan.'), false);
    }
  },
});

const uploadPosterMiddleware = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // Maksimal 5 MB untuk tangkapan layar / poster lowongan
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format gambar harus PNG, JPG, JPEG, atau WEBP (maksimal 5 MB).'), false);
    }
  },
});

module.exports = {
  uploadPdfMiddleware,
  uploadPosterMiddleware,
};