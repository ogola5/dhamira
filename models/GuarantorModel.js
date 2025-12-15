import mongoose from 'mongoose';

const { Schema } = mongoose;

const guarantorSchema = new Schema(
  {
    loanId: { type: Schema.Types.ObjectId, ref: 'Loan', required: true, index: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },

    relationship: { type: String, required: true, trim: true },

    external: { type: Boolean, default: true },

    idCopyUrl: { type: String, required: true },
    photoUrl: { type: String, required: true },

    accepted: { type: Boolean, default: false, index: true },
    acceptedAt: { type: Date },
  },
  { timestamps: true }
);

// Prevent same guarantor being added twice for same loan
guarantorSchema.index({ loanId: 1, clientId: 1 }, { unique: true });

// Optional: quickly fetch accepted guarantors for approval checks
guarantorSchema.index({ loanId: 1, accepted: 1 });

export default mongoose.model('Guarantor', guarantorSchema);
