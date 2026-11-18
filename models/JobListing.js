const mongoose = require('mongoose');
const { Schema } = mongoose;

const JobListingSchema = new Schema(
  {
    inputSource: {
      type: String,
      enum: ['auto_scraper', 'manual_quick_capture'],
      required: true,
    },
    sourcePlatform: {
      type: String,
      enum: [
        'linkedin',
        'instagram',
        'facebook',
        'jobstreet',
        'glints',
        'kalibrr',
        'indeed',
        'whatsapp_telegram',
        'other',
      ],
      required: true,
      index: true,
    },
    sourceUrl: { type: String, unique: true, sparse: true },
    contentHash: { type: String, unique: true, required: true },
    jobTitle: { type: String, required: true },
    companyName: { type: String, required: true },
    location: { type: String, default: 'Indonesia' },
    rawDescription: { type: String, default: '' },
    extractedPosterText: { type: String, default: '' },
    mandatorySubjectRule: { type: String, default: null },
    extractedEmail: { type: String, lowercase: true, trim: true, default: null },
    isProcessedByAi: { type: Boolean, default: false, index: true },
    scrapedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobListing', JobListingSchema);