import LoanModel from '../models/LoanModel.js';
import CreditAssessmentModel from '../models/CreditAssessmentModel.js';
import GuarantorModel from '../models/GuarantorModel.js';
import asyncHandler from 'express-async-handler';

// @desc    Disburse loan
// @route   POST /api/loans/:id/disburse
// @access  Private (admin)
const disburseLoan = asyncHandler(async (req, res) => {
  const loan = await LoanModel.findById(req.params.id)
    .populate('clientId', 'phone');

  if (!loan) {
    res.status(404);
    throw new Error('Loan not found');
  }

  if (loan.status !== 'approved') {
    res.status(400);
    throw new Error('Only approved loans can be disbursed');
  }

  // Ensure credit assessment exists
  const assessment = await CreditAssessmentModel.findOne({ loanId: loan._id });
  if (!assessment) {
    res.status(400);
    throw new Error('Credit assessment missing');
  }

  // Ensure at least one accepted external guarantor
  const guarantorCount = await GuarantorModel.countDocuments({
    loanId: loan._id,
    accepted: true,
    external: true,
  });

  if (guarantorCount < 1) {
    res.status(400);
    throw new Error('At least one accepted external guarantor required');
  }

  // TODO: Integrate M-Pesa B2C here
  // mpesaService.disburse(loan.clientId.phone, loan.principal_cents)

  loan.status = 'disbursed';
  loan.disbursedAt = new Date();
  await loan.save();

  res.json({
    message: 'Loan disbursed successfully',
    loan,
  });
});

export { disburseLoan };
