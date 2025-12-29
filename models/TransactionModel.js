import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * Transaction
 * -----------
 * Represents provider interaction (M-Pesa)
 * NOT accounting truth — ledger is.
 */
const transactionSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['mpesa_b2c', 'mpesa_c2b', 'manual'],
      required: true,
      index: true,
    },

    direction: {
      type: String,
      enum: ['IN', 'OUT'],
      required: true,
    },

    amount_cents: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: ['pending', 'success', 'failed'],
      default: 'pending',
      index: true,
    },

    // ===== PROVIDER REFERENCES =====

    mpesaReceipt: {
      type: String,
      sparse: true,
      index: true,
    },

    checkoutRequestId: {
      type: String,
      sparse: true,
      index: true,
    },

    providerConversationId: {
      type: String,
      sparse: true,
      index: true,
    },

    idempotencyKey: {
      type: String,
      sparse: true,
      index: true,
    },

    phone: String,

    rawCallback: {
      type: Object,
    },

    loanId: {
      type: Schema.Types.ObjectId,
      ref: 'Loan',
      index: true,
    },

    initiatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

/**
 * Idempotency guarantees
 */
transactionSchema.index(
  { type: 1, mpesaReceipt: 1 },
  {
    unique: true,
    // Only enforce uniqueness when mpesaReceipt is present and not null
    partialFilterExpression: { mpesaReceipt: { $exists: true, $ne: null } },
  }
);

transactionSchema.index(
  { type: 1, idempotencyKey: 1 },
  {
    unique: true,
    // Only enforce uniqueness when idempotencyKey is present and not null
    partialFilterExpression: { idempotencyKey: { $exists: true, $ne: null } },
  }
);

/**
 * Prevent mutation after finalization
 */
transactionSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate();
  if (update?.status && ['success', 'failed'].includes(update.status)) {
    throw new Error('Finalized transactions are immutable');
  }
});

export default mongoose.model('Transaction', transactionSchema);
