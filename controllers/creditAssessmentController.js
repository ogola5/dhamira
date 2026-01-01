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

  // Prevent duplicate assessments for the same loan
  const existing = await CreditAssessmentModel.findOne({ loanId });
  if (existing) {
    res.status(409);
    throw new Error('Credit assessment already exists for this loan');
  }

  let assessment;
  try {
    assessment = await CreditAssessmentModel.create({
      loanId,
      character,
      capacity,
      capital,
      collateral,
      conditions,
      officerNotes,
      assessedBy: req.user._id,
    });
  } catch (err) {
    // Handle rare race condition where another process created the assessment
    if (err && err.code === 11000) {
      res.status(409);
      throw new Error('Credit assessment already exists for this loan');
    }
    throw err;
  }

  res.status(201).json({
    message: 'Credit assessment approved',
    score,
    assessment,
  });
});
// Quick admin assessment: creates a full-score assessment for a loan
const submitQuickAssessment = asyncHandler(async (req, res) => {
  const { loanId, officerNotes } = req.body;

  if (!loanId) {
    res.status(400);
    throw new Error('loanId is required');
  }

  // only allow admins to quick-create assessments
  if (!['approver_admin', 'super_admin', 'initiator_admin'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Access denied');
  }

  const loan = await LoanModel.findById(loanId);
  if (!loan || loan.status !== 'initiated') {
    res.status(400);
    throw new Error('Credit assessment only allowed for initiated loans');
  }

  // Create max-score assessment (5 in each pillar)
  const assessment = await CreditAssessmentModel.create({
    loanId,
    character: 5,
    capacity: 5,
    capital: 5,
    collateral: 5,
    conditions: 5,
    officerNotes: officerNotes || 'Quick admin assessment',
    assessedBy: req.user._id,
  });

  // Prevent duplicate quick assessments
  // (if a document already exists this will throw duplicate-key and be handled by global error handler)

  res.status(201).json({ message: 'Quick credit assessment created', assessment });
});



// GET /api/credit-assessments/:loanId
// Access: loan_officer + admins
const getAssessmentByLoan = asyncHandler(async (req, res) => {
  const { loanId } = req.params;

  const assessment = await CreditAssessmentModel.findOne({ loanId })
    .populate('assessedBy', 'username role')
    .populate('loanId');

  if (!assessment) {
    res.status(404);
    throw new Error('Credit assessment not found');
  }

  res.json({ assessment });
});

// GET /api/credit-assessments/mine
// Access: any authenticated user (returns assessments created by requester)
const listMyAssessments = asyncHandler(async (req, res) => {
  const assessments = await CreditAssessmentModel.find({ assessedBy: req.user._id })
    .sort({ createdAt: -1 })
    .populate('loanId', '_id status');

  res.json({ data: assessments });
});

export { submitCreditAssessment, submitQuickAssessment, getAssessmentByLoan, listMyAssessments };
