import mongoose from 'mongoose';

const { Schema } = mongoose;

const loanSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
    groupId: { type: Schema.Types.ObjectId, ref: 'Group', required: true, index: true },

    type: { type: String, enum: ['emergency', 'business', 'school_fees'], required: true },

    // Money in cents
    principal_cents: { type: Number, required: true, min: 0 },
    total_due_cents: { type: Number, required: true, min: 0 },
    total_paid_cents: { type: Number, default: 0, min: 0 },
    outstanding_cents: { type: Number, required: true, min: 0 },

    // Term rules:
    // emergency = weeks (4/5/6)
    // business/school_fees = months (3-12)
    term: { type: Number, required: true },

    // Store a normalized rate-per-period (e.g. 0.035 per month, 0.20 flat for emergency)
    rate_per_period: { type: Number, required: true, min: 0 },

    interest_model: { type: String, enum: ['simple'], default: 'simple' },

    status: {
      type: String,
      enum: ['initiated', 'approved', 'disbursed', 'repaid', 'defaulted'],
      default: 'initiated',
      index: true,
    },

    applicationFeePaid: { type: Boolean, default: false },

    initiatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    approvedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],

    approvedAt: { type: Date },
    disbursedAt: { type: Date },

    dueDate: { type: Date, index: true },

    // Optional: cached for convenience (e.g., weekly repayment expectation)
    expected_installment_cents: { type: Number, min: 0 },
  },
  { timestamps: true }
);

// Compute rule-based pricing at creation time only.
// Controllers should set principal_cents from requested amount (KES * 100).
loanSchema.pre('validate', function (next) {
  if (!this.isNew) return next();

  const type = this.type;
  const term = this.term;
  const principal = this.principal_cents;

  if (!Number.isInteger(principal) || principal <= 0) {
    return next(new Error('principal_cents must be a positive integer'));
  }

  let ratePerPeriod;
  let dueDate;

  if (type === 'emergency') {
    // 2000–10000 KES
    if (principal < 2000 * 100 || principal > 10000 * 100) {
      return next(new Error('Emergency loan amount must be between 2000 and 10000 KES'));
    }
    if (![4, 5, 6].includes(term)) {
      return next(new Error('Emergency loan term must be 4, 5, or 6 weeks'));
    }
    ratePerPeriod = term === 4 ? 0.20 : term === 5 ? 0.25 : 0.30; // flat over whole term
    dueDate = new Date(Date.now() + term * 7 * 24 * 60 * 60 * 1000);
    this.rate_per_period = ratePerPeriod;

    const totalDue = Math.round(principal * (1 + ratePerPeriod));
    this.total_due_cents = totalDue;
    this.outstanding_cents = totalDue;
    this.expected_installment_cents = Math.floor(totalDue / term); // weekly-ish
  } else {
    // business/school_fees
    if (principal < 5000 * 100 || principal > 100000 * 100) {
      return next(new Error('Business/School loan amount must be between 5000 and 100000 KES'));
    }
    if (term < 3 || term > 12) {
      return next(new Error('Business/School loan term must be 3–12 months'));
    }

    ratePerPeriod = 0.035; // per month
    dueDate = new Date(Date.now() + term * 30 * 24 * 60 * 60 * 1000); // approximation
    this.rate_per_period = ratePerPeriod;

    const totalDue = Math.round(principal * (1 + ratePerPeriod * term)); // simple interest
    this.total_due_cents = totalDue;
    this.outstanding_cents = totalDue;
    this.expected_installment_cents = Math.floor(totalDue / term); // monthly
  }

  this.total_paid_cents = 0;
  this.dueDate = dueDate;

  next();
});

loanSchema.index({ clientId: 1, createdAt: -1 });
loanSchema.index({ groupId: 1, createdAt: -1 });
loanSchema.index({ status: 1, dueDate: 1 });

export default mongoose.model('Loan', loanSchema);
