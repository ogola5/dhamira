import mongoose from 'mongoose';
const { Schema } = mongoose;

const repaymentScheduleSchema = new Schema(
  {
    loanId: { type: Schema.Types.ObjectId, ref: 'Loan', required: true, index: true },
    installmentNo: { type: Number, required: true },
    dueDate: { type: Date, required: true, index: true },
    amount_due_cents: { type: Number, required: true, min: 1 },
  },
  { timestamps: true }
);

repaymentScheduleSchema.index({ loanId: 1, installmentNo: 1 }, { unique: true });

export default mongoose.model('RepaymentSchedule', repaymentScheduleSchema);
