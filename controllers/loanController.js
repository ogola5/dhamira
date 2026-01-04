import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Loan from '../models/LoanModel.js';
import Client from '../models/ClientModel.js';
import Group from '../models/GroupModel.js';
import CreditAssessment from '../models/CreditAssessmentModel.js';
import Repayment from '../models/RepaymentModel.js';
import RepaymentSchedule from '../models/RepaymentScheduleModel.js';

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
  const { clientNationalId, groupId, product, productId, amountKES, amountCents, term, termMonths, cycle } = req.body;

  const productVal = product || productId;
  const termVal = term || termMonths;
  const amountCentsVal = typeof amountCents !== 'undefined' ? Number(amountCents) : (typeof amountKES !== 'undefined' ? Math.round(Number(amountKES) * 100) : undefined);

  if (!productVal || typeof amountCentsVal === 'undefined' || !termVal) {
    res.status(400);
    throw new Error('product, amount (amountCents or amountKES) and term are required');
  }

  // Only loan officers and admins can initiate loans (Maker)
  if (!mustBeOneOf(req.user.role, ['loan_officer', 'admin'])) {
    res.status(403);
    throw new Error('Only loan officers and admins can initiate loans');
  }

  const principal_cents = Math.round(Number(amountCentsVal));
  if (!Number.isFinite(principal_cents) || principal_cents <= 0) {
    res.status(400);
    throw new Error('Invalid amount');
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
    if (productVal === 'fafa' && memberCount < 5) {
      res.status(400);
      throw new Error('FAFA requires group of 5+ members');
    }
    if (productVal === 'business' && memberCount < 7) {
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

        

        const computedCycle = cycle ? Number(cycle) : await computeCycleForClient(client._id, productVal);

        const loan = await Loan.create({
          clientId: client._id,
          groupId: group._id,
          branchId: group.branchId,
          product: productVal,
          term: Number(termVal),
          cycle: Number(computedCycle),
          principal_cents,
          loanType: 'individual',
          purpose: req.body.purpose || '',
          interestRatePercent: req.body.interestRatePercent || null,
          initiatedBy: req.user._id,
        });

            // Guarantors removed as credit assessment requirement

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

  // Note: previously the flow required the client to have status === 'active'.
  // That restriction was removed to allow initiating loans for clients regardless
  // of their `status` field. If you want to enforce additional checks, add
  // them here (e.g., specific statuses or flags).

  // One active loan rule
  const existing = await Loan.findOne({
    clientId: client._id,
    status: { $in: ['initiated', 'approved', 'disbursement_pending', 'disbursed'] },
  });

  if (existing) {
    res.status(400);
    throw new Error('Client already has an active loan');
  }

  // Group may be optional for some clients. Only validate group constraints
  // if the client has a `groupId` that resolves to a Group document.
  let group = null;
  if (client.groupId) {
    try {
      group = await Group.findById(client.groupId).populate('members');
    } catch (e) {
      // If groupId is malformed or lookup fails, treat as no group and continue.
      group = null;
    }
  }

  if (group) {
    if (group.status !== 'active') {
      // Previously this would block loan initiation. Log a warning and continue
      // so individual clients can be processed even when their group is inactive.
      console.warn(`Loan initiation: client group ${String(group._id)} has status ${group.status} — continuing`);
    }
    // NOTE: This is single-client initiation; do not enforce signatory
    // or group-size constraints here. Those checks are applied in the
    // group-level initiation branch above (when `groupId` is provided).
  }

  

  const computedCycle = cycle
    ? Number(cycle)
    : await computeCycleForClient(client._id, productVal);

  const loan = await Loan.create({
    clientId: client._id,
    groupId: client.groupId || null,
    branchId: group ? group.branchId : client.branchId,
    product: productVal,
    term: Number(termVal),
    cycle: Number(computedCycle),
    principal_cents,
    loanType: 'individual',
    purpose: req.body.purpose || '',
    interestRatePercent: req.body.interestRatePercent || null,
    initiatedBy: req.user._id,
  });
  // Guarantors removed as credit assessment requirement
  const response = {
    message: 'Loan initiated',
    loan,
    application_fee_cents: loan.application_fee_cents,
  };

  res.status(201).json(response);
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

  // Only admins can approve loans (Checker)
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only admins can approve loans');
  }

  if (loan.status !== 'initiated') {
    res.status(400);
    throw new Error('Loan must be in initiated state');
  }

  // Maker-Checker: Admin cannot approve loan they initiated
  if (String(loan.initiatedBy) === String(req.user._id)) {
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

  // Guarantors removed as credit assessment requirement

  loan.approvedBy.push(req.user._id);
  loan.approvedAt = new Date();
  loan.status = 'approved';

  await loan.save();
  res.json({ message: 'Loan approved', loan });
});

// PUT /api/loans/:id/mark-application-fee-paid
export const markApplicationFeePaid = asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id);
  if (!loan) {
    res.status(404);
    throw new Error('Loan not found');
  }

  if (!mustBeOneOf(req.user.role, ['admin', 'super_admin'])) {
    res.status(403);
    throw new Error('Access denied');
  }

  loan.applicationFeePaid = true;
  await loan.save();

  res.json({ message: 'Application fee marked as paid', loan });
});

// POST /api/loans/mark-application-fee-paid-bulk
export const markApplicationFeePaidBulk = asyncHandler(async (req, res) => {
  const { loanIds } = req.body;
  if (!Array.isArray(loanIds) || loanIds.length === 0) {
    res.status(400);
    throw new Error('loanIds array required');
  }

  if (!mustBeOneOf(req.user.role, ['admin', 'super_admin'])) {
    res.status(403);
    throw new Error('Access denied');
  }

  const objectIds = loanIds.filter(id => mongoose.Types.ObjectId.isValid(id)).map(id => mongoose.Types.ObjectId(id));
  const { modifiedCount } = await Loan.updateMany(
    { _id: { $in: objectIds } },
    { $set: { applicationFeePaid: true } }
  );

  res.json({ message: 'Bulk update complete', modifiedCount });
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

  if (!mustBeOneOf(req.user.role, ['admin', 'super_admin'])) {
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

  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 1000);
  const skip = (page - 1) * limit;

  const [total, loans] = await Promise.all([
    Loan.countDocuments(match),
    Loan.find(match)
      .populate('clientId', 'name nationalId phone')
      .populate('groupId', 'name')
      .populate('initiatedBy', 'username role')
      .populate('approvedBy', 'username role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  res.json({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), data: loans });
});

/* =============================
   LOAN HISTORY (SUPER ADMIN ONLY)
   Complete loan history with statistics by status
============================= */
export const getLoanHistory = asyncHandler(async (req, res) => {
  // Filters
  const { status, product, loanType, startDate, endDate, search } = req.query;
  const match = {};

  if (status) match.status = status;
  if (product) match.product = product;
  if (loanType) match.loanType = loanType;
  if (startDate || endDate) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) match.createdAt.$lte = new Date(endDate);
  }

  // Pagination
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 50, 1000);
  const skip = (page - 1) * limit;

  // Statistics by status
  const statusStats = await Loan.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalPrincipal: { $sum: '$principal_cents' },
        totalDue: { $sum: '$total_due_cents' },
        totalPaid: { $sum: '$total_paid_cents' },
        totalOutstanding: { $sum: '$outstanding_cents' },
      },
    },
  ]);

  // Product breakdown
  const productStats = await Loan.aggregate([
    {
      $group: {
        _id: '$product',
        count: { $sum: 1 },
        totalPrincipal: { $sum: '$principal_cents' },
      },
    },
  ]);

  // Get filtered loans
  const [total, loans] = await Promise.all([
    Loan.countDocuments(match),
    Loan.find(match)
      .populate('clientId', 'name nationalId phone branchId')
      .populate('groupId', 'name')
      .populate('initiatedBy', 'username role')
      .populate('approvedBy', 'username role')
      .populate('disbursedBy', 'username role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  // Overall statistics
  const totalStats = await Loan.aggregate([
    {
      $group: {
        _id: null,
        totalLoans: { $sum: 1 },
        totalPrincipal: { $sum: '$principal_cents' },
        totalDue: { $sum: '$total_due_cents' },
        totalPaid: { $sum: '$total_paid_cents' },
        totalOutstanding: { $sum: '$outstanding_cents' },
      },
    },
  ]);

  res.json({
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    data: loans,
    statistics: {
      overall: totalStats[0] || {
        totalLoans: 0,
        totalPrincipal: 0,
        totalDue: 0,
        totalPaid: 0,
        totalOutstanding: 0,
      },
      byStatus: statusStats,
      byProduct: productStats,
    },
  });
});

/* =============================
   TRACK MY LOANS (LOAN OFFICER)
   Shows loans for groups assigned to the loan officer
============================= */
export const trackMyLoans = asyncHandler(async (req, res) => {
  // Get groups assigned to this loan officer
  const myGroups = await Group.find({ loanOfficer: req.user._id }).select('_id name');
  const groupIds = myGroups.map(g => g._id);

  if (groupIds.length === 0) {
    return res.json({
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
      data: [],
      myGroups: [],
      statistics: {
        totalLoans: 0,
        byStatus: [],
        totalPrincipal: 0,
        totalOutstanding: 0,
      },
    });
  }

  // Filters
  const { status, product, groupId } = req.query;
  const match = { groupId: { $in: groupIds } };

  if (status) match.status = status;
  if (product) match.product = product;
  if (groupId && mongoose.Types.ObjectId.isValid(groupId)) {
    match.groupId = new mongoose.Types.ObjectId(groupId);
  }

  // Pagination
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const skip = (page - 1) * limit;

  // Statistics for my loans
  const statusStats = await Loan.aggregate([
    { $match: { groupId: { $in: groupIds } } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        totalPrincipal: { $sum: '$principal_cents' },
        totalOutstanding: { $sum: '$outstanding_cents' },
      },
    },
  ]);

  // Get my loans
  const [total, loans] = await Promise.all([
    Loan.countDocuments(match),
    Loan.find(match)
      .populate('clientId', 'name nationalId phone')
      .populate('groupId', 'name')
      .populate('initiatedBy', 'username')
      .populate('approvedBy', 'username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  // Overall stats for my loans
  const overallStats = await Loan.aggregate([
    { $match: { groupId: { $in: groupIds } } },
    {
      $group: {
        _id: null,
        totalLoans: { $sum: 1 },
        totalPrincipal: { $sum: '$principal_cents' },
        totalOutstanding: { $sum: '$outstanding_cents' },
      },
    },
  ]);

  res.json({
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    data: loans,
    myGroups: myGroups.map(g => ({ id: g._id, name: g.name })),
    statistics: {
      totalLoans: overallStats[0]?.totalLoans || 0,
      totalPrincipal: overallStats[0]?.totalPrincipal || 0,
      totalOutstanding: overallStats[0]?.totalOutstanding || 0,
      byStatus: statusStats,
    },
  });
});

/**
 * GET /api/loans/:id
 * Returns detailed loan information including repayment schedule,
 * repayment history, computed progress, outstanding, and allowed actions
 */
export const getLoanDetail = asyncHandler(async (req, res) => {
  const id = req.params.id;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400);
    throw new Error('Invalid loan id');
  }

  const loan = await Loan.findById(id)
    .populate('clientId', 'name nationalId phone groupId branchId')
    .populate('groupId', 'name status')
    .populate('initiatedBy', 'username role')
    .populate('approvedBy', 'username role')
    .populate('disbursedBy', 'username role');

  if (!loan) {
    res.status(404);
    throw new Error('Loan not found');
  }

  // Credit Assessment
  const creditAssessment = await CreditAssessment.findOne({ loanId: loan._id }).lean();

  // Repayment schedule and history
  const schedules = await RepaymentSchedule.find({ loanId: loan._id }).sort({ installmentNo: 1 }).lean();
  const repayments = await Repayment.find({ loanId: loan._id }).sort({ createdAt: -1 }).lean();

  // Compute totals and progress (fallback to cached totals on loan)
  const totalDue = loan.total_due_cents || schedules.reduce((s, it) => s + (it.amount_due_cents || 0), 0);
  const totalPaidFromSchedules = schedules.reduce((s, it) => s + (it.paid_cents || 0), 0);
  const totalPaidTxn = repayments.reduce((s, r) => s + (r.amount_cents || 0), 0);
  const totalPaid = Math.max(loan.total_paid_cents || 0, totalPaidFromSchedules, totalPaidTxn);
  const outstanding = loan.outstanding_cents != null ? loan.outstanding_cents : Math.max(0, totalDue - totalPaid);

  // Next due installment
  const nextDue = schedules.find(s => s.status === 'pending' || s.status === 'overdue') || null;

  // Progress percent
  const progress = totalDue > 0 ? Math.round((totalPaid / totalDue) * 10000) / 100 : 0;

  // Allowed actions by role and loan status
  const role = req.user.role;
  const status = loan.status;
  const actions = [];

  if (status === 'initiated') {
    if (['admin', 'super_admin'].includes(role)) actions.push({ key: 'approve', label: 'Approve' });
    if (['admin', 'super_admin'].includes(role)) actions.push({ key: 'cancel', label: 'Cancel' });
  }
  if (status === 'approved') {
    if (['admin', 'super_admin'].includes(role)) actions.push({ key: 'disburse', label: 'Disburse' });
  }
  if (status === 'disbursed') {
    if (['loan_officer', 'admin', 'super_admin'].includes(role)) actions.push({ key: 'record_repayment', label: 'Record Repayment' });
  }
  if (['initiated', 'approved', 'disbursement_pending'].includes(status)) {
    if (['admin', 'super_admin'].includes(role)) actions.push({ key: 'edit', label: 'Edit Application' });
  }

  res.json({
    loan,
    creditAssessment,
    hasCreditAssessment: !!creditAssessment,
    schedules,
    repayments,
    totals: { totalDue, totalPaid, outstanding },
    progress,
    nextDue,
    actions,
  });
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
