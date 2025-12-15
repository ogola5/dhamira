import mongoose from 'mongoose';

const { Schema } = mongoose;

function normalizeNationalId(v) {
  return typeof v === 'string' ? v.trim() : v;
}

function normalizePhone(v) {
  if (typeof v !== 'string') return v;
  // Minimal normalization: trim spaces. You can enforce E.164 later (+2547...)
  return v.trim();
}

const clientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },

    nationalId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      set: normalizeNationalId,
      index: true,
    },

    phone: { type: String, required: true, trim: true, set: normalizePhone },

    photoUrl: { type: String, required: true },

    residence: { type: String, enum: ['owned', 'rented'], required: true },

    businessType: { type: String, required: true, trim: true },
    businessLocation: { type: String, required: true, trim: true },

    nextOfKin: {
      name: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true, set: normalizePhone },
      relationship: { type: String, required: true, trim: true },
    },

    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },

    // Money: store as cents
    savings_balance_cents: { type: Number, default: 0, min: 0 },

    registrationFeePaid: { type: Boolean, default: false },
    initialSavingsPaid: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

clientSchema.index({ groupId: 1, createdAt: -1 });

export default mongoose.model('Client', clientSchema);
