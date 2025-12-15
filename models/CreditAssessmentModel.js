import mongoose from 'mongoose';

const { Schema } = mongoose;

const creditAssessmentSchema = new Schema(
  {
    loanId: { type: Schema.Types.ObjectId, ref: 'Loan', required: true, unique: true, index: true },

    character: { type: Number, min: 1, max: 5, required: true },
    capacity: { type: Number, min: 1, max: 5, required: true },
    capital: { type: Number, min: 1, max: 5, required: true },
    collateral: { type: Number, min: 1, max: 5, required: true },
    conditions: { type: Number, min: 1, max: 5, required: true },

    officerNotes: { type: String, trim: true },

    assessedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

creditAssessmentSchema.index({ assessedBy: 1, createdAt: -1 });

export default mongoose.model('CreditAssessment', creditAssessmentSchema);
