import LedgerEntry from '../models/LedgerEntryModel.js';
import Loan from '../models/LoanModel.js';

export async function applyLoanLedger(loanId) {
  const loan = await Loan.findById(loanId);
  if (!loan) throw new Error('Loan not found');

  const entries = await LedgerEntry.find({
    loanId,
    status: 'completed',
    direction: 'CREDIT',
    account: { $in: ['loans_receivable', 'interest_income'] },
    entryType: 'repayment',
  }).select('amount_cents account');

  let principalPaid = 0;
  let interestPaid = 0;

  for (const e of entries) {
    if (e.account === 'loans_receivable') principalPaid += e.amount_cents;
    if (e.account === 'interest_income') interestPaid += e.amount_cents;
  }

  const totalPaid = principalPaid + interestPaid;
  const outstanding = Math.max(loan.total_due_cents - totalPaid, 0);

  loan.total_paid_cents = totalPaid;
  loan.outstanding_cents = outstanding;

  if (loan.disbursedAt && outstanding === 0) {
    loan.status = 'repaid';
  } else if (loan.disbursedAt && loan.status !== 'defaulted') {
    loan.status = 'disbursed';
  }

  await loan.save();
  return loan;
}
