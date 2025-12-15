// controllers/repaymentController.js
import mongoose from 'mongoose';
import RepaymentModel from '../models/RepaymentModel.js';
import LoanModel from '../models/LoanModel.js';
import asyncHandler from 'express-async-handler';

// @desc    Record a repayment
// @route   POST /api/repayments
// @access  Private (loan_officer or admins)
const recordRepayment = asyncHandler(async (req, res) => {
  const { loanId, amount, paymentMethod, transactionId, notes } = req.body;

  if (!loanId || amount === undefined) {
    res.status(400);
    throw new Error('Loan ID and amount are required');
  }

  const amountCents = Math.round(Number(amount) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    res.status(400);
    throw new Error('Invalid repayment amount');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const loan = await LoanModel.findById(loanId).session(session);
    if (!loan || loan.status !== 'disbursed') {
      res.status(400);
      throw new Error('Invalid or non-disbursed loan');
    }

    if (amountCents > loan.outstanding_cents) {
      res.status(400);
      throw new Error('Repayment exceeds outstanding balance');
    }

    if (paymentMethod === 'mpesa' && transactionId) {
      const exists = await RepaymentModel.findOne({ transactionId }).session(session);
      if (exists) {
        res.status(409);
        throw new Error('Duplicate M-Pesa transaction');
      }
    }

    const [repayment] = await RepaymentModel.create(
      [{
        loanId,
        amount_cents: amountCents,
        paymentMethod,
        transactionId,
        notes,
        paidBy: req.user._id,
      }],
      { session }
    );

    loan.total_paid_cents += amountCents;
    loan.outstanding_cents -= amountCents;

    if (loan.outstanding_cents === 0) {
      loan.status = 'repaid';
    } else if (loan.dueDate && new Date() > loan.dueDate) {
      loan.status = 'defaulted';
    }

    await loan.save({ session });

    await session.commitTransaction();
    res.status(201).json({ message: 'Repayment recorded', repayment, loan });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
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
