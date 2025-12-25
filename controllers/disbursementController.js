import asyncHandler from 'express-async-handler';
import Loan from '../models/LoanModel.js';
import Transaction from '../models/TransactionModel.js';
import LedgerEntry from '../models/LedgerEntryModel.js';

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

  // Create transaction (B2C OUT)
  const tx = await Transaction.create({
    type: 'mpesa_b2c',
    direction: 'OUT',
    amount_cents: loan.principal_cents,
    status: 'pending',
    loanId: loan._id,
    initiatedBy: req.user._id,
  });

  // Ledger entries (PENDING)
  await LedgerEntry.create([
    {
      account: 'loans_receivable',
      direction: 'DEBIT',
      amount_cents: loan.principal_cents,
      loanId: loan._id,
      transactionId: tx._id,
      entryType: 'disbursement',
    },
    {
      account: 'cash_mpesa',
      direction: 'CREDIT',
      amount_cents: loan.principal_cents,
      loanId: loan._id,
      transactionId: tx._id,
      entryType: 'disbursement',
    },
  ]);

  loan.status = 'disbursement_pending';
  loan.disbursementTransactionId = tx._id;
  await loan.save();

  /**
   * HERE:
   * call Safaricom B2C API (async)
   * pass tx._id as reference
   */

  res.json({
    message: 'Disbursement initiated (B2C pending)',
    loanId: loan._id,
    transactionId: tx._id,
  });
});
