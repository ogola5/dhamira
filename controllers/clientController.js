import ClientModel from '../models/ClientModel.js';
import GroupModel from '../models/GroupModel.js';
import asyncHandler from 'express-async-handler';

/**
 * ONBOARD CLIENT (Loan Officer)
 * status = pending
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

  if (
    !name ||
    !nationalId ||
    !phone ||
    !businessType ||
    !businessLocation ||
    !groupId
  ) {
    res.status(400);
    throw new Error('Missing required fields');
  }

  if (req.user.role !== 'loan_officer') {
    res.status(403);
    throw new Error('Only loan officers can onboard clients');
  }

  const group = await GroupModel.findById(groupId);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  if (String(group.loanOfficer) !== String(req.user._id)) {
    res.status(403);
    throw new Error('Not your group');
  }

  const exists = await ClientModel.findOne({ nationalId: nationalId.trim() });
  if (exists) {
    res.status(409);
    throw new Error('Client already exists');
  }

  const client = await ClientModel.create({
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
 * APPROVE CLIENT (Admins)
 */
export const approveClient = asyncHandler(async (req, res) => {
  const client = await ClientModel.findById(req.params.id);
  if (!client) {
    res.status(404);
    throw new Error('Client not found');
  }

  if (!['initiator_admin', 'approver_admin', 'super_admin'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Not allowed to approve clients');
  }

  client.status = 'active';
  client.approvedBy = req.user._id;
  await client.save();

  res.json({ message: 'Client approved', client });
});

/**
 * GET CLIENTS (Scoped)
 */
export const getClients = asyncHandler(async (req, res) => {
  let filter = {};

  if (req.user.role === 'loan_officer') {
    filter.loanOfficer = req.user._id;
  }

  const clients = await ClientModel.find(filter)
    .populate('groupId', 'name')
    .select('-__v');

  res.json(clients);
});
