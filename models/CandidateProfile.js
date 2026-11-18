const mongoose = require('mongoose');
const { Schema } = mongoose;

const CandidateProfileSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    portfolioUrl: { type: String, default: '' },
    linkedinUrl: { type: String, default: '' },
    targetKeywords: [{ type: String }],
    excludedKeywords: [{ type: String }],
    targetLocations: [{ type: String }],
    minMatchScore: { type: Number, default: 75, min: 50, max: 95 },
    duplicateCooldownDays: { type: Number, default: 30, min: 1, max: 180 },
    followUpReminderDays: { type: Number, default: 7, min: 1, max: 30 },
    emailSignature: { type: String, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CandidateProfile', CandidateProfileSchema);