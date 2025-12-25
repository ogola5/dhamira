import asyncHandler from 'express-async-handler';
import Loan from '../models/LoanModel.js';
import Transaction from '../models/TransactionModel.js';
import LedgerEntry from '../models/LedgerEntryModel.js';
import { applyLoanLedger } from '../utils/applyLoanLedger.js';

/**
 * ============================
 * M-PESA C2B CALLBACK
 * ============================
 * This endpoint is called by Safaricom
 * DO NOT protect with auth middleware
 */
export const mpesaC2BCallback = asyncHandler(async (req, res) => {
  const {
    TransID,
    MSISDN,
    TransAmount,
    BillRefNumber,
  } = req.body;

  // BillRefNumber MUST be loanId
  const loan = await Loan.findById(BillRefNumber);
  if (!loan) {
    // Future: route to suspense account
    return res.sendStatus(200);
  }

  // Idempotency check
  const exists = await Transaction.findOne({ mpesaReceipt: TransID });
  if (exists) return res.sendStatus(200);

  const amount_cents = Math.round(Number(TransAmount) * 100);

  // Record transaction
  const tx = await Transaction.create({
    type: 'mpesa_c2b',
    direction: 'IN',
    amount_cents,
    status: 'success',
    mpesaReceipt: TransID,
    phone: MSISDN,
    loanId: loan._id,
  });

  // Ledger entries (double-entry)
  await LedgerEntry.create([
    {
      account: 'cash_mpesa',
      direction: 'DEBIT',
      amount_cents,
      loanId: loan._id,
      transactionId: tx._id,
      entryType: 'repayment',
      status: 'completed',
    },
    {
      account: 'loans_receivable',
      direction: 'CREDIT',
      amount_cents,
      loanId: loan._id,
      transactionId: tx._id,
      entryType: 'repayment',
      status: 'completed',
    },
  ]);

  // Recalculate loan state
  await applyLoanLedger(loan._id);

  res.sendStatus(200);
});

/**
 * ============================
 * GET REPAYMENT HISTORY
 * ============================
 * Used by frontend dashboards
 */
export const getRepaymentHistory = asyncHandler(async (req, res) => {
  const { loanId } = req.params;

  const loan = await Loan.findById(loanId);
  if (!loan) {
    res.status(404);
    throw new Error('Loan not found');
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
