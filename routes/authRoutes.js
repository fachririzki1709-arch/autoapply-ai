const express = require('express');
const bcrypt = require('bcrypt');
const OwnerAuth = require('../models/OwnerAuth');
const { requireAuth, redirectIfAuthenticated } = require('../middleware/auth');
const { loginRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Catatan Keamanan: Rute /register atau /signup sengaja tidak disediakan (Single-Owner Architecture).

router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', {
    error: null,
    email: '',
  });
});

router.post('/login', redirectIfAuthenticated, loginRateLimiter, async (req, res) => {
  try {
    const email = (req.body.email || '').toLowerCase().trim();
    const password = req.body.password || '';
    const rememberMe = Boolean(req.body.rememberMe);

    const owner = await OwnerAuth.findOne({ email });
    if (!owner) {
      return res.status(401).render('login', {
        error: 'Kredensial tidak valid. Akses terbatas hanya untuk pemilik sistem.',
        email,
      });
    }

    if (owner.lockUntil && owner.lockUntil > new Date()) {
      return res.status(423).render('login', {
        error: 'Akun terkunci sementara karena percobaan gagal berulang. Coba lagi beberapa saat lagi.',
        email,
      });
    }

    const isMatch = await bcrypt.compare(password, owner.passwordHash);
    if (!isMatch) {
      owner.failedAttempts = (owner.failedAttempts || 0) + 1;
      if (owner.failedAttempts >= 5) {
        owner.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
      }
      await owner.save();

      return res.status(401).render('login', {
        error: 'Email atau kata sandi salah.',
        email,
      });
    }

    owner.failedAttempts = 0;
    owner.lockUntil = null;
    owner.lastLoginAt = new Date();
    await owner.save();

    req.session.ownerId = owner._id.toString();
    req.session.ownerEmail = owner.email;

    if (rememberMe) {
      req.session.cookie.maxAge = 7 * 24 * 60 * 60 * 1000; // 7 Hari
    } else {
      req.session.cookie.maxAge = 24 * 60 * 60 * 1000; // 24 Jam
    }

    return req.session.save(() => res.redirect('/dashboard'));
  } catch (err) {
    console.error('[Auth] Kesalahan login:', err);
    return res.status(500).render('login', {
      error: 'Terjadi kesalahan internal saat memverifikasi sesi.',
      email: req.body?.email || '',
    });
  }
});

router.post('/logout', requireAuth, (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

router.post('/api/auth/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Kata sandi baru minimal 8 karakter.',
      });
    }
    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: 'Konfirmasi kata sandi baru tidak cocok.',
      });
    }

    const owner = await OwnerAuth.findById(req.session.ownerId);
    const isValid = await bcrypt.compare(currentPassword, owner.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Kata sandi saat ini tidak sesuai.',
      });
    }

    owner.passwordHash = await bcrypt.hash(newPassword, 12);
    await owner.save();

    return res.json({
      success: true,
      message: 'Kata sandi pemilik berhasil diperbarui.',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;