import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';

import Group from '../models/GroupModel.js';
import Loan from '../models/LoanModel.js';
import Client from '../models/ClientModel.js';

/**
 * ============================
 * CREATE GROUP
 * ============================
 * Role: loan_officer
 * Status: pending
 */
export const createGroup = asyncHandler(async (req, res) => {
  const { name, meetingDay, meetingTime } = req.body;

  if (!name) {
    res.status(400);
    throw new Error('Group name is required');
  }

  if (!['loan_officer', 'super_admin'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Only loan officers or super admin can create groups');
  }

  const exists = await Group.findOne({ name: name.trim() });
  if (exists) {
    res.status(409);
    throw new Error('Group name already exists');
  }

  const group = await Group.create({
    name: name.trim(),
    branchId: req.user.branchId,
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
 * ============================
 * APPROVE GROUP
 * ============================
 * Role: admins
 */
export const approveGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  if (!['initiator_admin', 'approver_admin', 'super_admin'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Not allowed');
  }

  if (group.status !== 'pending') {
    res.status(400);
    throw new Error('Only pending groups can be approved');
  }

  group.status = 'active';
  group.approvedBy = req.user._id;

  await group.save();
  res.json({ message: 'Group approved', group });
});

/**
 * ============================
 * ASSIGN SIGNATORIES (ONCE)
 * ============================
 */
export const assignSignatories = asyncHandler(async (req, res) => {
  const { signatories, signatoryAssignments } = req.body;

  let finalSignatories = null;

  // Accept payload either as `signatories` (current shape) or
  // `signatoryAssignments` = [{ role, memberNationalId }]
  if (Array.isArray(signatoryAssignments) && signatoryAssignments.length === 3) {
    // Resolve nationalIds to clientIds
    finalSignatories = [];
    for (const a of signatoryAssignments) {
      if (!a.role || !a.memberNationalId) {
        res.status(400);
        throw new Error('Each signatory assignment requires role and memberNationalId');
      }
      const client = await Client.findOne({ nationalId: String(a.memberNationalId).trim() });
      if (!client) {
        res.status(404);
        throw new Error(`Guarantor client not found: ${a.memberNationalId}`);
      }
      finalSignatories.push({ role: a.role, clientId: client._id });
    }
  } else if (Array.isArray(signatories) && signatories.length === 3) {
    finalSignatories = signatories;
  } else {
    res.status(400);
    throw new Error('Exactly 3 signatories required');
  }

  const group = await Group.findById(req.params.id);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  if (group.status !== 'active') {
    res.status(400);
    throw new Error('Group must be active');
  }

  if (
    req.user.role === 'loan_officer' &&
    String(group.loanOfficer) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error('Not your group');
  }

  // HARD RULE: lock after first loan
  const loanCount = await Loan.countDocuments({ groupId: group._id });
  if (loanCount > 0) {
    res.status(400);
    throw new Error('Cannot modify signatories after loans exist');
  }

  if (group.signatories && group.signatories.length === 3) {
    res.status(400);
    throw new Error('Signatories already assigned');
  }

  group.signatories = finalSignatories;
  await group.save();

  res.json({ message: 'Signatories assigned', group });
});

/**
 * ============================
 * UPDATE GROUP (LIMITED)
 * ============================
 */
export const updateGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  if (
    req.user.role === 'loan_officer' &&
    String(group.loanOfficer) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error('Not allowed');
  }

  // HARD RULE: structural fields locked after loans
  const hasLoans = await Loan.countDocuments({ groupId: group._id });
  if (hasLoans > 0) {
    const forbidden = ['members', 'loanOfficer', 'branchId'];
    forbidden.forEach(f => {
      if (req.body[f] !== undefined) {
        throw new Error(`Cannot modify ${f} after loans exist`);
      }
    });
  }

  // Only safe fields
  if (req.body.meetingDay !== undefined) group.meetingDay = req.body.meetingDay;
  if (req.body.meetingTime !== undefined) group.meetingTime = req.body.meetingTime;

  await group.save();
  res.json({ message: 'Group updated', group });
});

/**
 * ============================
 * DEACTIVATE GROUP
 * ============================
 */
export const deactivateGroup = asyncHandler(async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  if (!['initiator_admin', 'approver_admin', 'super_admin'].includes(req.user.role)) {
    res.status(403);
    throw new Error('Not allowed');
  }

  const activeLoans = await Loan.countDocuments({
    groupId: group._id,
    status: { $in: ['approved', 'disbursement_pending', 'disbursed'] },
  });

  if (activeLoans > 0) {
    res.status(400);
    throw new Error('Group has active loans and cannot be deactivated');
  }

  group.status = 'inactive';
  await group.save();

  res.json({ message: 'Group deactivated' });
});

/**
 * ============================
 * GET GROUPS (SCOPED)
 * ============================
 */
export const getGroups = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'loan_officer') filter.loanOfficer = req.user._id;

  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 1000);
  const skip = (page - 1) * limit;

  const [total, groups] = await Promise.all([
    Group.countDocuments(filter),
    Group.find(filter)
      .populate('loanOfficer', 'username')
      .populate('members', 'name nationalId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
  ]);

  res.json({ page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)), data: groups });
});

/**
 * ============================
 * GET SINGLE GROUP
 * ============================
 */
export const getGroupById = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(400);
    throw new Error('Invalid group id');
  }

  const group = await Group.findById(req.params.id)
    .populate('loanOfficer', 'username')
    .populate('members', 'name nationalId');

  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  if (
    req.user.role === 'loan_officer' &&
    String(group.loanOfficer._id) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error('Not allowed');
  }

  res.json(group);
});
