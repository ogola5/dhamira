import Loan from '../models/LoanModel.js';

/**
 * periodsElapsed:
 * - FAFA weekly: floor((now - disbursedAt)/7d) + 1
 * - business monthly: floor((now - disbursedAt)/30d) + 1 (MVP)
 */
function periodsElapsed(loan, now) {
  if (!loan.disbursedAt) return 0;
  const ms = now.getTime() - new Date(loan.disbursedAt).getTime();
  if (ms <= 0) return 0;

  const periodMs = loan.product === 'fafa'
    ? 7 * 24 * 60 * 60 * 1000
    : 30 * 24 * 60 * 60 * 1000;

  return Math.min(loan.term, Math.floor(ms / periodMs) + 1);
}

/**
 * Marks loans defaulted when behind schedule beyond grace.
 * Complexity: O(N) for matched loans.
 */
export async function markDefaults({ gracePeriods = 2 } = {}) {
  const now = new Date();

  const loans = await Loan.find({
    status: { $in: ['disbursed'] },
    disbursedAt: { $ne: null },
    outstanding_cents: { $gt: 0 },
  });

  let updated = 0;

  for (const loan of loans) {
    const elapsed = periodsElapsed(loan, now);
    if (elapsed <= 0) continue;

    const expectedPaidByNow = Math.min(
      loan.total_due_cents,
      elapsed * (loan.expected_installment_cents || 0)
    );

    const behind = expectedPaidByNow - (loan.total_paid_cents || 0);

    const allowedBehind = gracePeriods * (loan.expected_installment_cents || 0);

    if (behind > allowedBehind && loan.status !== 'defaulted') {
      loan.status = 'defaulted';
      await loan.save();
      updated++;
    }
  }

  return { updated };
}
