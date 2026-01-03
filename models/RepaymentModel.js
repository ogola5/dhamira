import mongoose from 'mongoose';

const { Schema } = mongoose;

const repaymentSchema = new Schema(
  {
    loanId: { type: Schema.Types.ObjectId, ref: 'Loan', required: true, index: true },

    // Money in cents
    amount_cents: { type: Number, required: true, min: 1 },

    paymentMethod: { type: String, enum: ['mpesa', 'cash', 'bank_transfer'], default: 'mpesa' },

    transactionId: { type: String },

    paidBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    notes: { type: String },
  },
  { timestamps: true }
);

repaymentSchema.index({ loanId: 1, createdAt: -1 });

// Unique only when transactionId exists (prevents duplicate M-Pesa confirmations)
repaymentSchema.index(
  { transactionId: 1 },
  {
    unique: true,
    partialFilterExpression: { transactionId: { $type: 'string' } },
  }
);

export default mongoose.model('Repayment', repaymentSchema);
