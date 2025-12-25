import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * RepaymentSchedule
 * -----------------
 * Canonical source for defaults & penalties
 */
const repaymentScheduleSchema = new Schema(
  {
    loanId: {
      type: Schema.Types.ObjectId,
      ref: 'Loan',
      required: true,
      index: true,
    },

    installmentNo: {
      type: Number,
      required: true,
      min: 1,
    },

    dueDate: {
      type: Date,
      required: true,
      index: true,
    },

    amount_due_cents: {
      type: Number,
      required: true,
      min: 1,
    },

    paid_cents: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: ['pending', 'paid', 'overdue', 'defaulted'],
      default: 'pending',
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

repaymentScheduleSchema.index(
  { loanId: 1, installmentNo: 1 },
  { unique: true }
);

repaymentScheduleSchema.index({ status: 1, dueDate: 1 });

export default mongoose.model('RepaymentSchedule', repaymentScheduleSchema);
