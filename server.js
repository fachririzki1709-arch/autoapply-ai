require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const helmet = require('helmet');
const compression = require('compression');
const { connectDB } = require('./config/db');
const { initCronScheduler } = require('./services/cronService');

const authRoutes = require('./routes/authRoutes');
const pageRoutes = require('./routes/pageRoutes');
const apiRoutes = require('./routes/apiRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy untuk Render.com agar secure cookie & rate-limiter membaca IP klien akurat
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

async function bootstrap() {
  await connectDB();

  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'autoapply_v3_fallback_secret_key',
      resave: false,
      saveUninitialized: false,
      store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'owner_sessions',
        ttl: 7 * 24 * 60 * 60,
      }),
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000,
      },
    })
  );

  app.use('/', authRoutes);
  app.use('/', pageRoutes);
  app.use('/api', apiRoutes);

  // Healthcheck endpoint untuk Render.com
  app.get('/healthz', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((req, res) => {
    res.status(404).send('404 — Halaman tidak ditemukan.');
  });

  initCronScheduler();

  app.listen(PORT, () => {
    console.log(`[AutoApply AI v3.0] Server aktif pada http://localhost:${PORT} (WIB)`);
  });
}

bootstrap().catch((err) => {
  console.error('[Fatal] Gagal menjalankan server AutoApply AI:', err);
  process.exit(1);
});