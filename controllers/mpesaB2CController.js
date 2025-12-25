import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Loan from '../models/LoanModel.js';
import Transaction from '../models/TransactionModel.js';
import LedgerEntry from '../models/LedgerEntryModel.js';
import { applyLoanLedger } from '../utils/applyLoanLedger.js';

/**
 * ============================
 * M-PESA B2C RESULT CALLBACK
 * ============================
 * Called by Safaricom after disbursement attempt
 * DO NOT protect with auth middleware
 *
 * Expects payload:
 * {
 *   Result: {
 *     ResultCode: 0|...,
 *     OriginatorConversationID: "...",
 *     TransactionID: "..." // present on success
 *     ...
 *   }
 * }
 */
export const mpesaB2CResultCallback = asyncHandler(async (req, res) => {
  const result = req.body?.Result;
  if (!result) return res.sendStatus(200);

  const { ResultCode, OriginatorConversationID, TransactionID } = result;

  if (!OriginatorConversationID) return res.sendStatus(200);

  // 1) Find transaction created during initiation
  const tx = await Transaction.findOne({
    type: 'mpesa_b2c',
    checkoutRequestId: OriginatorConversationID,
  });

  if (!tx) return res.sendStatus(200);

  // 2) Idempotency: if already finalized, ignore
  if (tx.status === 'success' || tx.status === 'failed') {
    return res.sendStatus(200);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Always store callback for audit
    tx.rawCallback = req.body;

    if (Number(ResultCode) !== 0) {
      // ❌ Disbursement failed
      tx.status = 'failed';
      await tx.save({ session });

      await session.commitTransaction();
      return res.sendStatus(200);
    }

    // ✅ Disbursement success
    tx.status = 'success';

    // Store actual M-Pesa TransactionID for reconciliation (important)
    if (TransactionID) {
      tx.mpesaReceipt = TransactionID;
    }

    await tx.save({ session });

    const loan = await Loan.findById(tx.loanId).session(session);
    if (!loan) throw new Error('Loan not found');

    // 3) Prevent duplicate disbursement ledger posting
    const existingLedger = await LedgerEntry.findOne({
      transactionId: tx._id,
      entryType: 'disbursement',
      status: 'completed',
    }).session(session);

    if (!existingLedger) {
      const amount_cents = tx.amount_cents;

      // 4) Double-entry ledger for disbursement:
      // DR loans_receivable, CR cash_mpesa
      await LedgerEntry.create(
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
        { session }
      );

      // 5) Update loan lifecycle (cached fields)
      if (!loan.disbursedAt) {
        loan.disbursedAt = new Date();
      }
      loan.disbursementTransactionId = tx._id;
      loan.status = 'disbursed';
      loan.disbursedBy = tx.initiatedBy;

      await loan.save({ session });
    }

    await session.commitTransaction();

    // 6) Recompute cached totals from ledger
    await applyLoanLedger(tx.loanId);
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }

  return res.sendStatus(200);
});
