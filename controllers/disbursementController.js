import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Loan from '../models/LoanModel.js';
import Transaction from '../models/TransactionModel.js';
import Client from '../models/ClientModel.js';
import { DarajaClient } from '../mpesa/darajaClient.js';
import { B2CService } from '../mpesa/b2cService.js';

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

  // Only admins can disburse loans (Checker)
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only admins can disburse loans');
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

    // Trigger M-Pesa B2C (non-blocking). Create client and daraja instances from env.
    (async () => {
      try {
        const client = await Client.findById(loan.clientId).select('phone');
        const daraja = new DarajaClient({
          consumerKey: process.env.MPESA_CONSUMER_KEY || '',
          consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
          baseUrl: process.env.MPESA_BASE_URL || 'https://api.safaricom.co.ke',
        });

        const b2c = new B2CService({
          darajaClient: daraja,
          config: {
            initiatorName: process.env.MPESA_B2C_INITIATOR_NAME || '',
            securityCredential: process.env.MPESA_B2C_SECURITY_CREDENTIAL || '',
            shortcode: process.env.MPESA_B2C_SHORTCODE || '',
            timeoutUrl: process.env.MPESA_B2C_TIMEOUT_URL || `${process.env.BASE_URL || ''}/api/mpesa/b2c/result`,
            resultUrl: process.env.MPESA_B2C_RESULT_URL || `${process.env.BASE_URL || ''}/api/mpesa/b2c/result`,
          },
        });

        await b2c.disburseLoan({
          loanId: loan._id,
          phone: client?.phone || req.body.phone || '',
          amount_cents: loan.principal_cents,
          initiatedBy: req.user._id,
        });
      } catch (e) {
        // Log and continue - final state will be handled by callback
        console.error('B2C disbursement failed to start:', e.message || e);
      }
    })();

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
