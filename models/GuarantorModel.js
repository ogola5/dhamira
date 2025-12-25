import mongoose from 'mongoose';

const { Schema } = mongoose;

const guarantorSchema = new Schema(
  {
    loanId: { type: Schema.Types.ObjectId, ref: 'Loan', required: true, index: true },

    // MVP: guarantor must be a known Client in system
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },

    relationship: { type: String, required: true, trim: true },

    // Policy: external guarantor required (serviced FAFA before)
    external: { type: Boolean, default: true, index: true },

    // Evidence
    idCopyUrl: { type: String, required: true, trim: true },
    photoUrl: { type: String, required: true, trim: true },

    // Eligibility snapshot at time of add
    eligibility: {
      hasRepaidFafaBefore: { type: Boolean, default: false },
      checkedAt: { type: Date, default: null },
      notes: { type: String, trim: true, default: '' },
    },

    accepted: { type: Boolean, default: false, index: true },
    acceptedAt: { type: Date, default: null },
    acceptedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  },
  { timestamps: true }
);

// Prevent same guarantor being added twice for same loan
guarantorSchema.index({ loanId: 1, clientId: 1 }, { unique: true });

// Fetch accepted guarantors quickly
guarantorSchema.index({ loanId: 1, accepted: 1 });

export default mongoose.model('Guarantor', guarantorSchema);
