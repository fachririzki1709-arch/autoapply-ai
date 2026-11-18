const mongoose = require('mongoose');
const { Schema } = mongoose;

const DocumentBundlePresetSchema = new Schema(
  {
    presetName: { type: String, required: true, trim: true },
    roleKeywords: [{ type: String }],
    orderedDocuments: [
      {
        documentId: { type: Schema.Types.ObjectId, ref: 'DocumentAsset', required: true },
        order: { type: Number, required: true },
      },
    ],
    mergedStorageFileId: { type: Schema.Types.ObjectId, default: null },
    mergedFileName: { type: String, required: true },
    totalPages: { type: Number, default: 0 },
    compressedSizeBytes: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    lastBuiltAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DocumentBundlePreset', DocumentBundlePresetSchema);