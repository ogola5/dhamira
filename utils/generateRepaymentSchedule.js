import RepaymentSchedule from '../models/RepaymentScheduleModel.js';

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function addMonths(d, n) {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}

/**
 * Generates schedule rows for a loan.
 * Complexity: O(term)
 */
export async function generateRepaymentScheduleForLoan(loan, { session } = {}) {
  if (!loan.disbursedAt) throw new Error('Loan must be disbursed to generate schedule');

  const isWeekly = loan.product === 'fafa';     // policy: FAFA weekly
  const periods = loan.term;

  const per = loan.expected_installment_cents || Math.floor(loan.total_due_cents / periods);

  const rows = [];
  for (let i = 1; i <= periods; i++) {
    const dueDate = isWeekly ? addDays(loan.disbursedAt, 7 * i) : addMonths(loan.disbursedAt, i);

    rows.push({
      loanId: loan._id,
      installmentNo: i,
      dueDate,
      amount_due_cents: per,
    });
  }

  // Upsert-safe approach: delete then insert (simple MVP), or bulkWrite upserts
  await RepaymentSchedule.deleteMany({ loanId: loan._id }).session(session || null);
  await RepaymentSchedule.insertMany(rows, { session });

  return rows;
}
