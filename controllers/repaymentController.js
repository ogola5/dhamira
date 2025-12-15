// controllers/repaymentController.js
import RepaymentModel from '../models/RepaymentModel.js';
import LoanModel from '../models/LoanModel.js';
import asyncHandler from 'express-async-handler';

// @desc    Record a repayment
// @route   POST /api/repayments
// @access  Private (loan_officer or admins)
const recordRepayment = asyncHandler(async (req, res) => {
  const { loanId, amount, paymentMethod, transactionId, notes } = req.body;

  if (!loanId || !amount) {
    res.status(400);
    throw new Error('Loan ID and amount are required');
  }

  const loan = await LoanModel.findById(loanId);
  if (!loan || loan.status !== 'disbursed') {
    res.status(400);
    throw new Error('Invalid or non-disbursed loan');
  }

  const repayment = await RepaymentModel.create({
    loanId,
    amount,
    paymentMethod,
    transactionId,
    notes,
    paidBy: req.user._id,
  });

  // TODO: Integrate M-Pesa confirmation if paymentMethod = 'mpesa'

  res.status(201).json({ message: 'Repayment recorded', repayment });
});

// @desc    Get repayment history for a loan
// @route   GET /api/repayments/loan/:loanId
// @access  Private
const getRepaymentHistory = asyncHandler(async (req, res) => {
  const repayments = await RepaymentModel.find({ loanId: req.params.loanId })
    .sort({ createdAt: -1 })
    .populate('paidBy', 'username role');
  res.json(repayments);
});

export { recordRepayment, getRepaymentHistory };