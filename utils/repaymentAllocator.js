import LedgerEntry from '../models/LedgerEntryModel.js';

/**
 * Returns allocation for a payment.
 * Complexity: O(1) DB aggregate, O(1) math
 */
export async function allocateRepaymentCents({ loan, amount_cents, session }) {
  const totalInterestDue = Math.max(loan.total_due_cents - loan.principal_cents, 0);

  const [agg] = await LedgerEntry.aggregate([
    {
      $match: {
        loanId: loan._id,
        status: 'completed',
        entryType: 'repayment',
        direction: 'CREDIT',
        account: { $in: ['interest_income', 'loans_receivable'] },
      },
    },
    {
      $group: {
        _id: null,
        interestPaid: {
          $sum: {
            $cond: [{ $eq: ['$account', 'interest_income'] }, '$amount_cents', 0],
          },
        },
        principalPaid: {
          $sum: {
            $cond: [{ $eq: ['$account', 'loans_receivable'] }, '$amount_cents', 0],
          },
        },
      },
    },
  ]).session(session);

  const interestPaid = agg?.interestPaid || 0;
  const principalPaid = agg?.principalPaid || 0;

  const interestRemaining = Math.max(totalInterestDue - interestPaid, 0);
  const principalRemaining = Math.max(loan.principal_cents - principalPaid, 0);
  const totalRemaining = interestRemaining + principalRemaining;

  const payInterest = Math.min(amount_cents, interestRemaining);
  const afterInterest = amount_cents - payInterest;

  const payPrincipal = Math.min(afterInterest, principalRemaining);
  const afterPrincipal = afterInterest - payPrincipal;

  const overpay = Math.max(afterPrincipal, 0);

  return {
    interest_cents: payInterest,
    principal_cents: payPrincipal,
    overpay_cents: overpay,
    totalRemaining_cents: totalRemaining,
  };
}
