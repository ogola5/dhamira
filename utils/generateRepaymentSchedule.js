import RepaymentSchedule from '../models/RepaymentScheduleModel.js';

/**
 * Generate repayment schedule AFTER disbursement
 * Idempotent: safe to call multiple times
 */
export async function generateRepaymentSchedule({ loan, session }) {
  // Prevent duplicate schedules
  const existing = await RepaymentSchedule.countDocuments(
    { loanId: loan._id },
    { session }
  );

  if (existing > 0) return;

  const schedules = [];
  const startDate = loan.disbursedAt;
  const term = loan.term;
  const installment = loan.expected_installment_cents;

  for (let i = 1; i <= term; i++) {
    const dueDate =
      loan.product === 'fafa'
        ? new Date(startDate.getTime() + i * 7 * 24 * 60 * 60 * 1000)
        : new Date(
            startDate.getFullYear(),
            startDate.getMonth() + i,
            startDate.getDate()
          );

    schedules.push({
      loanId: loan._id,
      installmentNo: i,
      dueDate,
      amount_due_cents: installment,
    });
  }

  await RepaymentSchedule.insertMany(schedules, { session });
}
