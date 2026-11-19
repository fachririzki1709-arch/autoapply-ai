const path = require('path');
const express = require('express');

const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Data simulasi (Mock Data) untuk pratinjau tampilan Dashboard Bento
const mockProfile = {
  fullName: 'Fachri Rizki Fadillah',
  phone: '+6287814108782',
  portfolioUrl: 'https://github.com/fachririzki',
  linkedinUrl: 'https://linkedin.com/in/fachririzki',
  targetKeywords: ['Admin Logistik', 'Quality Control', 'Web Developer', 'Graphic Designer'],
  excludedKeywords: ['MLM', 'Tanpa Gaji'],
  targetLocations: ['Cianjur', 'Bandung', 'Karawang', 'Remote'],
  minMatchScore: 75,
  duplicateCooldownDays: 30,
  followUpReminderDays: 7,
  emailSignature: 'Hormat saya,\nFachri Rizki Fadillah',
};

const mockStats = {
  totalScannedJobs: 24,
  todayScannedJobs: 4,
  pendingCount: 4,
  sentCount: 12,
  rejectedCount: 1,
  needFollowUpCount: 2,
  avgMatchScore: '89.2',
};

const mockDomainCounts = {
  logistik: 8,
  qc: 6,
  webdev: 5,
  desain: 5,
};

const mockWeeklyStats = [
  { label: 'Kam', scanned: 3, passed: 2 },
  { label: 'Jum', scanned: 5, passed: 4 },
  { label: 'Sab', scanned: 2, passed: 2 },
  { label: 'Min', scanned: 1, passed: 1 },
  { label: 'Sen', scanned: 6, passed: 5 },
  { label: 'Sel', scanned: 3, passed: 2 },
  { label: 'Rab', scanned: 4, passed: 3 },
];

const mockPresets = [
  {
    _id: 'preset_logistik_01',
    presetName: 'Paket Administrasi & Logistik',
    roleKeywords: ['Admin', 'Logistik', 'Transport', 'SAP'],
    mergedStorageFileId: 'mock_gridfs_01',
    mergedFileName: 'Berkas_Lamaran_Admin_Fachri_Rizki.pdf',
    totalPages: 5,
    compressedSizeBytes: 1454080, // 1420 KB (<= 2 MB)
    isDefault: true,
    orderedDocuments: [],
  },
  {
    _id: 'preset_qc_02',
    presetName: 'Paket Quality Control & Produksi',
    roleKeywords: ['Quality Control', 'QC', 'Inspektor'],
    mergedStorageFileId: 'mock_gridfs_02',
    mergedFileName: 'Berkas_Lamaran_QC_Fachri_Rizki.pdf',
    totalPages: 4,
    compressedSizeBytes: 1218560, // 1190 KB
    isDefault: false,
    orderedDocuments: [],
  },
  {
    _id: 'preset_web_03',
    presetName: 'Paket IT & Web Developer',
    roleKeywords: ['Web Developer', 'Node.js', 'Fullstack'],
    mergedStorageFileId: 'mock_gridfs_03',
    mergedFileName: 'Berkas_Lamaran_WebDev_Fachri_Rizki.pdf',
    totalPages: 6,
    compressedSizeBytes: 1689600, // 1650 KB
    isDefault: false,
    orderedDocuments: [],
  },
];

const mockDrafts = [
  {
    _id: 'draft_01',
    jobId: {
      _id: 'job_01',
      jobTitle: 'Staff Admin Transport & Logistik',
      companyName: 'PT Nusantara Distribusi Cepat',
      location: 'Cianjur, Jawa Barat',
      sourcePlatform: 'instagram',
      inputSource: 'manual_quick_capture',
      mandatorySubjectRule: 'Admin Logistik_Fachri Rizki Fadillah_Cianjur',
    },
    selectedPresetId: mockPresets[0],
    attachmentMode: 'preset_bundle',
    matchScore: 94,
    matchReasoning: [
      'Memiliki pengalaman lebih dari 3 tahun sebagai Admin Transport Logistic & Planner Penjaluran.',
      'Menguasai operasional SAP, TMS, dan pengelolaan penjaluran 50+ armada harian.',
      'Preset Paket Administrasi & Logistik dipilih otomatis sesuai kualifikasi posisi.',
    ],
    isDuplicateWarning: false,
    previousApplicationInfo: null,
    recipientEmail: 'hr.recruitment@nusantaradistribusi.co.id',
    emailSubject: 'Admin Logistik_Fachri Rizki Fadillah_Cianjur',
    emailBody:
      'Yth. Bapak/Ibu HRD PT Nusantara Distribusi Cepat,\n\nMelalui email ini saya mengajukan lamaran untuk posisi Staff Admin Transport & Logistik. Saya memiliki pengalaman mengelola dokumen transportasi, sistem SAP, serta perencanaan rute armada harian.\n\nSebagai bahan pertimbangan, saya lampirkan berkas lamaran lengkap dalam satu file PDF terkompresi (CV, Ijazah, Transkrip Nilai, dan Sertifikat).\n\nHormat saya,\nFachri Rizki Fadillah',
    applicationStage: 'draft_pending',
  },
  {
    _id: 'draft_02',
    jobId: {
      _id: 'job_02',
      jobTitle: 'Quality Control Inspector',
      companyName: 'PT Agro Pangan Sejahtera',
      location: 'Karawang, Jawa Barat',
      sourcePlatform: 'linkedin',
      inputSource: 'auto_scraper',
      mandatorySubjectRule: null,
    },
    selectedPresetId: mockPresets[1],
    attachmentMode: 'preset_bundle',
    matchScore: 89,
    matchReasoning: [
      'Berpengalaman sebagai Quality Control Inspector & Koordinator Inbound/Outbound.',
      'Terbiasa melakukan pengujian kadar air, kalibrasi timbangan digital, dan sanitasi gudang.',
    ],
    isDuplicateWarning: true,
    previousApplicationInfo: 'Pernah dilamar pada 04 Nov 2026 (Status: Terkirim)',
    recipientEmail: 'career@agropangan.co.id',
    emailSubject: 'Lamaran Pekerjaan - Quality Control Inspector - Fachri Rizki Fadillah',
    emailBody:
      'Yth. Tim Rekrutmen PT Agro Pangan Sejahtera,\n\nSaya bermaksud melamar posisi Quality Control Inspector. Saya memiliki pengalaman langsung dalam inspeksi mutu bahan pangan, monitoring mesin produksi, serta koordinasi keluar-masuk barang gudang.\n\nHormat saya,\nFachri Rizki Fadillah',
    applicationStage: 'draft_pending',
  },
  {
    _id: 'draft_03',
    jobId: {
      _id: 'job_03',
      jobTitle: 'Junior Fullstack Web Developer (Node.js)',
      companyName: 'PT Digital Solusi Kreatif',
      location: 'Bandung / Hybrid',
      sourcePlatform: 'glints',
      inputSource: 'auto_scraper',
      mandatorySubjectRule: 'WEBDEV_NAMA LENGKAP',
    },
    selectedPresetId: mockPresets[2],
    attachmentMode: 'preset_bundle',
    matchScore: 86,
    matchReasoning: [
      'Menguasai pengembangan aplikasi web full-stack menggunakan Node.js, Express.js, MongoDB, dan Tailwind CSS.',
      'Memiliki portofolio proyek web aktif dengan integrasi real-time dan API.',
    ],
    isDuplicateWarning: false,
    previousApplicationInfo: null,
    recipientEmail: 'talent@digitalsolusi.id',
    emailSubject: 'WEBDEV_FACHRI RIZKI FADILLAH',
    emailBody:
      'Yth. HRD PT Digital Solusi Kreatif,\n\nSaya tertarik melamar posisi Junior Fullstack Web Developer. Saya terbiasa membangun aplikasi berbasis Node.js, Express.js, MongoDB Atlas, dan Tailwind CSS.\n\nPortofolio proyek dapat ditinjau melalui tautan pada CV terlampir.\n\nHormat saya,\nFachri Rizki Fadillah',
    applicationStage: 'draft_pending',
  },
  {
    _id: 'draft_04',
    jobId: {
      _id: 'job_04',
      jobTitle: 'Staff Administrasi Gudang',
      companyName: 'PT Logistik Prima',
      location: 'Cianjur',
      sourcePlatform: 'jobstreet',
      inputSource: 'auto_scraper',
      mandatorySubjectRule: null,
    },
    selectedPresetId: mockPresets[0],
    attachmentMode: 'preset_bundle',
    matchScore: 91,
    matchReasoning: ['Sesuai dengan rekam jejak administrasi logistik dan penguasaan Microsoft Excel.'],
    isDuplicateWarning: false,
    recipientEmail: 'hrd@logistikprima.co.id',
    emailSubject: 'Lamaran Pekerjaan - Staff Administrasi Gudang - Fachri Rizki Fadillah',
    emailBody: 'Yth. HRD PT Logistik Prima,\n\nBerikut saya kirimkan lamaran untuk posisi Staff Administrasi Gudang.',
    applicationStage: 'sent',
    sentAt: new Date(),
  },
];

// Rute Halaman Frontend
app.get(['/', '/dashboard'], (req, res) => {
  res.render('dashboard', {
    activePage: 'dashboard',
    profile: mockProfile,
    stats: mockStats,
    domainCounts: mockDomainCounts,
    weeklyStats: mockWeeklyStats,
    drafts: mockDrafts,
    presets: mockPresets,
    cvAssets: [],
  });
});

app.get('/documents', (req, res) => {
  res.render('documents', {
    activePage: 'documents',
    profile: mockProfile,
    assets: [],
    presets: mockPresets,
  });
});

app.get('/history', (req, res) => {
  res.render('history', {
    activePage: 'history',
    profile: mockProfile,
    applications: mockDrafts.filter((d) => d.applicationStage === 'sent'),
  });
});

app.get('/settings', (req, res) => {
  res.render('settings', {
    activePage: 'settings',
    profile: mockProfile,
    ownerEmail: 'fachririzki1709@gmail.com',
    cronSchedule: '0 7 * * *',
    autoCronEnabled: true,
  });
});

app.get('/login', (req, res) => {
  res.render('login', { error: null, email: 'fachririzki1709@gmail.com' });
});

// Simulasi respons tombol interaktif di Dashboard
app.post('/api/scanner/run', (req, res) => {
  res.json({ success: true, message: '[Mode Pratinjau UI] Simulasi pemindaian AI selesai!' });
});

app.put('/api/drafts/:id', (req, res) => {
  res.json({ success: true, message: '[Mode Pratinjau UI] Perubahan draf tersimpan sementara.' });
});

app.listen(PORT, () => {
  console.log(`[UI Preview] Tampilan Dashboard siap dibuka di: http://localhost:${PORT}/dashboard`);
});
