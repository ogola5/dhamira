import mongoose from 'mongoose';

const { Schema } = mongoose;

const loanSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true, index: true },

    // Product types aligned to your policy doc
    product: {
      type: String,
      enum: ['fafa', 'business'],
      required: true,
      index: true,
    },

    // Loan lifecycle
    status: {
      type: String,
      enum: ['initiated', 'approved', 'disbursement_pending', 'disbursed', 'repaid', 'defaulted', 'cancelled'],
      default: 'initiated',
      index: true,
    },

    // Requested + approved terms
    principal_cents: { type: Number, required: true, min: 1 },
    term: { type: Number, required: true, min: 1 }, // FAFA weeks (4-6), Business months (3-12)
    cycle: { type: Number, required: true, min: 1 }, // 1..4 for business, 1..3 for fafa

    // Pricing
    interest_model: { type: String, enum: ['simple'], default: 'simple' },

    // FAFA: 5% per week, Business: 3% per month
    rate_per_period: { type: Number, required: true, min: 0 },

    // Application fee (LAF)
    application_fee_cents: { type: Number, required: true, min: 0 },
    applicationFeePaid: { type: Boolean, default: false, index: true },

    // Cached totals (derived from ledger but stored for fast reads)
    total_due_cents: { type: Number, required: true, min: 0 },
    total_paid_cents: { type: Number, default: 0, min: 0 },
    outstanding_cents: { type: Number, required: true, min: 0 },

    expected_installment_cents: { type: Number, min: 0 },

    // Dates
    approvedAt: { type: Date, default: null },
    disbursedAt: { type: Date, default: null },
    dueDate: { type: Date, default: null, index: true },

    // Governance / audit trail
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    approvedBy: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    disbursedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // Link to disbursement transaction (B2C)
    disbursementTransactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', default: null, index: true },
  },
  { timestamps: true }
);

/**
 * Policy rules applied on creation.
 * Controllers set principal_cents, product, term, cycle.
 * This hook computes pricing fields and basic ranges.
 */
loanSchema.pre('validate', function (next) {
  if (!this.isNew) return next();

  const principal = this.principal_cents;
  const product = this.product;
  const term = this.term;
  const cycle = this.cycle;

  if (!Number.isInteger(principal) || principal <= 0) {
    return next(new Error('principal_cents must be a positive integer'));
  }

  const now = Date.now();

  if (product === 'fafa') {
    // FAFA cycles: 1: 2k–6k, 2: 7k–8k, 3: 9k–10k
    const k = principal / 100;
    const cycleRanges = {
      1: [2000, 6000],
      2: [7000, 8000],
      3: [9000, 10000],
    };
    const r = cycleRanges[cycle];
    if (!r) return next(new Error('FAFA cycle must be 1, 2, or 3'));
    if (k < r[0] || k > r[1]) return next(new Error(`FAFA cycle ${cycle} amount must be between ${r[0]} and ${r[1]} KES`));

    if (![4, 5, 6].includes(term)) return next(new Error('FAFA term must be 4–6 weeks'));

    // Pricing: 5% per week simple
    this.rate_per_period = 0.05;
    const totalDue = Math.round(principal * (1 + this.rate_per_period * term));
    this.total_due_cents = totalDue;
    this.outstanding_cents = totalDue;

    // LAF: 4% of applied
    this.application_fee_cents = Math.round(principal * 0.04);

    this.expected_installment_cents = Math.floor(totalDue / term);
    this.dueDate = new Date(now + term * 7 * 24 * 60 * 60 * 1000);
  }

  if (product === 'business') {
    // Business cycles:
    // 1: 5k–20k (3/4 months)
    // 2: 25k–45k (5/6 months) + special rule 25k => 5 months
    // 3: 50k–75k (6–9 months) + special rule 50k => 6 months
    // 4: 80k–100k+ (duration based on records; MVP cap at 12 months)
    const k = principal / 100;

    if (![1, 2, 3, 4].includes(cycle)) return next(new Error('Business cycle must be 1–4'));

    const inRange = (x, a, b) => x >= a && x <= b;

    if (cycle === 1) {
      if (!inRange(k, 5000, 20000)) return next(new Error('Business cycle 1 amount must be 5,000–20,000 KES'));
      if (![3, 4].includes(term)) return next(new Error('Business cycle 1 term must be 3 or 4 months'));
    }
    if (cycle === 2) {
      if (!inRange(k, 25000, 45000)) return next(new Error('Business cycle 2 amount must be 25,000–45,000 KES'));
      if (![5, 6].includes(term)) return next(new Error('Business cycle 2 term must be 5 or 6 months'));
      if (k === 25000 && term !== 5) return next(new Error('25,000 KES business loan must be 5 months'));
    }
    if (cycle === 3) {
      if (!inRange(k, 50000, 75000)) return next(new Error('Business cycle 3 amount must be 50,000–75,000 KES'));
      if (term < 6 || term > 9) return next(new Error('Business cycle 3 term must be 6–9 months'));
      if (k === 50000 && term !== 6) return next(new Error('50,000 KES business loan must be 6 months'));
    }
    if (cycle === 4) {
      if (k < 80000) return next(new Error('Business cycle 4 amount must be >= 80,000 KES'));
      if (term < 6 || term > 12) return next(new Error('Business cycle 4 term must be 6–12 months'));
    }

    // Pricing: 3% per month simple
    this.rate_per_period = 0.03;
    const totalDue = Math.round(principal * (1 + this.rate_per_period * term));
    this.total_due_cents = totalDue;
    this.outstanding_cents = totalDue;

    // LAF: 4% but fixed 500 for 5k and 10k
    if (k === 5000 || k === 10000) this.application_fee_cents = 500 * 100;
    else this.application_fee_cents = Math.round(principal * 0.04);

    this.expected_installment_cents = Math.floor(totalDue / term);
    this.dueDate = new Date(now + term * 30 * 24 * 60 * 60 * 1000); // OK for MVP
  }

  this.total_paid_cents = 0;
  next();
});

loanSchema.index({ clientId: 1, createdAt: -1 });
loanSchema.index({ groupId: 1, createdAt: -1 });
loanSchema.index({ status: 1, dueDate: 1 });

export default mongoose.model('Loan', loanSchema);
