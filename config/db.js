const mongoose = require('mongoose');

let gridFsBucket = null;

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI tidak ditemukan di environment variables.');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });

  gridFsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: 'pdf_assets',
  });

  console.log('[MongoDB] Terkoneksi ke MongoDB Atlas & GridFS Bucket (pdf_assets).');
  return mongoose.connection;
}

function getGridFSBucket() {
  if (!gridFsBucket) {
    if (!mongoose.connection || !mongoose.connection.db) {
      throw new Error('GridFSBucket belum diinisialisasi. Pastikan koneksi database aktif.');
    }
    gridFsBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'pdf_assets',
    });
  }
  return gridFsBucket;
}

module.exports = {
  connectDB,
  getGridFSBucket,
};