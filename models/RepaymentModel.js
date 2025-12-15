// models/RepaymentModel.js
import mongoose from 'mongoose';

const repaymentSchema = new mongoose.Schema({
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: [true, 'Repayment must be associated with a loan'],
  },
  amount: {
    type: Number,
    required: [true, 'Repayment amount is required'],
    min: [100, 'Minimum repayment amount is 100 KES'],
  },
  paymentMethod: {
    type: String,
    enum: ['mpesa', 'cash', 'bank_transfer'],
    default: 'mpesa',
  },
  transactionId: {
    type: String, // e.g., M-Pesa confirmation code
  },
  paidBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Loan officer or admin recording it
    required: true,
  },
  notes: {
    type: String, // Optional feedback or comments for sentiment analysis
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Post-save hook to update loan status/balance
repaymentSchema.post('save', async function () {
  const loan = await this.model('Loan').findById(this.loanId);
  if (!loan) return;

  // Calculate remaining balance (simple: sum all repayments vs repaymentAmount)
  const repayments = await this.model('Repayment').find({ loanId: loan._id });
  const totalPaid = repayments.reduce((sum, rep) => sum + rep.amount, 0);

  if (totalPaid >= loan.repaymentAmount) {
    loan.status = 'repaid';
  } else if (new Date() > loan.dueDate && loan.status !== 'defaulted') {
    loan.status = 'defaulted';
  }

  await loan.save();
});

const RepaymentModel = mongoose.model('Repayment', repaymentSchema);

export default RepaymentModel;