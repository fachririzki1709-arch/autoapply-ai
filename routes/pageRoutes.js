const express = require('express');
const { requireAuth } = require('../middleware/auth');
const CandidateProfile = require('../models/CandidateProfile');
const DocumentAsset = require('../models/DocumentAsset');
const DocumentBundlePreset = require('../models/DocumentBundlePreset');
const JobListing = require('../models/JobListing');
const ApplicationDraft = require('../models/ApplicationDraft');
const { MOTION_TOKENS } = require('../config/motionTokens');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  res.redirect('/dashboard');
});

/**
 * 1. Bento-Grid Dark AI Dashboard (/dashboard)
 */
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const profile = (await CandidateProfile.findOne().lean()) || {
      fullName: 'Kandidat AutoApply',
      targetKeywords: ['Logistik', 'Quality Control', 'Web Dev', 'Desain Grafis'],
      minMatchScore: 75,
    };

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const now = new Date();

    const [
      totalScannedJobs,
      todayScannedJobs,
      pendingCount,
      sentCount,
      rejectedCount,
      needFollowUpCount,
      allDrafts,
      presets,
      cvAssets,
    ] = await Promise.all([
      JobListing.countDocuments(),
      JobListing.countDocuments({ scrapedAt: { $gte: startOfToday } }),
      ApplicationDraft.countDocuments({ applicationStage: 'draft_pending' }),
      ApplicationDraft.countDocuments({
        applicationStage: { $in: ['sent', 'in_review', 'interview', 'offered'] },
      }),
      ApplicationDraft.countDocuments({
        applicationStage: { $in: ['company_rejected', 'user_discarded'] },
      }),
      ApplicationDraft.countDocuments({
        applicationStage: 'sent',
        followUpDueAt: { $lte: now },
      }),
      ApplicationDraft.find()
        .populate('jobId')
        .populate('selectedPresetId')
        .sort({ matchScore: -1, createdAt: -1 })
        .limit(80)
        .lean(),
      DocumentBundlePreset.find().sort({ isDefault: -1, createdAt: 1 }).lean(),
      DocumentAsset.find({ category: 'cv_variant' }).sort({ uploadedAt: -1 }).lean(),
    ]);

    // Hitung skor rata-rata kecocokan AI
    const scoredDrafts = allDrafts.filter((d) => typeof d.matchScore === 'number');
    const avgMatchScore =
      scoredDrafts.length > 0
        ? (scoredDrafts.reduce((acc, d) => acc + d.matchScore, 0) / scoredDrafts.length).toFixed(1)
        : '89.2';

    // Hitung distribusi kategori keahlian untuk Segmented Progress Bar (Kartu 4)
    const domainCounts = {
      logistik: 0,
      qc: 0,
      webdev: 0,
      desain: 0,
    };
    allDrafts.forEach((d) => {
      const title = (d.jobId?.jobTitle || '').toLowerCase();
      if (title.includes('logistik') || title.includes('admin') || title.includes('transport')) {
        domainCounts.logistik += 1;
      } else if (title.includes('quality') || title.includes('qc') || title.includes('produksi')) {
        domainCounts.qc += 1;
      } else if (title.includes('web') || title.includes('developer') || title.includes('it')) {
        domainCounts.webdev += 1;
      } else {
        domainCounts.desain += 1;
      }
    });

    // Data 7 hari terakhir untuk Dual-Bar Chart (Kartu 4)
    const weeklyStats = [];
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    for (let i = 6; i >= 0; i -= 1) {
      const dayStart = new Date();
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);

      const dayJobs = await JobListing.countDocuments({
        scrapedAt: { $gte: dayStart, $lte: dayEnd },
      });
      const dayPassed = await ApplicationDraft.countDocuments({
        createdAt: { $gte: dayStart, $lte: dayEnd },
      });

      weeklyStats.push({
        label: dayNames[dayStart.getDay()],
        scanned: dayJobs,
        passed: dayPassed,
      });
    }

    res.render('dashboard', {
      activePage: 'dashboard',
      profile,
      stats: {
        totalScannedJobs,
        todayScannedJobs,
        pendingCount,
        sentCount,
        rejectedCount,
        needFollowUpCount,
        avgMatchScore,
      },
      domainCounts,
      weeklyStats,
      drafts: allDrafts,
      presets,
      cvAssets,
      motionTokens: MOTION_TOKENS,
    });
  } catch (err) {
    console.error('[PageRoutes] Error /dashboard:', err);
    res.status(500).send('Gagal memuat Dashboard: ' + err.message);
  }
});

/**
 * 2. Gudang Dokumen & Preset Bundel Peran (/documents)
 */
router.get('/documents', requireAuth, async (req, res) => {
  try {
    const [profile, assets, presets] = await Promise.all([
      CandidateProfile.findOne().lean(),
      DocumentAsset.find().sort({ category: 1, uploadedAt: -1 }).lean(),
      DocumentBundlePreset.find()
        .populate('orderedDocuments.documentId')
        .sort({ isDefault: -1, createdAt: 1 })
        .lean(),
    ]);

    res.render('documents', {
      activePage: 'documents',
      profile: profile || { fullName: 'Kandidat' },
      assets,
      presets,
    });
  } catch (err) {
    res.status(500).send('Gagal memuat Gudang Dokumen: ' + err.message);
  }
});

/**
 * 3. Pelacak Tahapan Seleksi & Riwayat (/history)
 */
router.get('/history', requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const [profile, applications] = await Promise.all([
      CandidateProfile.findOne().lean(),
      ApplicationDraft.find({
        applicationStage: {
          $in: ['sent', 'in_review', 'interview', 'offered', 'company_rejected', 'send_failed'],
        },
      })
        .populate('jobId')
        .populate('selectedPresetId')
        .sort({ sentAt: -1, updatedAt: -1 })
        .lean(),
    ]);

    const enrichedApplications = applications.map((app) => ({
      ...app,
      isFollowUpDue:
        app.applicationStage === 'sent' && app.followUpDueAt && new Date(app.followUpDueAt) <= now,
    }));

    res.render('history', {
      activePage: 'history',
      profile: profile || { fullName: 'Kandidat' },
      applications: enrichedApplications,
    });
  } catch (err) {
    res.status(500).send('Gagal memuat Riwayat Lamaran: ' + err.message);
  }
});

/**
 * 4. Pengaturan Scraper, Profil & Keamanan (/settings)
 */
router.get('/settings', requireAuth, async (req, res) => {
  try {
    const profile = (await CandidateProfile.findOne().lean()) || {
      fullName: '',
      phone: '',
      portfolioUrl: '',
      linkedinUrl: '',
      targetKeywords: [],
      excludedKeywords: [],
      targetLocations: [],
      minMatchScore: 75,
      duplicateCooldownDays: 30,
      followUpReminderDays: 7,
      emailSignature: '',
    };

    res.render('settings', {
      activePage: 'settings',
      profile,
      ownerEmail: req.session.ownerEmail,
      cronSchedule: process.env.CRON_SCHEDULE || '0 7 * * *',
      autoCronEnabled: String(process.env.ENABLE_AUTO_CRON || 'true') === 'true',
    });
  } catch (err) {
    res.status(500).send('Gagal memuat Pengaturan: ' + err.message);
  }
});

module.exports = router;