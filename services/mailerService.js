const nodemailer = require('nodemailer');
const ApplicationDraft = require('../models/ApplicationDraft');
const DocumentBundlePreset = require('../models/DocumentBundlePreset');
const DocumentAsset = require('../models/DocumentAsset');
const CandidateProfile = require('../models/CandidateProfile');
const { downloadGridFsBuffer } = require('./pdfMergerService');

function createSmtpTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('Konfigurasi SMTP (SMTP_HOST, SMTP_USER, SMTP_PASS) belum lengkap.');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    pool: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Menghitung tanggal jatuh tempo follow-up (+N hari kerja, melewati Sabtu & Minggu)
 */
function addBusinessDays(startDate, businessDays = 7) {
  const result = new Date(startDate);
  let added = 0;
  while (added < businessDays) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }
  return result;
}

async function sendApplicationEmail(draftId, overridePayload = {}) {
  const draft = await ApplicationDraft.findById(draftId).populate('jobId');
  if (!draft) {
    throw new Error('Draf lamaran tidak ditemukan.');
  }

  const profile = await CandidateProfile.findOne();
  const recipientEmail = (overridePayload.recipientEmail ?? draft.recipientEmail ?? '').trim();
  const emailSubject = (overridePayload.emailSubject ?? draft.emailSubject ?? '').trim();
  const emailBody = (overridePayload.emailBody ?? draft.emailBody ?? '').trim();
  const attachmentMode = overridePayload.attachmentMode ?? draft.attachmentMode ?? 'preset_bundle';
  const selectedPresetId = overridePayload.selectedPresetId ?? draft.selectedPresetId;

  // Pre-Flight Validation 1: Validasi Email Penerima
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    const err = new Error('Alamat email HRD tujuan tidak valid atau masih kosong.');
    err.statusCode = 400;
    throw err;
  }

  // Pre-Flight Validation 2: Cek Peringatan Duplikasi 30 Hari
  if (draft.isDuplicateWarning && overridePayload.confirmDuplicateOverride !== true) {
    const err = new Error(
      `Peringatan Duplikasi: ${
        draft.previousApplicationInfo || 'Perusahaan ini sudah dilamar dalam 30 hari terakhir.'
      } Centang konfirmasi override untuk tetap mengirim.`
    );
    err.statusCode = 409;
    throw err;
  }

  // Pre-Flight Validation 3: Ambil Stream Berkas PDF dari MongoDB GridFS
  let attachmentBuffer = null;
  let attachmentFileName = 'Berkas_Lamaran.pdf';

  if (attachmentMode === 'cv_only') {
    const cvAsset = await DocumentAsset.findOne({ category: 'cv_variant' }).sort({ uploadedAt: -1 });
    if (!cvAsset) {
      const err = new Error('Tidak ada file CV PDF di Gudang Dokumen.');
      err.statusCode = 400;
      throw err;
    }
    attachmentBuffer = await downloadGridFsBuffer(cvAsset.storageFileId);
    attachmentFileName = cvAsset.originalFileName || 'CV_Kandidat.pdf';
  } else {
    const preset = await DocumentBundlePreset.findById(selectedPresetId);
    if (!preset || !preset.mergedStorageFileId) {
      const err = new Error(
        'Preset Bundel PDF belum tersedia atau belum di-build. Silakan periksa halaman Gudang Dokumen.'
      );
      err.statusCode = 400;
      throw err;
    }
    attachmentBuffer = await downloadGridFsBuffer(preset.mergedStorageFileId);
    attachmentFileName = preset.mergedFileName;
  }

  // Simpan suntingan terakhir sebelum pengiriman
  draft.recipientEmail = recipientEmail;
  draft.emailSubject = emailSubject;
  draft.emailBody = emailBody;
  draft.attachmentMode = attachmentMode;
  draft.selectedPresetId = selectedPresetId || null;

  try {
    const transporter = createSmtpTransporter();
    const senderName = profile?.fullName || process.env.MAIL_FROM_NAME || 'Pelamar Kerja';

    await transporter.sendMail({
      from: `"${senderName}" <${process.env.SMTP_USER}>`,
      to: recipientEmail,
      subject: emailSubject,
      text: emailBody,
      attachments: [
        {
          filename: attachmentFileName,
          content: attachmentBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    const now = new Date();
    const reminderDays = profile?.followUpReminderDays || 7;

    draft.applicationStage = 'sent';
    draft.sentAt = now;
    draft.followUpDueAt = addBusinessDays(now, reminderDays);
    draft.errorMessage = null;
    await draft.save();

    return {
      draft,
      attachedFileName: attachmentFileName,
      attachedSizeKB: Math.round(attachmentBuffer.length / 1024),
    };
  } catch (smtpError) {
    draft.applicationStage = 'send_failed';
    draft.errorMessage = smtpError.message;
    await draft.save();
    throw smtpError;
  }
}

module.exports = {
  sendApplicationEmail,
  addBusinessDays,
};