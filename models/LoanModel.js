// models/LoanModel.js
import mongoose from 'mongoose';

const loanSchema = new mongoose.Schema({
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client',
    required: [true, 'Loan must be associated with a client'],
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: [true, 'Loan must be associated with a group'],
  },
  type: {
    type: String,
    enum: ['emergency', 'business', 'school_fees'],
    required: [true, 'Loan type is required'],
  },
  amount: {
    type: Number,
    required: [true, 'Loan amount is required'],
    min: [2000, 'Minimum loan amount is 2000 KES'],
  },
  term: {
    type: Number,
    required: [true, 'Loan term is required'],
  },
  interestRate: {
    type: Number,
    required: [true, 'Interest rate is required'],
  },
  status: {
    type: String,
    enum: ['initiated', 'approved', 'disbursed', 'repaid', 'defaulted'],
    default: 'initiated',
  },
  applicationFeePaid: {
    type: Boolean,
    default: false,
  },
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  approvedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  disbursementDate: {
    type: Date,
  },
  dueDate: {
    type: Date,
  },
  repaymentAmount: {
    type: Number,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Pre-save hook to calculate interest and due date based on type/term
loanSchema.pre('save', function (next) {
  if (this.isNew || this.isModified('type') || this.isModified('term') || this.isModified('amount')) {
    const { type, term, amount } = this;

    if (type === 'emergency') {
      if (amount < 2000 || amount > 10000) {
        return next(new Error('Emergency loan amount must be between 2000 and 10000 KES'));
      }
      if (![4, 5, 6].includes(term)) {
        return next(new Error('Emergency loan term must be 4, 5, or 6 weeks'));
      }
      this.interestRate = term === 4 ? 0.20 : term === 5 ? 0.25 : 0.30;
      this.dueDate = new Date(Date.now() + term * 7 * 24 * 60 * 60 * 1000); // Weeks to ms
    } else if (type === 'business' || type === 'school_fees') { // Treat school_fees similar unless specified
      if (amount < 5000 || amount > 100000) {
        return next(new Error('Business/School loan amount must be between 5000 and 100000 KES'));
      }
      if (term < 3 || term > 12) {
        return next(new Error('Business/School loan term must be 3-12 months'));
      }
      this.interestRate = 0.035; // 3.5% per month
      this.dueDate = new Date(Date.now() + term * 30 * 24 * 60 * 60 * 1000); // Months approx to ms
    }

    this.repaymentAmount = amount * (1 + this.interestRate * (type === 'emergency' ? 1 : term)); // Simple interest; adjust for compound if needed
  }
  next();
});

const LoanModel = mongoose.model('Loan', loanSchema);

export default LoanModel;