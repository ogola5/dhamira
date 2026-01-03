import mongoose from 'mongoose';

const { Schema } = mongoose;

const guarantorSchema = new Schema(
  {
    loanId: { type: Schema.Types.ObjectId, ref: 'Loan', required: true, index: true },

    // If the guarantor is a registered client, `clientId` links to that document.
    // For external guarantors (not registered as clients), store identifying
    // fields here and set `clientId` to null.
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: false, index: true },

    // External guarantor information (optional when clientId is present)
    guarantorName: { type: String, trim: true },
    guarantorNationalId: { type: String, trim: true },
    guarantorPhone: { type: String, trim: true },

    relationship: { type: String, required: false, trim: true, default: 'unknown' },

    // Policy: whether guarantor is external to the system
    external: { type: Boolean, default: true, index: true },

    // Evidence (optional)
    idCopyUrl: { type: String, trim: true },
    photoUrl: { type: String, trim: true },

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

// Prevent same guarantor (registered client) being added twice for same loan
// Only applies when clientId is present (non-null)
guarantorSchema.index(
  { loanId: 1, clientId: 1 },
  { 
    unique: true, 
    partialFilterExpression: { 
      clientId: { $type: 'objectId' } 
    } 
  }
);

// Prevent duplicate external guarantors for same loan by nationalId
guarantorSchema.index(
  { loanId: 1, guarantorNationalId: 1 },
  { unique: true, partialFilterExpression: { guarantorNationalId: { $type: 'string', $gt: '' } } }
);

// Fetch accepted guarantors quickly
guarantorSchema.index({ loanId: 1, accepted: 1 });

export default mongoose.model('Guarantor', guarantorSchema);
