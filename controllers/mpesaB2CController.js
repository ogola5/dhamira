import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Loan from '../models/LoanModel.js';
import Transaction from '../models/TransactionModel.js';
import LedgerEntry from '../models/LedgerEntryModel.js';

import { applyLoanLedger } from '../utils/applyLoanLedger.js';
import { generateRepaymentSchedule } from '../utils/generateRepaymentSchedule.js';

/**
 * ============================
 * M-PESA B2C RESULT CALLBACK
 * ============================
 * Called asynchronously by Safaricom
 * DO NOT protect with auth middleware
 */
export const mpesaB2CResultCallback = asyncHandler(async (req, res) => {
  const result = req.body?.Result;
  if (!result) return res.sendStatus(200);

  const { ResultCode, OriginatorConversationID, TransactionID } = result;
  if (!OriginatorConversationID) return res.sendStatus(200);

  // 1. Find pending B2C transaction
  const tx = await Transaction.findOne({
    type: 'mpesa_b2c',
    checkoutRequestId: OriginatorConversationID,
  });

  if (!tx) return res.sendStatus(200);

  // 2. Idempotency: already finalized
  if (['success', 'failed'].includes(tx.status)) {
    return res.sendStatus(200);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    tx.rawCallback = req.body;

    // ❌ FAILED DISBURSEMENT
    if (Number(ResultCode) !== 0) {
      tx.status = 'failed';
      await tx.save({ session });

      await session.commitTransaction();
      return res.sendStatus(200);
    }

    // ✅ SUCCESSFUL DISBURSEMENT
    tx.status = 'success';
    if (TransactionID) tx.mpesaReceipt = TransactionID;
    await tx.save({ session });

    const loan = await Loan.findById(tx.loanId).session(session);
    if (!loan) throw new Error('Loan not found');

    // Prevent duplicate ledger posting
    const alreadyPosted = await LedgerEntry.findOne({
      transactionId: tx._id,
      entryType: 'disbursement',
      status: 'completed',
    }).session(session);

    if (!alreadyPosted) {
      const amount_cents = tx.amount_cents;

      // Double-entry ledger
      await LedgerEntry.insertMany(
        [
          {
            account: 'loans_receivable',
            direction: 'DEBIT',
            amount_cents,
            loanId: loan._id,
            transactionId: tx._id,
            entryType: 'disbursement',
            status: 'completed',
          },
          {
            account: 'cash_mpesa',
            direction: 'CREDIT',
            amount_cents,
            loanId: loan._id,
            transactionId: tx._id,
            entryType: 'disbursement',
            status: 'completed',
          },
        ],
        { session, ordered: true }
      );

      // Loan lifecycle update
      loan.status = 'disbursed';
      loan.disbursedAt = loan.disbursedAt || new Date();
      loan.disbursementTransactionId = tx._id;
      loan.disbursedBy = tx.initiatedBy;

      await loan.save({ session });

      // 🔥 GENERATE REPAYMENT SCHEDULE (ONCE)
      await generateRepaymentSchedule({ loan, session });
    }

    await session.commitTransaction();

    // Recompute cached totals
    await applyLoanLedger(tx.loanId);

  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  return res.sendStatus(200);
});
