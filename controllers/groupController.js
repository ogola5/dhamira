import GroupModel from '../models/GroupModel.js';
import userModel from '../models/userModel.js';
import asyncHandler from 'express-async-handler';

/**
 * CREATE GROUP (Loan Officer)
 * status = pending
 */
export const createGroup = asyncHandler(async (req, res) => {
  const { name, meetingDay, meetingTime } = req.body;

  if (!name) {
    res.status(400);
    throw new Error('Group name is required');
  }

  if (req.user.role !== 'loan_officer') {
    res.status(403);
    throw new Error('Only loan officers can create groups');
  }

  const exists = await GroupModel.findOne({ name: name.trim() });
  if (exists) {
    res.status(409);
    throw new Error('Group name already exists');
  }

  const group = await GroupModel.create({
    name: name.trim(),
    branchId: req.user.branchId,          // REQUIRED
    loanOfficer: req.user._id,
    createdBy: req.user._id,
    meetingDay: meetingDay || null,
    meetingTime: meetingTime || null,
    status: 'pending',
    source: 'system',
  });

  res.status(201).json({
    message: 'Group created and pending approval',
    group,
  });
});

/**
 * APPROVE GROUP (Admins)
 */
export const approveGroup = asyncHandler(async (req, res) => {
  const group = await GroupModel.findById(req.params.id);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  if (!['initiator_admin', 'approver_admin', 'super_admin'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Not allowed to approve groups');
  }

  if (group.status === 'active') {
    res.status(400);
    throw new Error('Group already active');
  }

  group.status = 'active';
  group.approvedBy = req.user._id;
  await group.save();

  res.json({ message: 'Group approved', group });
});

/**
 * ASSIGN SIGNATORIES (Loan Officer after approval)
 */
export const assignSignatories = asyncHandler(async (req, res) => {
  const { signatories } = req.body;

  if (!Array.isArray(signatories) || signatories.length !== 3) {
    res.status(400);
    throw new Error('Exactly 3 signatories required');
  }

  const group = await GroupModel.findById(req.params.id).populate('members');
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  if (group.status !== 'active') {
    res.status(400);
    throw new Error('Group must be active before assigning signatories');
  }

  if (String(group.loanOfficer) !== String(req.user._id)) {
    res.status(403);
    throw new Error('Not your group');
  }

  group.signatories = signatories;
  await group.save();

  res.json({ message: 'Signatories assigned', group });
});

/**
 * GET GROUPS (Scoped)
 */
export const getGroups = asyncHandler(async (req, res) => {
  let filter = {};

  if (req.user.role === 'loan_officer') {
    filter.loanOfficer = req.user._id;
  }

  const groups = await GroupModel.find(filter)
    .populate('loanOfficer', 'username')
    .populate('members', 'name nationalId');

  res.json(groups);
});
