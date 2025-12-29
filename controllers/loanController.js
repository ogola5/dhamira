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
  const { clientNationalId, groupId, product, amountKES, term, cycle } = req.body;

  if (!product || !amountKES || !term) {
    res.status(400);
    throw new Error('product, amountKES, term are required');
  }

  if (!mustBeOneOf(req.user.role, ['initiator_admin', 'loan_officer', 'super_admin'])) {
    res.status(403);
    throw new Error('Access denied');
  }

  const principal_cents = Math.round(Number(amountKES) * 100);
  if (!Number.isFinite(principal_cents) || principal_cents <= 0) {
    res.status(400);
    throw new Error('Invalid amountKES');
  }

  // GROUP-LEVEL initiation: create loans for all eligible members
  if (groupId) {
    const group = await Group.findById(groupId).populate('members');
    if (!group) {
      return res.status(400).json({ ok: false, reason: 'not_found', message: 'Group not found' });
    }
    if (group.status !== 'active') {
      return res.status(400).json({ ok: false, reason: 'not_active', message: 'Group not active' });
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

    const results = { created: [], skipped: [] };

    for (const member of group.members) {
      try {
        const client = await Client.findById(member._id);
        if (!client || client.status !== 'active') {
          results.skipped.push({ clientId: member._id, reason: 'client not active or not found' });
          continue;
        }

        // One active loan rule
        const existing = await Loan.findOne({
          clientId: client._id,
          status: { $in: ['initiated', 'approved', 'disbursement_pending', 'disbursed'] },
        });
        if (existing) {
          results.skipped.push({ clientId: client._id, reason: 'existing active loan' });
          continue;
        }

        if (client.savings_balance_cents < Math.round(principal_cents * 0.2)) {
          results.skipped.push({ clientId: client._id, reason: 'insufficient savings' });
          continue;
        }

        const computedCycle = cycle ? Number(cycle) : await computeCycleForClient(client._id, product);

        const loan = await Loan.create({
          clientId: client._id,
          groupId: group._id,
          branchId: group.branchId,
          product,
          term: Number(term),
          cycle: Number(computedCycle),
          principal_cents,
          loanType: 'individual',
          purpose: req.body.purpose || '',
          interestRatePercent: req.body.interestRatePercent || null,
          initiatedBy: req.user._id,
        });

        // Attach guarantors for this loan if provided (optional for group flow)
        if (Array.isArray(req.body.guarantors) && req.body.guarantors.length > 0) {
          for (const g of req.body.guarantors) {
            try {
              const guarantorClient = await Client.findOne({ nationalId: String(g.clientNationalId).trim() });
              if (!guarantorClient) continue;
              await Guarantor.create({
                loanId: loan._id,
                clientId: guarantorClient._id,
                relationship: g.relationship || 'unknown',
                external: g.external !== undefined ? !!g.external : true,
                idCopyUrl: g.idCopyUrl || '/uploads/placeholder-id.jpg',
                photoUrl: g.photoUrl || '/uploads/placeholder-client.jpg',
                eligibility: { hasRepaidFafaBefore: !!g.hasRepaidFafaBefore },
              });
            } catch (e) {
              // continue on guarantor creation errors
            }
          }
        }

        results.created.push({ clientId: client._id, loanId: loan._id, application_fee_cents: loan.application_fee_cents });
      } catch (err) {
        results.skipped.push({ clientId: member._id, reason: err.message || 'error creating loan' });
      }
    }

    return res.status(201).json({ message: 'Group loan initiation complete', results });
  }

  // CLIENT-LEVEL initiation (existing behaviour)
  if (!clientNationalId) {
    res.status(400);
    throw new Error('clientNationalId is required for single-client initiation');
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
    loanType: 'individual',
    purpose: req.body.purpose || '',
    interestRatePercent: req.body.interestRatePercent || null,
    initiatedBy: req.user._id,
  });
  // Create guarantors (required: at least 3)
  const guarantors = req.body.guarantors;
  if (!Array.isArray(guarantors) || guarantors.length < 3) {
    res.status(400);
    throw new Error('At least 3 guarantors are required for loan application');
  }

  const createdGuarantors = [];
  for (const g of guarantors) {
    const guarantorClient = await Client.findOne({ nationalId: String(g.clientNationalId).trim() });
    if (!guarantorClient) {
      res.status(400);
      throw new Error(`Guarantor not found: ${g.clientNationalId}`);
    }

    const gu = await Guarantor.create({
      loanId: loan._id,
      clientId: guarantorClient._id,
      relationship: g.relationship || 'unknown',
      external: g.external !== undefined ? !!g.external : true,
      idCopyUrl: g.idCopyUrl || '/uploads/placeholder-id.jpg',
      photoUrl: g.photoUrl || '/uploads/placeholder-client.jpg',
      eligibility: { hasRepaidFafaBefore: !!g.hasRepaidFafaBefore },
    });
    createdGuarantors.push(gu);
  }

  res.status(201).json({
    message: 'Loan initiated',
    loan,
    application_fee_cents: loan.application_fee_cents,
    guarantors: createdGuarantors,
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

/**
 * =============================
 * GROUP PREFLIGHT
 * Returns validation details for a group before initiating group loans
 * Query param: product (fafa|business) to validate product-specific size rules
 * =============================
 */
export const groupPreflight = asyncHandler(async (req, res) => {
  const groupId = req.params.id;
  const product = req.query.product || 'fafa';

  if (!mongoose.Types.ObjectId.isValid(groupId)) {
    res.status(400);
    throw new Error('Invalid group id');
  }

  const group = await Group.findById(groupId).populate('members');
  if (!group) {
    res.status(404).json({ ok: false, reason: 'not_found' });
    return;
  }

  const issues = [];
  if (group.status !== 'active') issues.push('group_not_active');
  const signCount = Array.isArray(group.signatories) ? group.signatories.length : 0;
  if (signCount !== 3) issues.push('signatories_missing');

  const memberCount = Array.isArray(group.members) ? group.members.length : 0;
  if (product === 'fafa' && memberCount < 5) issues.push('insufficient_members_fafa');
  if (product === 'business' && memberCount < 7) issues.push('insufficient_members_business');

  res.json({
    ok: issues.length === 0,
    group: {
      id: group._id,
      name: group.name,
      status: group.status,
      memberCount,
      signatoriesCount: signCount,
    },
    issues,
  });
});
