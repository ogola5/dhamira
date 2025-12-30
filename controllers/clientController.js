import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Client from '../models/ClientModel.js';
import Group from '../models/GroupModel.js';
import Loan from '../models/LoanModel.js';
import Transaction from '../models/TransactionModel.js';

/**
 * ============================
 * CREATE / ONBOARD CLIENT
 * ============================
 * Role: loan_officer
 * Status: pending
 */
export const onboardClient = asyncHandler(async (req, res) => {
  const {
    name,
    nationalId,
    phone,
    businessType,
    businessLocation,
    nextOfKin,
    groupId,
  } = req.body;

  if (!name || !nationalId || !phone || !businessType || !businessLocation || !groupId) {
    res.status(400);
    throw new Error('Missing required fields');
  }

  if (req.user.role !== 'loan_officer') {
    res.status(403);
    throw new Error('Only loan officers can onboard clients');
  }

  const group = await Group.findById(groupId);
      if (!['loan_officer', 'super_admin'].includes(req.user.role)) {
        res.status(403);
        throw new Error('Only loan officers or super admin can onboard clients');
      }

  if (String(group.loanOfficer) !== String(req.user._id)) {
    res.status(403);
    throw new Error('Not your group');
  }

  const exists = await Client.findOne({ nationalId: nationalId.trim() });
  if (exists) {
    res.status(409);
    throw new Error('Client already exists');
  }

  const client = await Client.create({
    name: name.trim(),
    nationalId: nationalId.trim(),
    phone: phone.trim(),
    groupId,
    branchId: group.branchId,
    loanOfficer: req.user._id,
    createdBy: req.user._id,
    businessType: businessType.trim(),
    businessLocation: businessLocation.trim(),
    nextOfKin,
    status: 'pending',
    source: 'system',
  });

  res.status(201).json({
    message: 'Client onboarded and pending approval',
    client,
  });
});

/**
 * ============================
 * APPROVE CLIENT
 * ============================
 * Role: admins
 */
    /**
     * ============================
     * ADD SAVINGS (ADMIN ACTION)
     * ============================
     * Role: initiator_admin, super_admin
     */
    export const addSavings = asyncHandler(async (req, res) => {
      const { amountKES, amountCents } = req.body;
      const clientId = req.params.id;

      if (!clientId) {
        res.status(400);
        throw new Error('Client id is required');
      }

      const client = await Client.findById(clientId);
      if (!client) {
        res.status(404);
        throw new Error('Client not found');
      }

      if (!['initiator_admin', 'super_admin'].includes(req.user.role)) {
        res.status(403);
        throw new Error('Not allowed to add savings');
      }

      const cents = typeof amountCents !== 'undefined'
        ? Math.round(Number(amountCents))
        : (typeof amountKES !== 'undefined' ? Math.round(Number(amountKES) * 100) : undefined);

      if (typeof cents === 'undefined' || !Number.isFinite(cents) || cents <= 0) {
        res.status(400);
        throw new Error('Invalid amount');
      }

      const update = { savings_balance_cents: (client.savings_balance_cents || 0) + cents };
      if (!client.initialSavingsPaid) update.initialSavingsPaid = true;

      const updated = await Client.findByIdAndUpdate(clientId, { $set: update }, { new: true });

      res.json({ message: 'Savings added', client: updated || client });
    });
export const approveClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) {
    res.status(404);
    throw new Error('Client not found');
  }

  if (!['initiator_admin', 'approver_admin', 'super_admin'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Not allowed to approve clients');
  }

  if (client.status !== 'pending') {
    res.status(400);
    throw new Error('Client must be pending to approve');
  }

  const updated = await Client.findByIdAndUpdate(req.params.id, {
    $set: {
      status: 'active',
      approvedBy: req.user._id,
      registrationDate: new Date(),
    },
  }, { new: true });

  res.json({ message: 'Client approved', client: updated || client });
});

/**
 * ============================
 * GET CLIENTS (LIST + PAGINATION)
 * ============================
 */
export const getClients = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.user.role === 'loan_officer') {
    filter.loanOfficer = req.user._id;
  }

  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 1000);
  const skip = (page - 1) * limit;

  const [total, clients] = await Promise.all([
    Client.countDocuments(filter),
    Client.find(filter)
      .populate('groupId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('-__v'),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  res.json({
    page,
    limit,
    total,
    totalPages,
    data: clients,
  });
});

/**
 * ============================
 * GET CLIENT HISTORY (REPAYMENTS)
 * ============================
 */
export const getClientHistory = asyncHandler(async (req, res) => {
  const clientId = req.params.id;

  if (!clientId || !clientId.match(/^[0-9a-fA-F]{24}$/)) {
    res.status(400);
    throw new Error('Invalid client id');
  }

  const client = await Client.findById(clientId);
  if (!client) {
    res.status(404);
    throw new Error('Client not found');
  }

  // Authorization: loan officers may only view their own clients
  if (req.user.role === 'loan_officer' && String(client.loanOfficer) !== String(req.user._id)) {
    res.status(403);
    throw new Error('Access denied');
  }

  // Find loans for this client
  const loans = await Loan.find({ clientId }).select('_id status amount_cents outstanding_cents total_paid_cents');
  const loanIds = loans.map((l) => l._id);

  // Find repayments (successful mpesa c2b transactions) for those loans
  const repayments = await Transaction.find({ loanId: { $in: loanIds }, type: 'mpesa_c2b', status: 'success' }).sort({ createdAt: -1 });

  // Group repayments by loanId
  const grouped = repayments.reduce((acc, r) => {
    const k = String(r.loanId);
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});

  const data = loans.map((l) => ({
    loanId: l._id,
    status: l.status,
    amount_cents: l.amount_cents,
    total_paid_cents: l.total_paid_cents,
    outstanding_cents: l.outstanding_cents,
    repayments: grouped[String(l._id)] || [],
  }));

  res.json({ clientId, loans: data });
});

/**
 * ============================
 * GET SINGLE CLIENT
 * ============================
 */
export const getClientById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid client id');
  }

  const client = await Client.findById(req.params.id)
    .populate('groupId', 'name')
    .populate('loanOfficer', 'username role');

  if (!client) {
    res.status(404);
    throw new Error('Client not found');
  }

  if (
    req.user.role === 'loan_officer' &&
    String(client.loanOfficer._id) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error('Not allowed');
  }

  res.json(client);
});

/**
 * ============================
 * UPDATE CLIENT (HARDENED)
 * ============================
 */
export const updateClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) {
    res.status(404);
    throw new Error('Client not found');
  }

  if (
    req.user.role === 'loan_officer' &&
    String(client.loanOfficer) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error('Not allowed');
  }

  // HARD RULE: If client has loan history, lock structural fields
  const hasLoans = await Loan.countDocuments({ clientId: client._id });
  if (hasLoans > 0) {
    const forbidden = ['groupId', 'loanOfficer', 'branchId', 'nationalId'];
    forbidden.forEach(f => {
      if (req.body[f] !== undefined) {
        throw new Error(`Cannot modify ${f} after loan history exists`);
      }
    });
  }

  const allowed = [
    'name',
    'phone',
    'businessType',
    'businessLocation',
    'nextOfKin',
    'residenceType',
  ];

  allowed.forEach(field => {
    if (req.body[field] !== undefined) {
      client[field] = req.body[field];
    }
  });

  await client.save();
  res.json({ message: 'Client updated', client });
});

/**
 * ============================
 * DEACTIVATE CLIENT (SAFE)
 * ============================
 */
export const deactivateClient = asyncHandler(async (req, res) => {
  const client = await Client.findById(req.params.id);
  if (!client) {
    res.status(404);
    throw new Error('Client not found');
  }

  if (!['initiator_admin', 'approver_admin', 'super_admin'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Not allowed');
  }

  const activeLoans = await Loan.countDocuments({
    clientId: client._id,
    status: { $in: ['approved', 'disbursement_pending', 'disbursed'] },
  });

  if (activeLoans > 0) {
    res.status(400);
    throw new Error('Client has active loans and cannot be deactivated');
  }

  client.status = 'inactive';
  await client.save();

  res.json({ message: 'Client deactivated' });
});

/**
 * ============================
 * SEARCH CLIENTS (SCOPED)
 * ============================
 */
export const searchClients = asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const regex = new RegExp(q, 'i');

  const filter = {
    $or: [{ name: regex }, { nationalId: regex }, { phone: regex }],
  };

  if (req.user.role === 'loan_officer') {
    filter.loanOfficer = req.user._id;
  }

  const clients = await Client.find(filter)
    .select('name nationalId phone status groupId')
    .limit(20);

  res.json(clients);
});
