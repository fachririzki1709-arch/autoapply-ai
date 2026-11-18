const cron = require('node-cron');
const { runMultiPlatformScan } = require('./scraperService');

let scheduledTask = null;

function initCronScheduler() {
  if (String(process.env.ENABLE_AUTO_CRON || 'true') !== 'true') {
    console.log('[CronService] Penjadwal otomatis dinonaktifkan melalui ENABLE_AUTO_CRON.');
    return;
  }

  const expression = process.env.CRON_SCHEDULE || '0 7 * * *'; // Default 07:00 WIB setiap hari
  if (!cron.validate(expression)) {
    console.error(`[CronService] Ekspresi cron tidak valid: ${expression}`);
    return;
  }

  scheduledTask = cron.schedule(
    expression,
    async () => {
      console.log(`[CronService] Memulai pemindaian lowongan otomatis (${new Date().toISOString()})...`);
      try {
        const summary = await runMultiPlatformScan(18);
        console.log('[CronService] Pemindaian selesai:', summary);
      } catch (err) {
        console.error('[CronService] Kesalahan pada siklus pemindaian:', err.message);
      }
    },
    {
      timezone: 'Asia/Jakarta',
    }
  );

  console.log(`[CronService] Terjadwal aktif pada '${expression}' (Zona Waktu: Asia/Jakarta / WIB).`);
}

module.exports = { initCronScheduler };