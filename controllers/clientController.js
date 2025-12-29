import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Client from '../models/ClientModel.js';
import Group from '../models/GroupModel.js';
import Loan from '../models/LoanModel.js';

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
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
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

  client.status = 'active';
  client.approvedBy = req.user._id;
  client.registrationDate = new Date();

  await client.save();
  res.json({ message: 'Client approved', client });
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
  const limit = Math.min(Number(req.query.limit) || 20, 200);
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
