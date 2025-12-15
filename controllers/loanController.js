// controllers/loanController.js
import LoanModel from '../models/LoanModel.js';
import GroupModel from '../models/GroupModel.js';
import ClientModel from '../models/ClientModel.js';
import CreditAssessmentModel from '../models/CreditAssessmentModel.js';
import GuarantorModel from '../models/GuarantorModel.js';
import asyncHandler from 'express-async-handler';

// @desc    Initiate a loan request
// @route   POST /api/loans/initiate
// @access  Private (initiator_admin or loan_officer)
const initiateLoan = asyncHandler(async (req, res) => {
  const { clientNationalId, type, amount, term } = req.body;

  if (!clientNationalId || !type || !amount || !term) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  const client = await ClientModel.findOne({ nationalId: clientNationalId });
  if (!client) {
    res.status(400);
    throw new Error('Client not found');
  }

  // 20% savings rule
  const principalCents = Math.round(Number(amount) * 100);
  if (client.savings_balance_cents < principalCents * 0.2) {
    res.status(400);
    throw new Error('Client must have at least 20% of loan amount as savings');
  }

  // Must have repaid at least one previous loan
  const hasRepaidLoan = await LoanModel.exists({
    clientId: client._id,
    status: 'repaid',
  });
  if (!hasRepaidLoan) {
    res.status(400);
    throw new Error('Client must have successfully repaid a previous loan');
  }

  const group = await GroupModel.findById(client.groupId);
  if (!group || group.signatories.length !== 3) {
    res.status(400);
    throw new Error('Group must be fully set up with signatories');
  }

  const loan = await LoanModel.create({
    clientId: client._id,
    groupId: client.groupId,
    type,
    term,
    principal_cents: principalCents,
    initiatedBy: req.user._id,
  });

  res.status(201).json({ message: 'Loan initiated', loan });
});

// @desc    Approve a loan
// @route   PUT /api/loans/:id/approve
// @access  Private (approver_admin)
const approveLoan = asyncHandler(async (req, res) => {
  const loan = await LoanModel.findById(req.params.id);
  if (!loan) {
    res.status(404);
    throw new Error('Loan not found');
  }

  if (loan.status !== 'initiated') {
    res.status(400);
    throw new Error('Loan not in initiated state');
  }

  if (loan.initiatedBy.toString() === req.user._id.toString()) {
    res.status(403);
    throw new Error('Cannot approve your own initiated loan');
  }

  // Credit assessment must exist
  const assessment = await CreditAssessmentModel.findOne({ loanId: loan._id });
  if (!assessment) {
    res.status(400);
    throw new Error('Credit assessment is required before approval');
  }

  // At least one accepted external guarantor
  const guarantorCount = await GuarantorModel.countDocuments({
    loanId: loan._id,
    accepted: true,
    external: true,
  });

  if (guarantorCount < 1) {
    res.status(400);
    throw new Error('At least one external guarantor is required');
  }

  if (!loan.approvedBy.includes(req.user._id)) {
    loan.approvedBy.push(req.user._id);
  }

  loan.status = 'approved';
  loan.approvedAt = new Date();
  await loan.save();

  res.json({ message: 'Loan approved', loan });
});

// @desc    Get all loans
// @route   GET /api/loans
// @access  Private
const getLoans = asyncHandler(async (req, res) => {
  const loans = await LoanModel.find({})
    .populate('clientId', 'name nationalId phone')
    .populate('groupId', 'name')
    .populate('initiatedBy', 'username role')
    .populate('approvedBy', 'username role');

  res.json(loans);
});

export { initiateLoan, approveLoan, getLoans };
