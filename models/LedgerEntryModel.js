import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * LedgerEntry
 * -----------
 * Append-only, immutable accounting records.
 * Corrections MUST be done via reversal entries.
 */
const ledgerEntrySchema = new Schema(
  {
    account: {
      type: String,
      enum: [
        'cash_mpesa',
        'loans_receivable',
        'interest_income',
        'suspense_overpay',
      ],
      required: true,
      index: true,
    },

    direction: {
      type: String,
      enum: ['DEBIT', 'CREDIT'],
      required: true,
      index: true,
    },

    amount_cents: {
      type: Number,
      required: true,
      min: 1,
    },

    loanId: {
      type: Schema.Types.ObjectId,
      ref: 'Loan',
      required: true,
      index: true,
    },

    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
    },

    entryType: {
      type: String,
      enum: ['disbursement', 'repayment', 'reversal'],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['completed', 'failed'],
      default: 'completed',
      index: true,
      immutable: true,
    },
  },
  { timestamps: true }
);

/**
 * HARD RULE: ledger rows are immutable
 */
ledgerEntrySchema.pre('updateOne', () => {
  throw new Error('Ledger entries are immutable');
});
ledgerEntrySchema.pre('findOneAndUpdate', () => {
  throw new Error('Ledger entries are immutable');
});

/**
 * Indexes for reconciliation & reporting
 */
ledgerEntrySchema.index(
  { transactionId: 1, account: 1, direction: 1 },
  { unique: true }
);

ledgerEntrySchema.index({ loanId: 1, account: 1, direction: 1 });

export default mongoose.model('LedgerEntry', ledgerEntrySchema);
