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
  const { name, meetingDay, meetingTime, branchId } = req.body;

  if (!name) {
    res.status(400);
    throw new Error('Group name is required');
  }

  // Only loan officers can create groups (Maker)
  if (req.user.role !== 'loan_officer') {
    res.status(403);
    throw new Error('Only loan officers can create groups');
  }

  // Use provided branchId or default to user's branch
  const finalBranchId = branchId || req.user.branchId;
  
  if (!finalBranchId) {
    res.status(400);
    throw new Error('Branch ID is required');
  }

  // Loan officers can only create groups in their branch
  if (req.user.role === 'loan_officer' && String(finalBranchId) !== String(req.user.branchId)) {
    res.status(403);
    throw new Error('You can only create groups in your assigned branch');
  }

  const exists = await Group.findOne({ name: name.trim() });
  if (exists) {
    res.status(409);
    throw new Error('Group name already exists');
  }

  const group = await Group.create({
    name: name.trim(),
    branchId: finalBranchId,
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

  // Only admins can approve (Checker)
  if (req.user.role !== 'admin') {
    res.status(403);
    throw new Error('Only admins can approve groups');
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
  
  // Sync individual signatory fields
  finalSignatories.forEach(sig => {
    if (sig.role === 'chairperson') group.chairperson = sig.clientId;
    if (sig.role === 'secretary') group.secretary = sig.clientId;
    if (sig.role === 'treasurer') group.treasurer = sig.clientId;
  });
  
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

  // Loan officer can only edit their own groups (skip check if loanOfficer is null - legacy groups)
  if (
    req.user.role === 'loan_officer' &&
    group.loanOfficer &&
    String(group.loanOfficer) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error('Not allowed');
  }

  const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
  const hasLoans = await Loan.countDocuments({ groupId: group._id });

  // Admins have more editing power
  if (isAdmin) {
    // Admin can update these fields
    const adminAllowed = [
      'name',
      'meetingDay',
      'meetingTime',
      'loanOfficer',  // Admin can reassign loan officer
      'branchId',     // Admin can reassign branch
      'status',       // Admin can change status
    ];

    adminAllowed.forEach(field => {
      if (req.body[field] !== undefined) {
        group[field] = req.body[field];
      }
    });

    // Admin can update members if provided
    if (req.body.members !== undefined && Array.isArray(req.body.members)) {
      group.members = req.body.members;
    }

    // Handle signatories in array format
    if (req.body.signatories !== undefined && Array.isArray(req.body.signatories)) {
      // Validate signatories structure
      if (req.body.signatories.length === 3) {
        const roles = req.body.signatories.map(s => s.role);
        const uniqueRoles = new Set(roles);
        
        if (uniqueRoles.size !== 3) {
          res.status(400);
          throw new Error('Signatories must have 3 different roles: chairperson, secretary, treasurer');
        }

        const clientIds = req.body.signatories.map(s => String(s.clientId));
        if (new Set(clientIds).size !== clientIds.length) {
          res.status(400);
          throw new Error('One client cannot hold multiple signatory roles');
        }

        group.signatories = req.body.signatories;
        
        // Sync individual fields with signatories array
        req.body.signatories.forEach(sig => {
          if (sig.role === 'chairperson') group.chairperson = sig.clientId;
          if (sig.role === 'secretary') group.secretary = sig.clientId;
          if (sig.role === 'treasurer') group.treasurer = sig.clientId;
        });
      } else if (req.body.signatories.length > 0) {
        res.status(400);
        throw new Error('Group must have exactly 3 signatories');
      }
    }

    // Handle signatories in flat format (chairperson, secretary, treasurer)
    if (req.body.chairperson || req.body.secretary || req.body.treasurer) {
      const { chairperson, secretary, treasurer } = req.body;
      
      // Check if all three are provided
      if (chairperson && secretary && treasurer) {
        // Validate all are different
        const ids = [String(chairperson), String(secretary), String(treasurer)];
        if (new Set(ids).size !== 3) {
          res.status(400);
          throw new Error('Chairperson, secretary, and treasurer must be different clients');
        }

        // Build signatories array
        group.signatories = [
          { role: 'chairperson', clientId: chairperson },
          { role: 'secretary', clientId: secretary },
          { role: 'treasurer', clientId: treasurer }
        ];
        
        // Sync individual fields
        group.chairperson = chairperson;
        group.secretary = secretary;
        group.treasurer = treasurer;
      } else if (chairperson || secretary || treasurer) {
        // If only some are provided, return error
        res.status(400);
        throw new Error('Must provide all three signatories: chairperson, secretary, and treasurer');
      }
    }
  } else {
    // Loan officer restrictions: lock structural fields after loans
    if (hasLoans > 0) {
      const forbidden = ['members', 'loanOfficer', 'branchId'];
      forbidden.forEach(f => {
        if (req.body[f] !== undefined) {
          res.status(400);
          throw new Error(`Cannot modify ${f} after loans exist`);
        }
      });
    }

    // Loan officers can only update safe fields
    if (req.body.name !== undefined) group.name = req.body.name;
    if (req.body.meetingDay !== undefined) group.meetingDay = req.body.meetingDay;
    if (req.body.meetingTime !== undefined) group.meetingTime = req.body.meetingTime;
  }

  // Auto-activate legacy groups when all required fields are filled
  if (group.status === 'legacy') {
    const hasAllRequiredFields = 
      group.name &&
      group.loanOfficer &&
      group.branchId &&
      group.meetingDay &&
      group.meetingTime &&
      group.signatories &&
      group.signatories.length === 3;

    if (hasAllRequiredFields) {
      group.status = 'active';
    }
  }

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

  if (!['admin', 'super_admin'].includes(req.user.role)) {
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
  if (req.user.role === 'loan_officer') {
    // Show loan officer's own groups + legacy groups with no loan officer
    filter.$or = [
      { loanOfficer: req.user._id },
      { loanOfficer: null, status: 'legacy' }
    ];
  }

  const page = Number(req.query.page) || 1;
  const limit = Math.min(Number(req.query.limit) || 20, 1000);
  const skip = (page - 1) * limit;

  const [total, groups] = await Promise.all([
    Group.countDocuments(filter),
    Group.find(filter)
      .populate('loanOfficer', 'username')
      .populate('members', 'name nationalId')
      .populate('signatories.clientId', 'name nationalId')
      .populate('chairperson', 'name nationalId')
      .populate('secretary', 'name nationalId')
      .populate('treasurer', 'name nationalId')
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
    .populate('members', 'name nationalId')
    .populate('signatories.clientId', 'name nationalId')
    .populate('chairperson', 'name nationalId')
    .populate('secretary', 'name nationalId')
    .populate('treasurer', 'name nationalId');

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
