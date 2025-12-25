import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * LedgerEntry
 * ------------
 * Append-only accounting records.
 * Double-entry enforced at application level.
 *
 * Accounts:
 * - cash_mpesa        : M-Pesa wallet / cash control
 * - loans_receivable  : Principal outstanding
 * - interest_income   : Interest earned on repayments
 * - suspense_overpay  : Excess payments awaiting allocation/refund
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
      index: true,
      required: true,
    },

    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
      index: true,
      required: true,
    },

    entryType: {
      type: String,
      enum: ['disbursement', 'repayment'],
      required: true,
      index: true,
    },

    /**
     * Ledger entries are immutable once completed.
     * Failures should be handled by reversal entries,
     * not by mutating existing rows.
     */
    status: {
      type: String,
      enum: ['pending', 'completed', 'failed'],
      default: 'completed',
      index: true,
    },
  },
  { timestamps: true }
);

/**
 * Helpful indexes for aggregation and reconciliation
 */
ledgerEntrySchema.index({ loanId: 1, account: 1, direction: 1, status: 1 });
ledgerEntrySchema.index({ transactionId: 1, entryType: 1 });

export default mongoose.model('LedgerEntry', ledgerEntrySchema);
