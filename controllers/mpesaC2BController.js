import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Loan from '../models/LoanModel.js';
import Transaction from '../models/TransactionModel.js';
import LedgerEntry from '../models/LedgerEntryModel.js';

import { applyLoanLedger } from '../utils/applyLoanLedger.js';
import { allocateRepaymentCents } from '../utils/repaymentAllocator.js';
import { applyRepaymentToSchedule } from '../utils/applyRepaymentToSchedule.js';

/**
 * ============================
 * M-PESA C2B CALLBACK
 * ============================
 * Paybill confirmation endpoint
 * DO NOT protect with auth middleware
 */
export const mpesaC2BCallback = asyncHandler(async (req, res) => {
  const { TransID, MSISDN, TransAmount, BillRefNumber } = req.body;

  // Minimal payload sanity
  if (!TransID || !TransAmount || !BillRefNumber) return res.sendStatus(200);

  // Fast idempotency
  const exists = await Transaction.findOne({
    type: 'mpesa_c2b',
    mpesaReceipt: TransID,
  }).select('_id');

  if (exists) return res.sendStatus(200);

  // BillRefNumber must be loanId
  if (!mongoose.Types.ObjectId.isValid(BillRefNumber)) return res.sendStatus(200);

  const loan = await Loan.findById(BillRefNumber);
  if (!loan) return res.sendStatus(200);

  const amount_cents = Math.round(Number(TransAmount) * 100);
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) return res.sendStatus(200);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Record transaction
    const [tx] = await Transaction.insertMany(
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
      { session, ordered: true }
    );

    // 2. Allocate repayment
    const alloc = await allocateRepaymentCents({ loan, amount_cents, session });

    // 3. Ledger entries
    const entries = [
      {
        account: 'cash_mpesa',
        direction: 'DEBIT',
        amount_cents,
        loanId: loan._id,
        transactionId: tx._id,
        entryType: 'repayment',
        status: 'completed',
      },
    ];

    if (alloc.interest_cents > 0) {
      entries.push({
        account: 'interest_income',
        direction: 'CREDIT',
        amount_cents: alloc.interest_cents,
        loanId: loan._id,
        transactionId: tx._id,
        entryType: 'repayment',
        status: 'completed',
      });
    }

    if (alloc.principal_cents > 0) {
      entries.push({
        account: 'loans_receivable',
        direction: 'CREDIT',
        amount_cents: alloc.principal_cents,
        loanId: loan._id,
        transactionId: tx._id,
        entryType: 'repayment',
        status: 'completed',
      });
    }

    if (alloc.overpay_cents > 0) {
      entries.push({
        account: 'suspense_overpay',
        direction: 'CREDIT',
        amount_cents: alloc.overpay_cents,
        loanId: loan._id,
        transactionId: tx._id,
        entryType: 'repayment',
        status: 'completed',
      });
    }

    await LedgerEntry.insertMany(entries, { session, ordered: true });

    // 🔥 APPLY TO REPAYMENT SCHEDULE (PRINCIPAL + INTEREST)
    await applyRepaymentToSchedule({
      loanId: loan._id,
      amount_cents: alloc.principal_cents + alloc.interest_cents,
      session,
    });

    await session.commitTransaction();

    // Update cached totals & loan status
    await applyLoanLedger(loan._id);

  } catch (err) {
    await session.abortTransaction();
    // Duplicate TransID or race → safe to ignore
  } finally {
    session.endSession();
  }

  return res.sendStatus(200);
});
