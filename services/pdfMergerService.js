const { Readable } = require('stream');
const { PDFDocument } = require('pdf-lib');
const { getGridFSBucket } = require('../config/db');
const DocumentAsset = require('../models/DocumentAsset');
const DocumentBundlePreset = require('../models/DocumentBundlePreset');
const { compressPdfBuffer } = require('./pdfCompressorService');

function downloadGridFsBuffer(fileId) {
  return new Promise((resolve, reject) => {
    const bucket = getGridFSBucket();
    const chunks = [];
    const stream = bucket.openDownloadStream(fileId);
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function uploadGridFsBuffer(buffer, filename, metadata = {}) {
  return new Promise((resolve, reject) => {
    const bucket = getGridFSBucket();
    const readable = Readable.from(buffer);
    const uploadStream = bucket.openUploadStream(filename, {
      contentType: 'application/pdf',
      metadata,
    });
    readable
      .pipe(uploadStream)
      .on('error', (err) => reject(err))
      .on('finish', () => resolve(uploadStream.id));
  });
}

async function deleteGridFsFileSafe(fileId) {
  if (!fileId) return;
  try {
    const bucket = getGridFSBucket();
    await bucket.delete(fileId);
  } catch (err) {
    console.warn('[pdfMergerService] Peringatan saat menghapus file lama GridFS:', err.message);
  }
}

async function buildAndCompressPreset(presetId) {
  const preset = await DocumentBundlePreset.findById(presetId);
  if (!preset) {
    throw new Error('Preset bundel dokumen tidak ditemukan.');
  }

  const sortedDocs = [...preset.orderedDocuments].sort((a, b) => a.order - b.order);
  if (sortedDocs.length === 0) {
    throw new Error('Preset belum memiliki dokumen PDF anggota.');
  }

  const mergedPdf = await PDFDocument.create();
  mergedPdf.setTitle(preset.mergedFileName.replace(/\.pdf$/i, ''));
  mergedPdf.setSubject(`Bundel Dokumen Lamaran - ${preset.presetName}`);

  let totalPages = 0;

  for (const item of sortedDocs) {
    const asset = await DocumentAsset.findById(item.documentId);
    if (!asset) continue;

    const pdfBuffer = await downloadGridFsBuffer(asset.storageFileId);
    const sourcePdf = await PDFDocument.load(pdfBuffer, { ignoreEncryption: true });
    const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());

    copiedPages.forEach((page) => {
      mergedPdf.addPage(page);
      totalPages += 1;
    });
  }

  if (totalPages === 0) {
    throw new Error('Tidak ada halaman PDF valid yang dapat digabungkan.');
  }

  const rawMergedBytes = await mergedPdf.save({ useObjectStreams: true });
  const rawMergedBuffer = Buffer.from(rawMergedBytes);

  // Kompresi otomatis <= 2 MB (150 DPI)
  const compressedResult = await compressPdfBuffer(rawMergedBuffer);

  // Hapus file gabungan versi sebelumnya agar hemat penyimpanan MongoDB Atlas
  if (preset.mergedStorageFileId) {
    await deleteGridFsFileSafe(preset.mergedStorageFileId);
  }

  const newFileId = await uploadGridFsBuffer(compressedResult.buffer, preset.mergedFileName, {
    type: 'merged_preset_bundle',
    presetId: preset._id.toString(),
    originalBytes: compressedResult.originalBytes,
    compressedBytes: compressedResult.compressedBytes,
    compressionMethod: compressedResult.method,
  });

  preset.mergedStorageFileId = newFileId;
  preset.totalPages = totalPages;
  preset.compressedSizeBytes = compressedResult.compressedBytes;
  preset.lastBuiltAt = new Date();
  await preset.save();

  return {
    preset,
    originalBytes: compressedResult.originalBytes,
    compressedBytes: compressedResult.compressedBytes,
    isUnder2MB: compressedResult.isUnder2MB,
    method: compressedResult.method,
  };
}

module.exports = {
  downloadGridFsBuffer,
  uploadGridFsBuffer,
  deleteGridFsFileSafe,
  buildAndCompressPreset,
};