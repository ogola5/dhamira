import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Loan from '../models/LoanModel.js';
import Client from '../models/ClientModel.js';
import Group from '../models/GroupModel.js';
import Guarantor from '../models/GuarantorModel.js';
import CreditAssessment from '../models/CreditAssessmentModel.js';

/* -----------------------------
   Helpers
----------------------------- */
function mustBeOneOf(role, allowed) {
  return allowed.includes(role);
}

async function computeCycleForClient(clientId, product) {
  const repaidCount = await Loan.countDocuments({
    clientId,
    product,
    status: 'repaid',
  });

  const next = repaidCount + 1;
  if (product === 'fafa') return Math.min(next, 3);
  if (product === 'business') return Math.min(next, 4);
  return next;
}

/* =============================
   INITIATE LOAN
============================= */
export const initiateLoan = asyncHandler(async (req, res) => {
  const { clientNationalId, product, amountKES, term, cycle } = req.body;

  if (!clientNationalId || !product || !amountKES || !term) {
    res.status(400);
    throw new Error('clientNationalId, product, amountKES, term are required');
  }

  if (!mustBeOneOf(req.user.role, ['initiator_admin', 'loan_officer', 'super_admin'])) {
    res.status(403);
    throw new Error('Access denied');
  }

  const client = await Client.findOne({ nationalId: String(clientNationalId).trim() });
  if (!client) {
    res.status(404);
    throw new Error('Client not found');
  }

  if (client.status !== 'active') {
    res.status(400);
    throw new Error('Client must be active to receive a loan');
  }

  // One active loan rule
  const existing = await Loan.findOne({
    clientId: client._id,
    status: { $in: ['initiated', 'approved', 'disbursement_pending', 'disbursed'] },
  });

  if (existing) {
    res.status(400);
    throw new Error('Client already has an active loan');
  }

  const group = await Group.findById(client.groupId).populate('members');
  if (!group || group.status !== 'active') {
    res.status(400);
    throw new Error('Client group must be active');
  }

  if (!Array.isArray(group.signatories) || group.signatories.length !== 3) {
    res.status(400);
    throw new Error('Group must have exactly 3 signatories');
  }

  const memberCount = Array.isArray(group.members) ? group.members.length : 0;
  if (product === 'fafa' && memberCount < 5) {
    res.status(400);
    throw new Error('FAFA requires group of 5+ members');
  }
  if (product === 'business' && memberCount < 7) {
    res.status(400);
    throw new Error('Business loan requires group of 7+ members');
  }

  const principal_cents = Math.round(Number(amountKES) * 100);
  if (!Number.isFinite(principal_cents) || principal_cents <= 0) {
    res.status(400);
    throw new Error('Invalid amountKES');
  }

  if (client.savings_balance_cents < Math.round(principal_cents * 0.2)) {
    res.status(400);
    throw new Error('Client must have at least 20% savings');
  }

  const computedCycle = cycle
    ? Number(cycle)
    : await computeCycleForClient(client._id, product);

  const loan = await Loan.create({
    clientId: client._id,
    groupId: client.groupId,
    branchId: group.branchId,
    product,
    term: Number(term),
    cycle: Number(computedCycle),
    principal_cents,
    initiatedBy: req.user._id,
  });

  res.status(201).json({
    message: 'Loan initiated',
    loan,
    application_fee_cents: loan.application_fee_cents,
  });
});

/* =============================
   APPROVE LOAN
============================= */
export const approveLoan = asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id);
  if (!loan) {
    res.status(404);
    throw new Error('Loan not found');
  }

  if (!mustBeOneOf(req.user.role, ['approver_admin', 'super_admin'])) {
    res.status(403);
    throw new Error('Access denied');
  }

  if (loan.status !== 'initiated') {
    res.status(400);
    throw new Error('Loan must be in initiated state');
  }

  if (
    String(loan.initiatedBy) === String(req.user._id) &&
    req.user.role !== 'super_admin'
  ) {
    res.status(403);
    throw new Error('Cannot approve your own initiated loan');
  }

  if (!loan.applicationFeePaid) {
    res.status(400);
    throw new Error('Application fee must be paid');
  }

  const assessment = await CreditAssessment.findOne({ loanId: loan._id });
  if (!assessment) {
    res.status(400);
    throw new Error('Credit assessment required');
  }

  const acceptedExternal = await Guarantor.countDocuments({
    loanId: loan._id,
    accepted: true,
    external: true,
    'eligibility.hasRepaidFafaBefore': true,
  });

  if (acceptedExternal < 1) {
    res.status(400);
    throw new Error('Eligible external guarantor required');
  }

  loan.approvedBy.push(req.user._id);
  loan.approvedAt = new Date();
  loan.status = 'approved';

  await loan.save();
  res.json({ message: 'Loan approved', loan });
});

/* =============================
   CANCEL LOAN (SAFE)
============================= */
export const cancelLoan = asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id);
  if (!loan) {
    res.status(404);
    throw new Error('Loan not found');
  }

  if (!mustBeOneOf(req.user.role, ['initiator_admin', 'super_admin'])) {
    res.status(403);
    throw new Error('Access denied');
  }

  if (!['initiated', 'approved'].includes(loan.status)) {
    res.status(400);
    throw new Error('Only undisbursed loans can be cancelled');
  }

  loan.status = 'cancelled';
  await loan.save();

  res.json({ message: 'Loan cancelled', loan });
});

/* =============================
   GET LOANS (SCOPED)
============================= */
export const getLoans = asyncHandler(async (req, res) => {
  const match = {};

  if (req.user.role === 'loan_officer') {
    const groups = await Group.find({ loanOfficer: req.user._id }).select('_id');
    match.groupId = { $in: groups.map(g => g._id) };
  }

  const loans = await Loan.find(match)
    .populate('clientId', 'name nationalId phone')
    .populate('groupId', 'name')
    .populate('initiatedBy', 'username role')
    .populate('approvedBy', 'username role')
    .sort({ createdAt: -1 });

  res.json(loans);
});
