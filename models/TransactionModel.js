import mongoose from 'mongoose';

const { Schema } = mongoose;

const transactionSchema = new Schema(
  {
    // M-Pesa transaction type
    type: {
      type: String,
      enum: ['mpesa_b2c', 'mpesa_c2b'],
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

    // ==== IDEMPOTENCY & PROVIDER REFERENCES ====

    // C2B receipt number (TransID)
    mpesaReceipt: {
      type: String,
      index: true,
      sparse: true,
    },

    // B2C OriginatorConversationID
    checkoutRequestId: {
      type: String,
      index: true,
      sparse: true,
    },

    // Internal idempotency (B2C initiation)
    idempotencyKey: {
      type: String,
      index: true,
      sparse: true,
    },

    // ==== METADATA ====

    phone: { type: String },

    rawCallback: { type: Object },

    // ==== RELATIONS ====

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

// Prevent duplicate C2B callbacks
transactionSchema.index(
  { type: 1, mpesaReceipt: 1 },
  { unique: true, sparse: true }
);

// Prevent duplicate B2C initiation
transactionSchema.index(
  { type: 1, idempotencyKey: 1 },
  { unique: true, sparse: true }
);

export default mongoose.model('Transaction', transactionSchema);
