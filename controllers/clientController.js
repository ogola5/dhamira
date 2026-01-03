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
    branchId,
  } = req.body;

  // Validate required fields including branchId and groupId
  if (!name || !nationalId || !phone || !businessType || !businessLocation || !groupId || !branchId) {
    res.status(400);
    throw new Error('Missing required fields: name, nationalId, phone, businessType, businessLocation, groupId, and branchId are mandatory');
  }

  // Only loan officers can onboard clients (Maker)
  if (req.user.role !== 'loan_officer') {
    res.status(403);
    throw new Error('Only loan officers can onboard clients');
  }

  // Verify group exists and belongs to loan officer's branch
  const group = await Group.findById(groupId);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  // Ensure group belongs to the loan officer
  if (String(group.loanOfficer) !== String(req.user._id)) {
    res.status(403);
    throw new Error('You can only add clients to your own groups');
  }

  // Ensure branch matches group's branch
  if (String(group.branchId) !== String(branchId)) {
    res.status(400);
    throw new Error('Branch ID must match the group\'s branch');
  }

  // Prevent orphaned clients - verify branchId matches user's branch
  if (req.user.branchId && String(branchId) !== String(req.user.branchId)) {
    res.status(403);
    throw new Error('You can only create clients in your assigned branch');
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
    branchId,
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

      // Only admins can add savings
      if (req.user.role !== 'admin') {
        res.status(403);
        throw new Error('Only admins can add savings');
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

  // Only admins can approve clients (Checker)
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only admins can approve clients');
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
    // Show loan officer's own clients + legacy clients with no loan officer
    filter.$or = [
      { loanOfficer: req.user._id },
      { loanOfficer: null, status: 'legacy' }
    ];
  }

  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 1000);
  const skip = (page - 1) * limit;

  const [total, clients] = await Promise.all([
    Client.countDocuments(filter),
    Client.find(filter)
      .populate('groupId', 'name status')
      .populate('loanOfficer', 'username role')
      .populate('branchId', 'name')
      .populate('createdBy', 'username role')
      .populate('approvedBy', 'username role')
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

  // Authorization: loan officers may only view their own clients or legacy clients
  if (req.user.role === 'loan_officer' && client.loanOfficer && String(client.loanOfficer) !== String(req.user._id)) {
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
    .populate('groupId', 'name status meetingDay meetingTime')
    .populate('loanOfficer', 'username role email')
    .populate('branchId', 'name location')
    .populate('createdBy', 'username role')
    .populate('approvedBy', 'username role');

  if (!client) {
    res.status(404);
    throw new Error('Client not found');
  }

  // Loan officer can only view their own clients or legacy clients with no loan officer
  if (
    req.user.role === 'loan_officer' &&
    client.loanOfficer &&
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

  // Loan officer can only edit their own clients or legacy clients with no loan officer
  if (
    req.user.role === 'loan_officer' &&
    client.loanOfficer &&
    String(client.loanOfficer) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error('Not allowed');
  }

  const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
  const hasLoans = await Loan.countDocuments({ clientId: client._id });

  // Admins have more editing power
  if (isAdmin) {
    // Admin can edit most fields, but nationalId is always locked if loans exist
    if (hasLoans > 0 && req.body.nationalId !== undefined) {
      res.status(400);
      throw new Error('Cannot modify nationalId after loan history exists');
    }

    // Allow admin to update these fields
    const adminAllowed = [
      'name',
      'phone',
      'businessType',
      'businessLocation',
      'nextOfKin',
      'residenceType',
      'groupId',      // Admin can reassign group
      'loanOfficer',  // Admin can reassign loan officer
      'branchId',     // Admin can reassign branch
    ];

    // Only update nationalId if no loans exist
    if (!hasLoans && req.body.nationalId !== undefined) {
      adminAllowed.push('nationalId');
    }

    adminAllowed.forEach(field => {
      if (req.body[field] !== undefined) {
        client[field] = req.body[field];
      }
    });
  } else {
    // Loan officer restrictions: lock structural fields if loans exist
    if (hasLoans > 0) {
      const forbidden = ['groupId', 'loanOfficer', 'branchId', 'nationalId'];
      forbidden.forEach(f => {
        if (req.body[f] !== undefined) {
          res.status(400);
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
  }

  // Auto-activate legacy clients when all required fields are filled
  if (client.status === 'legacy') {
    const hasAllRequiredFields = 
      client.name &&
      client.nationalId &&
      client.phone &&
      client.businessType &&
      client.businessLocation &&
      client.residenceType &&
      client.nextOfKin?.name &&
      client.nextOfKin?.phone &&
      client.nextOfKin?.relationship;

    if (hasAllRequiredFields) {
      client.status = 'active';
      if (!client.registrationDate) {
        client.registrationDate = new Date();
      }
    }
  }

  await client.save();
  
  // Populate fields for response
  await client.populate([
    { path: 'groupId', select: 'name status' },
    { path: 'loanOfficer', select: 'username role' },
    { path: 'branchId', select: 'name' },
    { path: 'createdBy', select: 'username role' },
    { path: 'approvedBy', select: 'username role' }
  ]);
  
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

  if (!['admin', 'super_admin'].includes(req.user.role)) {
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
