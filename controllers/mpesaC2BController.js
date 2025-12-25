import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Loan from '../models/LoanModel.js';
import Transaction from '../models/TransactionModel.js';
import LedgerEntry from '../models/LedgerEntryModel.js';
import { applyLoanLedger } from '../utils/applyLoanLedger.js';
import { allocateRepaymentCents } from '../utils/repaymentAllocator.js';

/**
 * ============================
 * M-PESA C2B CALLBACK
 * ============================
 * Called by Safaricom after Paybill payment
 * DO NOT protect with auth middleware
 *
 * Assumptions (MVP):
 * - BillRefNumber = loanId (ObjectId string)
 * - Ledger accounts include:
 *   cash_mpesa, loans_receivable, interest_income, suspense_overpay
 */
export const mpesaC2BCallback = asyncHandler(async (req, res) => {
  const { TransID, MSISDN, TransAmount, BillRefNumber } = req.body;

  // Basic payload sanity
  if (!TransID || !TransAmount || !BillRefNumber) return res.sendStatus(200);

  // 0) Fast idempotency check to avoid DB session overhead
  const already = await Transaction.findOne({
    type: 'mpesa_c2b',
    mpesaReceipt: TransID,
  }).select('_id');

  if (already) return res.sendStatus(200);

  // 1) BillRefNumber must be a loanId
  if (!mongoose.Types.ObjectId.isValid(BillRefNumber)) return res.sendStatus(200);

  const loan = await Loan.findById(BillRefNumber);
  if (!loan) return res.sendStatus(200);

  const amount_cents = Math.round(Number(TransAmount) * 100);
  if (!Number.isFinite(amount_cents) || amount_cents <= 0) return res.sendStatus(200);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 2) Record transaction (unique index also protects idempotency)
    const txArr = await Transaction.create(
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

    const tx = txArr[0];

    // 3) Allocate repayment: interest first, principal next, overpay to suspense
    const alloc = await allocateRepaymentCents({ loan, amount_cents, session });

    // 4) Double-entry ledger:
    // DR cash_mpesa full amount
    // CR interest_income (portion)
    // CR loans_receivable (portion)
    // CR suspense_overpay (if any)
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

    await LedgerEntry.create(entries, { session });

    await session.commitTransaction();

    // 5) Recompute cached totals & status
    await applyLoanLedger(loan._id);
  } catch (err) {
    await session.abortTransaction();
    // If duplicate TransID raced, unique index may throw.
    // Safe to ignore and return 200 to stop Safaricom retries.
  } finally {
    session.endSession();
  }

  return res.sendStatus(200);
});
