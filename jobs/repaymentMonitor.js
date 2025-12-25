import Loan from '../models/LoanModel.js';
import RepaymentSchedule from '../models/RepaymentScheduleModel.js';

export async function repaymentMonitorJob() {
  const now = new Date();

  // 1. Mark overdue installments
  await RepaymentSchedule.updateMany(
    {
      status: 'pending',
      dueDate: { $lt: now },
      $expr: { $lt: ['$paid_cents', '$amount_due_cents'] },
    },
    { $set: { status: 'overdue' } }
  );

  // 2. Detect defaults
  const overdueRows = await RepaymentSchedule.find({
    status: 'overdue',
  }).populate('loanId');

  for (const row of overdueRows) {
    const loan = row.loanId;
    if (!loan || loan.status !== 'disbursed') continue;

    const graceDays = loan.product === 'fafa' ? 14 : 30;
    const overdueDays =
      (now.getTime() - row.dueDate.getTime()) / (1000 * 60 * 60 * 24);

    if (overdueDays >= graceDays) {
      loan.status = 'defaulted';
      await loan.save();
    }
  }
}
