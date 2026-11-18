const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');
const CandidateProfile = require('../models/CandidateProfile');
const DocumentAsset = require('../models/DocumentAsset');
const DocumentBundlePreset = require('../models/DocumentBundlePreset');
const JobListing = require('../models/JobListing');
const ApplicationDraft = require('../models/ApplicationDraft');

const IGNORED_EMAIL_DOMAINS = [
  'jobstreet.com',
  'glints.com',
  'kalibrr.com',
  'indeed.com',
  'linkedin.com',
  'instagram.com',
  'facebook.com',
  'example.com',
  'sentry.io',
];

const IGNORED_EMAIL_PREFIXES = ['noreply@', 'no-reply@', 'support@', 'admin@instagram', 'notification@'];

function getGeminiClient() {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY belum dikonfigurasi.');
  }
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
}

/**
 * Lapisan Deterministik Pre-Pass Email Discovery
 */
function extractCandidateEmailsDeterministic(text) {
  if (!text) return [];
  const matches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  const unique = [...new Set(matches.map((e) => e.toLowerCase().trim()))];

  return unique.filter((email) => {
    const isIgnoredDomain = IGNORED_EMAIL_DOMAINS.some((domain) => email.endsWith(`@${domain}`));
    const isIgnoredPrefix = IGNORED_EMAIL_PREFIXES.some((prefix) => email.startsWith(prefix));
    return !isIgnoredDomain && !isIgnoredPrefix;
  });
}

/**
 * STAGE 2 Deterministic Layer: Cek Duplikasi Perusahaan / Email HRD dalam 30 Hari Terakhir
 */
async function checkDuplicateApplication(companyName, recipientEmail, cooldownDays = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - cooldownDays);

  const activeStages = ['sent', 'in_review', 'interview', 'offered'];
  const recentDrafts = await ApplicationDraft.find({
    applicationStage: { $in: activeStages },
    sentAt: { $gte: cutoffDate },
  }).populate('jobId');

  const normalizedCompany = (companyName || '')
    .toLowerCase()
    .replace(/\b(pt|cv|tbk|persero|indonesia)\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();

  const normalizedEmail = (recipientEmail || '').toLowerCase().trim();

  for (const draft of recentDrafts) {
    const pastEmail = (draft.recipientEmail || '').toLowerCase().trim();
    const pastCompany = (draft.jobId?.companyName || '')
      .toLowerCase()
      .replace(/\b(pt|cv|tbk|persero|indonesia)\b/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();

    const emailMatch = normalizedEmail && pastEmail && normalizedEmail === pastEmail;
    const companyMatch =
      normalizedCompany.length >= 4 &&
      pastCompany.length >= 4 &&
      (normalizedCompany.includes(pastCompany) || pastCompany.includes(normalizedCompany));

    if (emailMatch || companyMatch) {
      const formattedDate = draft.sentAt
        ? new Date(draft.sentAt).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })
        : 'Baru-baru ini';

      const stageLabels = {
        sent: 'Terkirim',
        in_review: 'Diproses HRD',
        interview: 'Jadwal Wawancara',
        offered: 'Diterima',
      };

      return {
        isDuplicateWarning: true,
        previousApplicationInfo: `Pernah dilamar pada ${formattedDate} (Status: ${
          stageLabels[draft.applicationStage] || draft.applicationStage
        }) — Posisi: ${draft.jobId?.jobTitle || 'Terkait'}`,
      };
    }
  }

  return {
    isDuplicateWarning: false,
    previousApplicationInfo: null,
  };
}

/**
 * STAGE 4: Quality, Fact, Duplicate & Compliance Guard Agent (Zero-LLM Deterministic)
 */
function runQualityAndComplianceGuard({
  aiOutput,
  profile,
  presets,
  selectedPreset,
  regexEmails,
}) {
  let finalEmail = (aiOutput.extractedHrdEmail || '').trim().toLowerCase();
  if (!finalEmail || !finalEmail.includes('@')) {
    finalEmail = regexEmails[0] || '';
  }

  let finalSubject = (aiOutput.emailDraft?.subject || '').trim();
  const rule = (aiOutput.mandatorySubjectRule || '').trim();

  // Pastikan tidak ada sisa kurung siku placeholder [...] atau {{...}} pada subjek
  finalSubject = finalSubject
    .replace(/\[Nama Lengkap\]/gi, profile.fullName)
    .replace(/\[Nama\]/gi, profile.fullName)
    .replace(/\[Posisi\]/gi, aiOutput.normalizedTitle || 'Posisi Lowongan')
    .replace(/\[Domisili\]/gi, (profile.targetLocations && profile.targetLocations[0]) || 'Indonesia')
    .replace(/\{\{.*?\}\}/g, '')
    .trim();

  if (!finalSubject) {
    finalSubject = `Lamaran Pekerjaan - ${aiOutput.normalizedTitle || 'Staff'} - ${profile.fullName}`;
  }

  let finalBody = (aiOutput.emailDraft?.body || '').trim();
  finalBody = finalBody
    .replace(/\[Nama Lengkap\]/gi, profile.fullName)
    .replace(/\[Nomor HP\]/gi, profile.phone);

  // Validasi kesiapan Preset Bundel PDF di GridFS
  let validPresetId = selectedPreset ? selectedPreset._id : null;
  let attachmentMode = 'preset_bundle';

  if (!selectedPreset || !selectedPreset.mergedStorageFileId) {
    const fallbackPreset = presets.find((p) => p.mergedStorageFileId);
    if (fallbackPreset) {
      validPresetId = fallbackPreset._id;
    } else {
      validPresetId = null;
      attachmentMode = 'cv_only';
    }
  }

  return {
    recipientEmail: finalEmail,
    mandatorySubjectRule: rule && rule.toLowerCase() !== 'null' && rule !== 'Tidak Ada' ? rule : null,
    emailSubject: finalSubject,
    emailBody: finalBody,
    selectedPresetId: validPresetId,
    attachmentMode,
  };
}

/**
 * Orkestrasi Lengkap Stage 1 -> Stage 2 -> Stage 3 -> Stage 4
 */
async function evaluateAndDraftJob(jobListingId) {
  const job = await JobListing.findById(jobListingId);
  if (!job) throw new Error('JobListing tidak ditemukan.');

  const profile = await CandidateProfile.findOne();
  if (!profile) {
    throw new Error('Profil Kandidat belum dikonfigurasi. Lengkapi di menu Pengaturan.');
  }

  const cvVariants = await DocumentAsset.find({ category: 'cv_variant' }).lean();
  const presets = await DocumentBundlePreset.find()
    .populate('orderedDocuments.documentId', 'title category')
    .lean();

  const combinedJobText = [
    `Judul Awal: ${job.jobTitle}`,
    `Perusahaan Awal: ${job.companyName}`,
    `Lokasi Awal: ${job.location}`,
    `Platform: ${job.sourcePlatform}`,
    job.rawDescription ? `\n--- DESKRIPSI TEKS ---\n${job.rawDescription}` : '',
    job.extractedPosterText ? `\n--- HASIL OCR POSTER GAMBAR ---\n${job.extractedPosterText}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const regexEmails = extractCandidateEmailsDeterministic(combinedJobText);

  const cvContext = cvVariants.map((cv) => ({
    cvId: cv._id.toString(),
    title: cv.title,
    extractedText: (cv.extractedText || '').slice(0, 6000),
  }));

  const presetContext = presets.map((p) => ({
    presetId: p._id.toString(),
    presetName: p.presetName,
    roleKeywords: p.roleKeywords,
    mergedFileName: p.mergedFileName,
    hasBuiltPdf: Boolean(p.mergedStorageFileId),
    compressedSizeKB: Math.round((p.compressedSizeBytes || 0) / 1024),
    includedDocuments: (p.orderedDocuments || [])
      .sort((a, b) => a.order - b.order)
      .map((d) => d.documentId?.title)
      .filter(Boolean),
  }));

  const systemInstruction = `PERAN SISTEM:
Anda adalah AutoApply AI (Personal Edition v3.0), asisten karier profesional pribadi yang bertugas mengevaluasi lowongan kerja dan menyusun draf email lamaran presisi untuk pemilik akun.

SUMBER KEBENARAN (GROUND TRUTH):
1. PROFIL GLOBAL KANDIDAT (JSON CandidateProfile)
2. TEKS EKSTRAKSI LANGSUNG DARI FILE CV PDF (Array DocumentAsset kategori 'cv_variant')
3. DAFTAR PRESET BUNDEL DOKUMEN AKTIF (Array DocumentBundlePreset)

BATASAN & ATURAN KEAMANAN (WAJIB DIPATUHI):
1. ZERO HALLUCINATION: Gunakan HANYA fakta, riwayat perusahaan, sertifikasi, dan keahlian yang tertulis eksplisit di dalam teks CV PDF dan Profil Global Kandidat. Dilarang keras mengarang pengalaman atau gelar.
2. KEPATUHAN SUBJEK 100%: Periksa apakah iklan lowongan (teks maupun hasil OCR poster) mencantumkan aturan format subjek email tertentu. Jika ada, patuhi format tersebut secara persis dengan mengganti placeholder dengan data kandidat. Jika tidak ada aturan khusus, gunakan format: "Lamaran Pekerjaan - [Posisi Jabatan] - ${profile.fullName}".
3. PEMILIHAN PRESET TERBAIK: Pilih satu 'selectedPresetId' dari daftar DocumentBundlePreset yang paling sesuai dengan posisi lowongan.
4. MATRIKS SKOR TERBOBOT (0-100):
   - Kesesuaian Keterampilan Teknis & Tools: 45%
   - Relevansi Riwayat Pengalaman Kerja pada CV PDF: 35%
   - Kesesuaian Lokasi / Mobilitas: 15%
   - Kelengkapan Jalur Rekrutmen: 5%
5. FOKUS NARASI: Tonjolkan hanya 1-2 pengalaman paling relevan dari CV yang sesuai dengan preset terpilih. Tautan portofolio (${profile.portfolioUrl || '-'}) hanya disisipkan jika posisi berkaitan dengan IT, Web Development, atau Desain Grafis. Sebutkan secara ringkas nama file dan dokumen apa saja yang tergabung di dalam file PDF lampiran.
6. BAHASA & GAYA: Gunakan bahasa formal, sopan, ringkas (3-4 paragraf), dan ikuti bahasa iklan lowongan (Indonesia atau Inggris).
7. OUTPUT FORMAT: Keluarkan HANYA objek JSON valid sesuai skema tanpa blok markdown atau teks tambahan.`;

  const responseSchema = {
    type: SchemaType.OBJECT,
    properties: {
      normalizedTitle: { type: SchemaType.STRING },
      normalizedCompany: { type: SchemaType.STRING },
      normalizedLocation: { type: SchemaType.STRING },
      extractedHrdEmail: { type: SchemaType.STRING },
      mandatorySubjectRule: { type: SchemaType.STRING },
      matchScore: { type: SchemaType.INTEGER },
      selectedPresetId: { type: SchemaType.STRING },
      matchedSkills: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
      },
      missingSkills: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
      },
      matchReasoning: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.STRING },
      },
      emailDraft: {
        type: SchemaType.OBJECT,
        properties: {
          subject: { type: SchemaType.STRING },
          body: { type: SchemaType.STRING },
        },
        required: ['subject', 'body'],
      },
    },
    required: [
      'normalizedTitle',
      'normalizedCompany',
      'normalizedLocation',
      'extractedHrdEmail',
      'mandatorySubjectRule',
      'matchScore',
      'selectedPresetId',
      'matchedSkills',
      'missingSkills',
      'matchReasoning',
      'emailDraft',
    ],
  };

  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction,
    generationConfig: {
      temperature: 0.25,
      responseMimeType: 'application/json',
      responseSchema,
    },
  });

  const userPrompt = JSON.stringify(
    {
      candidateProfile: {
        fullName: profile.fullName,
        phone: profile.phone,
        portfolioUrl: profile.portfolioUrl,
        linkedinUrl: profile.linkedinUrl,
        targetKeywords: profile.targetKeywords,
        excludedKeywords: profile.excludedKeywords,
        targetLocations: profile.targetLocations,
        emailSignature: profile.emailSignature,
      },
      cvVariants: cvContext,
      availablePresets: presetContext,
      deterministicEmailsFound: regexEmails,
      jobPostingRaw: combinedJobText,
    },
    null,
    2
  );

  const result = await model.generateContent(userPrompt);
  const aiOutput = JSON.parse(result.response.text());

  // Perbarui metadata terstruktur pada JobListing
  job.jobTitle = aiOutput.normalizedTitle || job.jobTitle;
  job.companyName = aiOutput.normalizedCompany || job.companyName;
  job.location = aiOutput.normalizedLocation || job.location;
  job.extractedEmail = (aiOutput.extractedHrdEmail || regexEmails[0] || '').toLowerCase() || null;
  job.mandatorySubjectRule =
    aiOutput.mandatorySubjectRule &&
    aiOutput.mandatorySubjectRule.toLowerCase() !== 'null' &&
    aiOutput.mandatorySubjectRule !== 'Tidak Ada'
      ? aiOutput.mandatorySubjectRule
      : null;
  job.isProcessedByAi = true;
  await job.save();

  const score = Math.max(0, Math.min(100, Number(aiOutput.matchScore) || 0));

  // Jika skor di bawah ambang batas minMatchScore & bukan input manual cepat, arsipkan saja di JobListing
  if (score < profile.minMatchScore && job.inputSource === 'auto_scraper') {
    return {
      status: 'below_threshold',
      job,
      draft: null,
    };
  }

  const matchedPreset = presets.find((p) => p._id.toString() === aiOutput.selectedPresetId) || null;

  // Stage 4: Quality & Compliance Guard
  const guarded = runQualityAndComplianceGuard({
    aiOutput,
    profile,
    presets,
    selectedPreset: matchedPreset,
    regexEmails,
  });

  // Stage 2: Cek Duplikasi Perusahaan / Email dalam 30 hari terakhir
  const duplicateCheck = await checkDuplicateApplication(
    job.companyName,
    guarded.recipientEmail,
    profile.duplicateCooldownDays || 30
  );

  const draftPayload = {
    jobId: job._id,
    selectedPresetId: guarded.selectedPresetId,
    attachmentMode: guarded.attachmentMode,
    matchScore: score,
    matchedSkills: aiOutput.matchedSkills || [],
    missingSkills: aiOutput.missingSkills || [],
    matchReasoning: aiOutput.matchReasoning || [],
    isDuplicateWarning: duplicateCheck.isDuplicateWarning,
    previousApplicationInfo: duplicateCheck.previousApplicationInfo,
    recipientEmail: guarded.recipientEmail,
    emailSubject: guarded.emailSubject,
    emailBody: guarded.emailBody,
    applicationStage: 'draft_pending',
  };

  const draft = await ApplicationDraft.findOneAndUpdate({ jobId: job._id }, draftPayload, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });

  return {
    status: 'draft_created',
    job,
    draft,
  };
}

module.exports = {
  evaluateAndDraftJob,
  checkDuplicateApplication,
  extractCandidateEmailsDeterministic,
};