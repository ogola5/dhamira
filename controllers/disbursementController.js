import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Loan from '../models/LoanModel.js';
import Transaction from '../models/TransactionModel.js';

/**
 * ============================
 * INITIATE M-PESA B2C DISBURSEMENT
 * ============================
 * - Idempotent
 * - No ledger posting here
 * - Actual ledger posted on B2C RESULT callback
 */
export const disburseLoan = asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id);
  if (!loan) {
    res.status(404);
    throw new Error('Loan not found');
  }

  if (loan.status !== 'approved') {
    res.status(400);
    throw new Error('Loan must be approved before disbursement');
  }

  if (loan.disbursementTransactionId) {
    res.status(400);
    throw new Error('Disbursement already initiated');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const tx = await Transaction.insertMany(
      [
        {
          type: 'mpesa_b2c',
          direction: 'OUT',
          amount_cents: loan.principal_cents,
          status: 'pending',
          loanId: loan._id,
          initiatedBy: req.user._id,
        },
      ],
      { session, ordered: true }
    );

    loan.status = 'disbursement_pending';
    loan.disbursementTransactionId = tx[0]._id;
    await loan.save({ session });

    await session.commitTransaction();

    /**
     * 🔥 IMPORTANT:
     * Call B2CService.disburseLoan() HERE (async, non-blocking)
     * Pass tx[0]._id as reference
     */

    res.json({
      message: 'Disbursement initiated',
      loanId: loan._id,
      transactionId: tx[0]._id,
    });
  } catch (err) {
    await session.abortTransaction();
    throw err;
  } finally {
    session.endSession();
  }
});
