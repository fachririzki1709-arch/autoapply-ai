const crypto = require('crypto');
const axios = require('axios');
const cheerio = require('cheerio');
const CandidateProfile = require('../models/CandidateProfile');
const JobListing = require('../models/JobListing');
const { extractPosterTextWithVision } = require('./visionOcrService');
const { evaluateAndDraftJob } = require('./aiOrchestratorService');

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function generateContentHash(companyName, jobTitle, rawText) {
  const normalized = `${(companyName || '').toLowerCase().trim()}|${(jobTitle || '')
    .toLowerCase()
    .trim()}|${(rawText || '').slice(0, 250).toLowerCase().trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function detectPlatformFromUrl(url) {
  const lower = (url || '').toLowerCase();
  if (lower.includes('linkedin.com')) return 'linkedin';
  if (lower.includes('instagram.com')) return 'instagram';
  if (lower.includes('facebook.com') || lower.includes('fb.com')) return 'facebook';
  if (lower.includes('jobstreet.')) return 'jobstreet';
  if (lower.includes('glints.com')) return 'glints';
  if (lower.includes('kalibrr.com')) return 'kalibrr';
  if (lower.includes('indeed.com')) return 'indeed';
  return 'other';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Mengambil konten teks (dan gambar og:image jika ada) dari sebuah URL lowongan
 */
async function fetchJobContentFromUrl(targetUrl) {
  const response = await axios.get(targetUrl, {
    timeout: 15000,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  const $ = cheerio.load(response.data);
  $('script, style, nav, footer, iframe').remove();

  const ogTitle = $('meta[property="og:title"]').attr('content') || $('title').text() || 'Lowongan Kerja';
  const ogDesc =
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    '';
  const ogImage = $('meta[property="og:image"]').attr('content') || null;
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 5000);

  let posterText = '';
  if (ogImage && ogImage.startsWith('http')) {
    try {
      const imgRes = await axios.get(ogImage, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'User-Agent': USER_AGENT },
      });
      const mimeType = imgRes.headers['content-type'] || 'image/jpeg';
      if (mimeType.startsWith('image/')) {
        posterText = await extractPosterTextWithVision(Buffer.from(imgRes.data), mimeType);
      }
    } catch (_) {
      // Abaikan jika og:image tidak bisa diunduh
    }
  }

  return {
    title: ogTitle.trim(),
    rawDescription: `${ogDesc}\n\n${bodyText}`.trim(),
    extractedPosterText: posterText,
    sourcePlatform: detectPlatformFromUrl(targetUrl),
  };
}

/**
 * Memindai sumber publik terindeks lintas platform (LinkedIn, Instagram, Facebook, JobStreet, Glints, Kalibrr, Indeed)
 * dengan batasan kuota 15-20 item per siklus agar stabil dan aman dari rate-limit.
 */
async function runMultiPlatformScan(maxItemsPerCycle = 18) {
  const profile = await CandidateProfile.findOne();
  const keywords =
    profile && profile.targetKeywords && profile.targetKeywords.length > 0
      ? profile.targetKeywords
      : ['Admin Logistik', 'Quality Control', 'Web Developer', 'Graphic Designer'];

  const excluded = (profile?.excludedKeywords || []).map((k) => k.toLowerCase());
  const locations =
    profile && profile.targetLocations && profile.targetLocations.length > 0
      ? profile.targetLocations
      : ['Jawa Barat', 'Indonesia'];

  const primaryQuery = keywords.slice(0, 3).join(' OR ');
  const primaryLoc = locations[0] || 'Indonesia';

  // Konektor pencarian publik terindeks (RSS / Public Search Feed)
  const feedSources = [
    {
      platform: 'linkedin',
      url: `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(
        keywords[0]
      )}&location=${encodeURIComponent(primaryLoc)}&start=0`,
      type: 'linkedin_guest',
    },
    {
      platform: 'indeed',
      url: `https://id.indeed.com/rss?q=${encodeURIComponent(primaryQuery)}&l=${encodeURIComponent(primaryLoc)}`,
      type: 'rss',
    },
    {
      platform: 'glints',
      url: `https://glints.com/id/opportunities/jobs/explore?keyword=${encodeURIComponent(
        keywords[0]
      )}&country=ID&locationName=${encodeURIComponent(primaryLoc)}`,
      type: 'html_cards',
    },
  ];

  const collectedCandidates = [];

  for (const source of feedSources) {
    if (collectedCandidates.length >= maxItemsPerCycle) break;

    try {
      const res = await axios.get(source.url, {
        timeout: 12000,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });

      const $ = cheerio.load(res.data, { xmlMode: source.type === 'rss' });

      if (source.type === 'linkedin_guest') {
        $('li').each((_, el) => {
          if (collectedCandidates.length >= maxItemsPerCycle) return;
          const title = $(el).find('.base-search-card__title').text().trim();
          const company = $(el).find('.base-search-card__subtitle').text().trim();
          const location = $(el).find('.job-search-card__location').text().trim();
          const link = $(el).find('a.base-card__full-link').attr('href')?.split('?')[0] || '';

          if (title && company && link) {
            collectedCandidates.push({
              sourcePlatform: 'linkedin',
              sourceUrl: link,
              jobTitle: title,
              companyName: company,
              location: location || primaryLoc,
              rawDescription: `${title} di ${company} (${location}). Sumber: LinkedIn Jobs.`,
            });
          }
        });
      } else if (source.type === 'rss') {
        $('item').each((_, el) => {
          if (collectedCandidates.length >= maxItemsPerCycle) return;
          const title = $(el).find('title').text().trim();
          const link = $(el).find('link').text().trim();
          const desc = cheerio.load($(el).find('description').text()).text().trim();
          const sourceCompany = $(el).find('source').text().trim() || 'Perusahaan Terverifikasi';

          if (title && link) {
            collectedCandidates.push({
              sourcePlatform: source.platform,
              sourceUrl: link,
              jobTitle: title,
              companyName: sourceCompany,
              location: primaryLoc,
              rawDescription: desc || title,
            });
          }
        });
      } else {
        $('a[href*="/opportunities/jobs/"]').each((_, el) => {
          if (collectedCandidates.length >= maxItemsPerCycle) return;
          const href = $(el).attr('href');
          const text = $(el).text().replace(/\s+/g, ' ').trim();
          if (href && text.length > 10) {
            const fullUrl = href.startsWith('http') ? href : `https://glints.com${href}`;
            collectedCandidates.push({
              sourcePlatform: 'glints',
              sourceUrl: fullUrl.split('?')[0],
              jobTitle: text.slice(0, 90),
              companyName: 'Perusahaan Glints',
              location: primaryLoc,
              rawDescription: text,
            });
          }
        });
      }

      // Jeda sopan antar-platform untuk menghindari pemblokiran IP
      await sleep(1200 + Math.floor(Math.random() * 800));
    } catch (err) {
      console.warn(`[scraperService] Lewati sumber ${source.platform}:`, err.message);
    }
  }

  let newlySaved = 0;
  let draftsGenerated = 0;

  for (const item of collectedCandidates) {
    const combinedLower = `${item.jobTitle} ${item.rawDescription}`.toLowerCase();
    if (excluded.some((badWord) => badWord && combinedLower.includes(badWord))) {
      continue;
    }

    const contentHash = generateContentHash(item.companyName, item.jobTitle, item.rawDescription);
    const exists = await JobListing.findOne({
      $or: [{ contentHash }, ...(item.sourceUrl ? [{ sourceUrl: item.sourceUrl }] : [])],
    });

    if (exists) continue;

    // Ambil detail halaman jika URL tersedia untuk mendapatkan email HRD / deskripsi penuh / poster
    let enrichedDesc = item.rawDescription;
    let extractedPosterText = '';
    if (item.sourceUrl) {
      try {
        const pageDetail = await fetchJobContentFromUrl(item.sourceUrl);
        if (pageDetail.rawDescription.length > enrichedDesc.length) {
          enrichedDesc = pageDetail.rawDescription;
        }
        extractedPosterText = pageDetail.extractedPosterText || '';
        await sleep(900);
      } catch (_) {
        // Gunakan ringkasan awal jika halaman detail memblokir request
      }
    }

    const jobDoc = await JobListing.create({
      inputSource: 'auto_scraper',
      sourcePlatform: item.sourcePlatform,
      sourceUrl: item.sourceUrl || undefined,
      contentHash,
      jobTitle: item.jobTitle,
      companyName: item.companyName,
      location: item.location,
      rawDescription: enrichedDesc,
      extractedPosterText,
      isProcessedByAi: false,
    });

    newlySaved += 1;

    try {
      const evalResult = await evaluateAndDraftJob(jobDoc._id);
      if (evalResult.status === 'draft_created') {
        draftsGenerated += 1;
      }
    } catch (aiErr) {
      console.error(`[scraperService] Gagal evaluasi AI untuk ${jobDoc._id}:`, aiErr.message);
    }
  }

  return {
    scannedCount: collectedCandidates.length,
    newlySaved,
    draftsGenerated,
  };
}

module.exports = {
  generateContentHash,
  detectPlatformFromUrl,
  fetchJobContentFromUrl,
  runMultiPlatformScan,
};