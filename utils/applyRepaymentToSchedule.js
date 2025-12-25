import RepaymentSchedule from '../models/RepaymentScheduleModel.js';

export async function applyRepaymentToSchedule({ loanId, amount_cents, session }) {
  let remaining = amount_cents;

  const schedules = await RepaymentSchedule.find({
    loanId,
    status: { $in: ['pending', 'overdue'] },
  })
    .sort({ installmentNo: 1 })
    .session(session);

  for (const row of schedules) {
    if (remaining <= 0) break;

    const dueLeft = row.amount_due_cents - row.paid_cents;
    if (dueLeft <= 0) continue;

    const applied = Math.min(dueLeft, remaining);

    row.paid_cents += applied;
    remaining -= applied;

    if (row.paid_cents >= row.amount_due_cents) {
      row.status = 'paid';
      row.paidAt = new Date();
    }

    await row.save({ session });
  }

  return remaining; // overpayment if > 0
}
