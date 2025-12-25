import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Loan from '../models/LoanModel.js';
import Client from '../models/ClientModel.js';
import Group from '../models/GroupModel.js';
import Guarantor from '../models/GuarantorModel.js';
import CreditAssessment from '../models/CreditAssessmentModel.js';

import LedgerEntry from '../models/LedgerEntryModel.js';
import Transaction from '../models/TransactionModel.js';

import { applyLoanLedger } from '../utils/applyLoanLedger.js';

function mustBeOneOf(role, allowed) {
  return allowed.includes(role);
}

function isCashRole(role) {
  return role === 'initiator_admin' || role === 'approver_admin' || role === 'super_admin';
}

async function computeCycleForClient(clientId, product) {
  // Count previous repaid loans for that product
  const repaidCount = await Loan.countDocuments({ clientId, product, status: 'repaid' });
  // next cycle = repaidCount + 1, capped by product rules
  const next = repaidCount + 1;
  if (product === 'fafa') return Math.min(next, 3);
  if (product === 'business') return Math.min(next, 4);
  return next;
}

// POST /api/loans/initiate
// initiator_admin or loan_officer
const initiateLoan = asyncHandler(async (req, res) => {
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

  const group = await Group.findById(client.groupId).populate('members');
  if (!group) {
    res.status(400);
    throw new Error('Client group not found');
  }

  // Group must be active-ready (signatories optional for legacy, but for loans we enforce 3)
  if (!Array.isArray(group.signatories) || group.signatories.length !== 3) {
    res.status(400);
    throw new Error('Group must have exactly 3 signatories before loans');
  }

  // Group size rules (policy)
  const memberCount = Array.isArray(group.members) ? group.members.length : 0;
  if (product === 'fafa' && memberCount < 5) {
    res.status(400);
    throw new Error('FAFA requires group of 5+ members');
  }
  if (product === 'business' && memberCount < 7) {
    res.status(400);
    throw new Error('Business loan requires group of 7+ members');
  }

  // Savings rule: client must have 20% of principal in savings
  const principal_cents = Math.round(Number(amountKES) * 100);
  if (!Number.isFinite(principal_cents) || principal_cents <= 0) {
    res.status(400);
    throw new Error('Invalid amountKES');
  }
  if (client.savings_balance_cents < Math.round(principal_cents * 0.2)) {
    res.status(400);
    throw new Error('Client must have at least 20% of loan amount as savings');
  }

  // Cycle: either provided or auto-computed
  const computedCycle = cycle ? Number(cycle) : await computeCycleForClient(client._id, product);

  // Create loan (policy + pricing computed in model hook)
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

  // Application fee is due (do NOT post ledger here unless paid now)
  res.status(201).json({
    message: 'Loan initiated',
    loan,
    application_fee_cents: loan.application_fee_cents,
  });
});

// PUT /api/loans/:id/approve
// approver_admin or super_admin
const approveLoan = asyncHandler(async (req, res) => {
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

  // separation of duties (cannot approve if you initiated)
  if (String(loan.initiatedBy) === String(req.user._id) && req.user.role !== 'super_admin') {
    res.status(403);
    throw new Error('Cannot approve your own initiated loan');
  }

  // application fee must be paid before approval (policy-ready)
  if (!loan.applicationFeePaid) {
    res.status(400);
    throw new Error('Application fee must be paid before approval');
  }

  // credit assessment required
  const assessment = await CreditAssessment.findOne({ loanId: loan._id });
  if (!assessment) {
    res.status(400);
    throw new Error('Credit assessment required before approval');
  }

  // external guarantor required:
  // Policy says external guarantor must have serviced FAFA successfully.
  const acceptedExternal = await Guarantor.countDocuments({
    loanId: loan._id,
    accepted: true,
    external: true,
    'eligibility.hasRepaidFafaBefore': true,
  });

  if (acceptedExternal < 1) {
    res.status(400);
    throw new Error('At least one accepted eligible external guarantor is required');
  }

  // Record approver (allow interchangeability, but keep audit trail)
  if (!loan.approvedBy.map(String).includes(String(req.user._id))) {
    loan.approvedBy.push(req.user._id);
  }
  loan.approvedAt = new Date();
  loan.status = 'approved';

  await loan.save();

  res.json({ message: 'Loan approved', loan });
});

// GET /api/loans
const getLoans = asyncHandler(async (req, res) => {
  // Scope:
  // - super_admin: all
  // - initiator/approver: all (organization view)
  // - loan_officer: only loans under groups assigned to them (loanOfficer= req.user._id)
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

export { initiateLoan, approveLoan, getLoans };
