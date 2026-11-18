require('dotenv').config();
const bcrypt = require('bcrypt');
const { connectDB } = require('../config/db');
const OwnerAuth = require('../models/OwnerAuth');
const CandidateProfile = require('../models/CandidateProfile');

async function seedOwnerAccount() {
  await connectDB();

  const ownerEmail = (process.env.OWNER_EMAIL || '').toLowerCase().trim();
  const envHash = process.env.OWNER_PASSWORD_HASH;

  if (!ownerEmail) {
    throw new Error('OWNER_EMAIL wajib diisi di file .env sebelum menjalankan seed.');
  }

  const passwordHash =
    envHash && envHash.startsWith('$2')
      ? envHash
      : await bcrypt.hash(process.env.OWNER_DEFAULT_PASSWORD || 'AutoApply2026!', 12);

  await OwnerAuth.findOneAndUpdate(
    { email: ownerEmail },
    {
      email: ownerEmail,
      passwordHash,
      failedAttempts: 0,
      lockUntil: null,
    },
    { upsert: true, new: true }
  );

  const existingProfile = await CandidateProfile.findOne();
  if (!existingProfile) {
    await CandidateProfile.create({
      fullName: 'Nama Lengkap Kandidat',
      phone: '+6281234567890',
      portfolioUrl: '',
      linkedinUrl: '',
      targetKeywords: ['Admin Logistik', 'Quality Control', 'Web Developer', 'Graphic Designer'],
      excludedKeywords: ['MLM', 'Freelance Tanpa Gaji'],
      targetLocations: ['Cianjur', 'Bandung', 'Jabodetabek', 'Remote'],
      minMatchScore: 75,
      duplicateCooldownDays: 30,
      followUpReminderDays: 7,
      emailSignature: 'Hormat saya,\nNama Lengkap Kandidat',
    });
  }

  console.log(`[Seed] Akun pemilik tunggal (${ownerEmail}) & profil awal siap digunakan.`);
  process.exit(0);
}

seedOwnerAccount().catch((err) => {
  console.error('[Seed Error]:', err);
  process.exit(1);
});