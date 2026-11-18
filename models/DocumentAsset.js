const mongoose = require('mongoose');
const { Schema } = mongoose;

const DocumentAssetSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        'cv_variant',
        'cover_letter',
        'diploma',
        'transcript',
        'certificate',
        'identity',
        'portfolio',
        'other',
      ],
      required: true,
      index: true,
    },
    storageFileId: { type: Schema.Types.ObjectId, required: true },
    originalFileName: { type: String, required: true },
    fileSizeBytes: { type: Number, required: true },
    pageCount: { type: Number, default: 1 },
    extractedText: { type: String, default: '' },
    uploadedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DocumentAsset', DocumentAssetSchema);