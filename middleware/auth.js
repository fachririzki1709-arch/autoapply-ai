function requireAuth(req, res, next) {
  if (req.session && req.session.ownerId) {
    return next();
  }

  if (req.originalUrl.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      message: 'Sesi tidak valid atau telah berakhir. Silakan login kembali.',
    });
  }

  return res.redirect('/login');
}

function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.ownerId) {
    return res.redirect('/dashboard');
  }
  return next();
}

module.exports = {
  requireAuth,
  redirectIfAuthenticated,
};