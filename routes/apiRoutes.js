const express = require('express');
const mongoose = require('mongoose');
const { requireAuth } = require('../middleware/auth');
const { uploadPdfMiddleware, uploadPosterMiddleware } = require('../middleware/upload');
const { getGridFSBucket } = require('../config/db');
const CandidateProfile = require('../models/CandidateProfile');
const DocumentAsset = require('../models/DocumentAsset');
const DocumentBundlePreset = require('../models/DocumentBundlePreset');
const JobListing = require('../models/JobListing');
const ApplicationDraft = require('../models/ApplicationDraft');
const { extractPdfMetadataAndText } = require('../services/cvParserService');
const {
  uploadGridFsBuffer,
  deleteGridFsFileSafe,
  buildAndCompressPreset,
} = require('../services/pdfMergerService');
const { extractPosterTextWithVision } = require('../services/visionOcrService');
const { evaluateAndDraftJob } = require('../services/aiOrchestratorService');
const {
  generateContentHash,
  detectPlatformFromUrl,
  fetchJobContentFromUrl,
  runMultiPlatformScan,
} = require('../services/scraperService');
const { sendApplicationEmail } = require('../services/mailerService');

const router = express.Router();

// Lindungi seluruh endpoint /api/* dengan requireAuth
router.use(requireAuth);

/**
 * ============================================================================
 * 1. QUICK CAPTURE (URL, TEKS BROADCAST & SCREENSHOT / CTRL+V POSTER OCR)
 * ============================================================================
 */
router.post('/jobs/quick-capture', uploadPosterMiddleware.single('posterImage'), async (req, res) => {
  try {
    const captureType = req.body.captureType || (req.file ? 'image' : 'text');
    let sourcePlatform = req.body.sourcePlatform || 'other';
    const rawInput = (req.body.rawInput || '').trim();

    let jobTitle = 'Lowongan Input Cepat';
    let companyName = 'Perusahaan Lowongan';
    let rawDescription = '';
    let extractedPosterText = '';
    let sourceUrl = undefined;

    if (captureType === 'image' || req.file) {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Silakan unggah atau tempel (Ctrl+V) gambar poster lowongan terlebih dahulu.',
        });
      }
      extractedPosterText = await extractPosterTextWithVision(req.file.buffer, req.file.mimetype);
      rawDescription = rawInput;
    } else if (captureType === 'url') {
      if (!rawInput.startsWith('http')) {
        return res.status(400).json({
          success: false,
          message: 'Format URL tidak valid. Pastikan diawali http:// atau https://',
        });
      }
      sourceUrl = rawInput.split('#')[0];
      const fetched = await fetchJobContentFromUrl(sourceUrl);
      jobTitle = fetched.title;
      rawDescription = fetched.rawDescription;
      extractedPosterText = fetched.extractedPosterText;
      if (sourcePlatform === 'other') {
        sourcePlatform = fetched.sourcePlatform;
      }
    } else {
      if (!rawInput || rawInput.length < 15) {
        return res.status(400).json({
          success: false,
          message: 'Teks lowongan terlalu singkat. Tempelkan deskripsi lengkap lowongan.',
        });
      }
      rawDescription = rawInput;
    }

    const contentHash = generateContentHash(
      companyName,
      jobTitle,
      `${rawDescription} ${extractedPosterText} ${Date.now()}`
    );

    const jobListing = await JobListing.create({
      inputSource: 'manual_quick_capture',
      sourcePlatform,
      sourceUrl,
      contentHash,
      jobTitle,
      companyName,
      rawDescription,
      extractedPosterText,
      isProcessedByAi: false,
    });

    const evalResult = await evaluateAndDraftJob(jobListing._id);
    const populatedDraft = await ApplicationDraft.findById(evalResult.draft._id)
      .populate('jobId')
      .populate('selectedPresetId')
      .lean();

    return res.status(201).json({
      success: true,
      data: {
        jobId: jobListing._id,
        draftId: populatedDraft._id,
        matchScore: populatedDraft.matchScore,
        selectedPresetName: populatedDraft.selectedPresetId?.presetName || 'Hanya CV Saja',
        mandatorySubjectRule: populatedDraft.jobId?.mandatorySubjectRule || null,
        isDuplicateWarning: populatedDraft.isDuplicateWarning,
        applicationStage: populatedDraft.applicationStage,
        draft: populatedDraft,
      },
    });
  } catch (err) {
    console.error('[API quick-capture] Error:', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Gagal memproses Input Cepat lowongan.',
    });
  }
});

/**
 * ============================================================================
 * 2. PEMICU PEMINDAIAN MULTI-PLATFORM MANUAL
 * ============================================================================
 */
router.post('/scanner/run', async (req, res) => {
  try {
    const summary = await runMultiPlatformScan(18);
    return res.json({
      success: true,
      message: `Pemindaian selesai: ${summary.newlySaved} lowongan baru, ${summary.draftsGenerated} draf siap tinjau.`,
      data: summary,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ============================================================================
 * 3. MANAJEMEN DRAF, PENGIRIMAN EMAIL SATU KLIK & PELACAK SELEKSI
 * ============================================================================
 */
router.put('/drafts/:id', async (req, res) => {
  try {
    const { recipientEmail, emailSubject, emailBody, selectedPresetId, attachmentMode } = req.body;
    const draft = await ApplicationDraft.findByIdAndUpdate(
      req.params.id,
      {
        recipientEmail: (recipientEmail || '').toLowerCase().trim(),
        emailSubject: (emailSubject || '').trim(),
        emailBody: (emailBody || '').trim(),
        selectedPresetId: selectedPresetId || null,
        attachmentMode: attachmentMode || 'preset_bundle',
      },
      { new: true }
    )
      .populate('jobId')
      .populate('selectedPresetId');

    if (!draft) {
      return res.status(404).json({ success: false, message: 'Draf tidak ditemukan.' });
    }

    return res.json({ success: true, message: 'Perubahan draf tersimpan.', data: draft });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/drafts/:id/send', async (req, res) => {
  try {
    const result = await sendApplicationEmail(req.params.id, req.body);
    return res.status(200).json({
      success: true,
      data: {
        draftId: result.draft._id,
        applicationStage: result.draft.applicationStage,
        sentAt: result.draft.sentAt,
        followUpDueAt: result.draft.followUpDueAt,
        attachedFileName: result.attachedFileName,
        attachedSizeKB: result.attachedSizeKB,
      },
    });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message,
    });
  }
});

router.patch('/drafts/:id/stage', async (req, res) => {
  try {
    const { applicationStage, interviewDate, interviewNotes } = req.body;
    const allowedStages = [
      'draft_pending',
      'sent',
      'in_review',
      'interview',
      'offered',
      'company_rejected',
      'user_discarded',
    ];

    if (!allowedStages.includes(applicationStage)) {
      return res.status(400).json({ success: false, message: 'Tahapan seleksi tidak valid.' });
    }

    const updateFields = { applicationStage };
    if (interviewDate !== undefined) {
      updateFields.interviewDate = interviewDate ? new Date(interviewDate) : null;
    }
    if (interviewNotes !== undefined) {
      updateFields.interviewNotes = interviewNotes;
    }

    const updated = await ApplicationDraft.findByIdAndUpdate(req.params.id, updateFields, {
      new: true,
    }).populate('jobId');

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Data lamaran tidak ditemukan.' });
    }

    return res.json({
      success: true,
      message: 'Status tahapan seleksi berhasil diperbarui.',
      data: updated,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * ============================================================================
 * 4. GUDANG DOKUMEN PDF & PRESET BUNDEL PERAN (GRIDFS + AUTO-MERGE + COMPRESS)
 * ============================================================================
 */
router.post('/documents/upload', uploadPdfMiddleware.single('pdfFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Berkas PDF wajib dipilih.' });
    }

    const title = (req.body.title || req.file.originalname.replace(/\.pdf$/i, '')).trim();
    const category = req.body.category || 'other';

    // Ekstraksi teks & jumlah halaman menggunakan pdf-parse
    const { extractedText, pageCount } = await extractPdfMetadataAndText(req.file.buffer);

    const storageFileId = await uploadGridFsBuffer(req.file.buffer, req.file.originalname, {
      category,
      title,
    });

    const asset = await DocumentAsset.create({
      title,
      category,
      storageFileId,
      originalFileName: req.file.originalname,
      fileSizeBytes: req.file.buffer.length,
      pageCount,
      extractedText,
    });

    return res.status(201).json({
      success: true,
      message: 'Berkas PDF berhasil diunggah ke GridFS dan diekstrak teksnya.',
      data: asset,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    const asset = await DocumentAsset.findById(req.params.id);
    if (!asset) {
      return res.status(404).json({ success: false, message: 'Dokumen tidak ditemukan.' });
    }

    await deleteGridFsFileSafe(asset.storageFileId);
    await DocumentAsset.findByIdAndDelete(req.params.id);

    // Hapus referensi dari preset bila ada
    await DocumentBundlePreset.updateMany(
      {},
      { $pull: { orderedDocuments: { documentId: asset._id } } }
    );

    return res.json({ success: true, message: 'Dokumen PDF berhasil dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/presets', async (req, res) => {
  try {
    const { presetName, roleKeywords, orderedDocuments, mergedFileName, isDefault } = req.body;
    if (!presetName || !Array.isArray(orderedDocuments) || orderedDocuments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Nama preset dan minimal 1 dokumen anggota wajib diisi.',
      });
    }

    if (isDefault) {
      await DocumentBundlePreset.updateMany({}, { isDefault: false });
    }

    const safeFileName = (mergedFileName || `Berkas_${presetName.replace(/\s+/g, '_')}.pdf`)
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/(\.pdf)?$/i, '.pdf');

    const preset = await DocumentBundlePreset.create({
      presetName: presetName.trim(),
      roleKeywords: Array.isArray(roleKeywords)
        ? roleKeywords
        : String(roleKeywords || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
      orderedDocuments: orderedDocuments.map((item, idx) => ({
        documentId: item.documentId,
        order: Number(item.order || idx + 1),
      })),
      mergedFileName: safeFileName,
      isDefault: Boolean(isDefault),
    });

    const buildInfo = await buildAndCompressPreset(preset._id);

    return res.status(201).json({
      success: true,
      message: `Preset berhasil dibuat, digabungkan (${buildInfo.preset.totalPages} hal), dan dikompresi menjadi ${Math.round(
        buildInfo.compressedBytes / 1024
      )} KB.`,
      data: buildInfo,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/presets/:id/rebuild', async (req, res) => {
  try {
    if (Array.isArray(req.body.orderedDocuments) && req.body.orderedDocuments.length > 0) {
      await DocumentBundlePreset.findByIdAndUpdate(req.params.id, {
        orderedDocuments: req.body.orderedDocuments.map((item, idx) => ({
          documentId: item.documentId,
          order: Number(item.order || idx + 1),
        })),
      });
    }

    const buildInfo = await buildAndCompressPreset(req.params.id);
    return res.json({
      success: true,
      message: `Bundel PDF berhasil digabung ulang & dikompresi (${Math.round(
        buildInfo.compressedBytes / 1024
      )} KB).`,
      data: buildInfo,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/presets/:id', async (req, res) => {
  try {
    const preset = await DocumentBundlePreset.findById(req.params.id);
    if (!preset) return res.status(404).json({ success: false, message: 'Preset tidak ditemukan.' });

    if (preset.mergedStorageFileId) {
      await deleteGridFsFileSafe(preset.mergedStorageFileId);
    }
    await DocumentBundlePreset.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: 'Preset bundel berhasil dihapus.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * Stream Unduh / Pratinjau PDF dari MongoDB GridFS
 */
router.get('/files/gridfs/:fileId', async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    const bucket = getGridFSBucket();
    const files = await bucket.find({ _id: fileId }).toArray();
    if (!files || files.length === 0) {
      return res.status(404).send('Berkas PDF tidak ditemukan di GridFS.');
    }

    const fileMeta = files[0];
    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${disposition}; filename="${fileMeta.filename}"`);

    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.on('error', (err) => res.status(500).send(err.message));
    downloadStream.pipe(res);
  } catch (err) {
    res.status(400).send('ID Berkas tidak valid.');
  }
});

/**
 * ============================================================================
 * 5. PENGATURAN PROFIL KANDIDAT & ATURAN SISTEM
 * ============================================================================
 */
router.post('/settings/profile', async (req, res) => {
  try {
    const parseCsv = (val) =>
      Array.isArray(val)
        ? val
        : String(val || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

    const payload = {
      fullName: (req.body.fullName || '').trim(),
      phone: (req.body.phone || '').trim(),
      portfolioUrl: (req.body.portfolioUrl || '').trim(),
      linkedinUrl: (req.body.linkedinUrl || '').trim(),
      targetKeywords: parseCsv(req.body.targetKeywords),
      excludedKeywords: parseCsv(req.body.excludedKeywords),
      targetLocations: parseCsv(req.body.targetLocations),
      minMatchScore: Number(req.body.minMatchScore || 75),
      duplicateCooldownDays: Number(req.body.duplicateCooldownDays || 30),
      followUpReminderDays: Number(req.body.followUpReminderDays || 7),
      emailSignature: (req.body.emailSignature || '').trim(),
    };

    const existing = await CandidateProfile.findOne();
    let profile;
    if (existing) {
      profile = await CandidateProfile.findByIdAndUpdate(existing._id, payload, { new: true });
    } else {
      profile = await CandidateProfile.create(payload);
    }

    return res.json({
      success: true,
      message: 'Profil kandidat & aturan pemindaian berhasil disimpan.',
      data: profile,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;