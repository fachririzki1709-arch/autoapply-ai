const mongoose = require('mongoose');
const { Schema } = mongoose;

const ApplicationDraftSchema = new Schema(
  {
    jobId: { type: Schema.Types.ObjectId, ref: 'JobListing', required: true, unique: true },
    selectedPresetId: { type: Schema.Types.ObjectId, ref: 'DocumentBundlePreset', default: null },
    attachmentMode: {
      type: String,
      enum: ['preset_bundle', 'cv_only'],
      default: 'preset_bundle',
    },
    matchScore: { type: Number, required: true, min: 0, max: 100 },
    matchedSkills: [{ type: String }],
    missingSkills: [{ type: String }],
    matchReasoning: [{ type: String }],
    isDuplicateWarning: { type: Boolean, default: false },
    previousApplicationInfo: { type: String, default: null },
    recipientEmail: { type: String, lowercase: true, trim: true, default: '' },
    emailSubject: { type: String, required: true },
    emailBody: { type: String, required: true },
    applicationStage: {
      type: String,
      enum: [
        'draft_pending',
        'sent',
        'in_review',
        'interview',
        'offered',
        'company_rejected',
        'user_discarded',
        'send_failed',
      ],
      default: 'draft_pending',
      index: true,
    },
    sentAt: { type: Date, default: null },
    followUpDueAt: { type: Date, default: null },
    interviewDate: { type: Date, default: null },
    interviewNotes: { type: String, default: null },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true }
);

ApplicationDraftSchema.index({ applicationStage: 1, matchScore: -1, createdAt: -1 });

module.exports = mongoose.model('ApplicationDraft', ApplicationDraftSchema);