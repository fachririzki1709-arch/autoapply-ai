const rateLimit = require('express-rate-limit');

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit
  max: 5, // Maksimal 5 kali percobaan gagal dalam 15 menit
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    const msg = 'Terlalu banyak percobaan masuk gagal. IP Anda dikunci sementara selama 15 menit.';
    if (req.accepts('json') && !req.accepts('html')) {
      return res.status(429).json({ success: false, message: msg });
    }
    return res.status(429).render('login', {
      error: msg,
      email: req.body?.email || '',
    });
  },
});

module.exports = { loginRateLimiter };