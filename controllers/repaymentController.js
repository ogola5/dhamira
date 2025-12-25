import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Loan from '../models/LoanModel.js';
import Transaction from '../models/TransactionModel.js';
import LedgerEntry from '../models/LedgerEntryModel.js';
import { applyLoanLedger } from '../utils/applyLoanLedger.js';

/**
 * ============================
 * M-PESA C2B CALLBACK (PUBLIC)
 * ============================
 */
export const mpesaC2BCallback = asyncHandler(async (req, res) => {
  const { TransID, MSISDN, TransAmount, BillRefNumber } = req.body;

  if (!TransID || !TransAmount || !BillRefNumber) {
    return res.sendStatus(200);
  }

  if (!mongoose.Types.ObjectId.isValid(BillRefNumber)) {
    return res.sendStatus(200);
  }

  const loan = await Loan.findById(BillRefNumber);
  if (!loan || loan.status !== 'disbursed') {
    return res.sendStatus(200);
  }

  const amount_cents = Math.round(Number(TransAmount) * 100);
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
    return res.sendStatus(200);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Idempotency enforced by unique index
    const tx = await Transaction.create(
      [
        {
          type: 'mpesa_c2b',
          direction: 'IN',
          amount_cents,
          status: 'success',
          mpesaReceipt: TransID,
          phone: MSISDN,
          loanId: loan._id,
          rawCallback: req.body,
        },
      ],
      { session }
    );

    const principalPayment = Math.min(amount_cents, loan.outstanding_cents);
    const overpay = amount_cents - principalPayment;

    const entries = [
      {
        account: 'cash_mpesa',
        direction: 'DEBIT',
        amount_cents,
        loanId: loan._id,
        transactionId: tx[0]._id,
        entryType: 'repayment',
        status: 'completed',
      },
      {
        account: 'loans_receivable',
        direction: 'CREDIT',
        amount_cents: principalPayment,
        loanId: loan._id,
        transactionId: tx[0]._id,
        entryType: 'repayment',
        status: 'completed',
      },
    ];

    if (overpay > 0) {
      entries.push({
        account: 'suspense_overpay',
        direction: 'CREDIT',
        amount_cents: overpay,
        loanId: loan._id,
        transactionId: tx[0]._id,
        entryType: 'repayment',
        status: 'completed',
      });
    }

    await LedgerEntry.create(entries, { session });

    await session.commitTransaction();
    await applyLoanLedger(loan._id);
  } catch (err) {
    await session.abortTransaction();
  } finally {
    session.endSession();
  }

  return res.sendStatus(200);
});

/**
 * ============================
 * GET REPAYMENT HISTORY
 * ============================
 */
export const getRepaymentHistory = asyncHandler(async (req, res) => {
  const { loanId } = req.params;

  const loan = await Loan.findById(loanId);
  if (!loan) {
    res.status(404);
    throw new Error('Loan not found');
  }

  // Scope enforcement
  if (
    req.user.role === 'loan_officer' &&
    String(loan.initiatedBy) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error('Access denied');
  }

  const repayments = await Transaction.find({
    loanId,
    type: 'mpesa_c2b',
    status: 'success',
  }).sort({ createdAt: -1 });

  res.json({
    loanId,
    total_paid_cents: loan.total_paid_cents,
    outstanding_cents: loan.outstanding_cents,
    repayments,
  });
});
