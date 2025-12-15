import CreditAssessmentModel from '../models/CreditAssessmentModel.js';
import LoanModel from '../models/LoanModel.js';
import asyncHandler from 'express-async-handler';

const MIN_SCORE = 18;

// @desc    Submit credit assessment (5 C’s)
// @route   POST /api/credit-assessments
// @access  Private (loan_officer)
const submitCreditAssessment = asyncHandler(async (req, res) => {
  const {
    loanId,
    character,
    capacity,
    capital,
    collateral,
    conditions,
    officerNotes,
  } = req.body;

  if (
    !loanId ||
    character == null ||
    capacity == null ||
    capital == null ||
    collateral == null ||
    conditions == null
  ) {
    res.status(400);
    throw new Error('All credit assessment fields are required');
  }

  const loan = await LoanModel.findById(loanId);
  if (!loan || loan.status !== 'initiated') {
    res.status(400);
    throw new Error('Credit assessment only allowed for initiated loans');
  }

  const score =
    character + capacity + capital + collateral + conditions;

  if (score < MIN_SCORE) {
    res.status(400);
    throw new Error(
      `Credit score ${score} below minimum threshold (${MIN_SCORE})`
    );
  }

  const assessment = await CreditAssessmentModel.create({
    loanId,
    character,
    capacity,
    capital,
    collateral,
    conditions,
    officerNotes,
    assessedBy: req.user._id,
  });

  res.status(201).json({
    message: 'Credit assessment approved',
    score,
    assessment,
  });
});

export { submitCreditAssessment };
