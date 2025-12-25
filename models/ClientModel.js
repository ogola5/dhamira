import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Normalizers for messy Excel input
 */
function normalizeNationalId(v) {
  return typeof v === 'string' ? v.trim() : v;
}

function normalizePhone(v) {
  if (typeof v !== 'string') return v;
  return v.trim();
}

const clientSchema = new Schema(
  {
    /**
     * ============================
     * CORE IDENTITY (EXCEL SOURCE)
     * ============================
     */
    name: {
      type: String,
      required: true,
      trim: true,
    },

    nationalId: {
      type: String,
      required: true,
      unique: true, // HARD RULE — never violated
      trim: true,
      set: normalizeNationalId,
      index: true,
    },

    phone: {
      type: String,
      required: true,
      trim: true,
      set: normalizePhone,
    },

    /**
     * ============================
     * STRUCTURE
     * ============================
     */
    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },

    /**
     * ============================
     * BUSINESS CONTEXT (EXCEL)
     * ============================
     */
    businessType: {
      type: String,
      required: true,
      trim: true,
    },

    /**
     * Excel "RESIDENCE" = business location, NOT housing
     */
    businessLocation: {
      type: String,
      required: true,
      trim: true,
    },

    /**
     * ============================
     * POST-MIGRATION FIELDS
     * (NULL FOR LEGACY)
     * ============================
     */

    /**
     * Housing status (collected later)
     */
    residenceType: {
      type: String,
      enum: ['owned', 'rented'],
      default: null,
    },

    /**
     * KYC media (placeholder allowed)
     */
    photoUrl: {
      type: String,
      default: '/uploads/placeholder-client.jpg',
    },

    /**
     * Next of kin (legacy does NOT have this)
     */
    nextOfKin: {
      name: { type: String, trim: true },
      phone: { type: String, trim: true, set: normalizePhone },
      relationship: { type: String, trim: true },
    },

    /**
     * ============================
     * FINANCIAL STATE (FUTURE)
     * ============================
     */
    savings_balance_cents: {
      type: Number,
      default: 0,
      min: 0,
    },

    registrationFeePaid: {
      type: Boolean,
      default: false,
    },

    initialSavingsPaid: {
      type: Boolean,
      default: false,
    },

    /**
     * ============================
     * LEGACY METADATA (CRITICAL)
     * ============================
     */
    source: {
      type: String,
      enum: ['legacy_excel', 'system'],
      default: 'legacy_excel',
      index: true,
    },

    status: {
      type: String,
      enum: ['legacy', 'active'],
      default: 'legacy',
      index: true,
    },

    legacyImportedAt: {
      type: Date,
      default: null,
    },

    /**
     * ============================
     * AUDIT
     * ============================
     */
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    /**
     * Excel registration date (historical)
     */
    registrationDate: {
      type: Date,
    },
  },
  { timestamps: true }
);

/**
 * Common legacy access patterns
 */
clientSchema.index({ groupId: 1, createdAt: -1 });
clientSchema.index({ status: 1, source: 1 });

export default mongoose.model('Client', clientSchema);
