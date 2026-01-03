import mongoose from 'mongoose';

const { Schema } = mongoose;

function normalize(v) {
  return typeof v === 'string' ? v.trim() : v;
}

const clientSchema = new Schema(
  {
    /* =========================
       IDENTITY
    ========================= */

    name: {
      type: String,
      required: true,
      trim: true,
    },

    nationalId: {
      type: String,
      required: true,
      unique: true,
      set: normalize,
    },

    phone: {
      type: String,
      required: true,
      set: normalize,
    },

    /* =========================
       OWNERSHIP & STRUCTURE
    ========================= */

    groupId: {
      type: Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },

    branchId: {
      type: Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },

    loanOfficer: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    /* =========================
       BUSINESS CONTEXT
    ========================= */

    businessType: {
      type: String,
      required: true,
      trim: true,
    },

    businessLocation: {
      type: String,
      required: true,
      trim: true,
    },

    /* =========================
       KYC (POST-LEGACY)
    ========================= */

    residenceType: {
      type: String,
      enum: ['owned', 'rented'],
      lowercase: true,  // Automatically convert to lowercase
      default: null,
    },

    photoUrl: {
      type: String,
      default: '/uploads/placeholder-client.jpg',
    },

    nextOfKin: {
      name: String,
      phone: String,
      relationship: String,
    },

    /* =========================
       FINANCIAL STATE
    ========================= */

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

    /* =========================
       STATE
    ========================= */

    status: {
      type: String,
      enum: ['legacy', 'pending', 'active', 'inactive'],
      default: 'pending',
      index: true,
    },

    source: {
      type: String,
      enum: ['legacy_excel', 'system'],
      default: 'system',
      index: true,
    },

    legacyImportedAt: {
      type: Date,
      default: null,
    },

    registrationDate: {
      type: Date,
    },
  },
  { timestamps: true }
);

/* =========================
   INDEXES
========================= */
clientSchema.index({ groupId: 1, status: 1 });
clientSchema.index({ loanOfficer: 1, status: 1 });
clientSchema.index({ branchId: 1, status: 1 });

export default mongoose.model('Client', clientSchema);
