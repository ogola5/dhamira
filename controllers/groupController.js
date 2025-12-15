// controllers/groupController.js
import GroupModel from '../models/GroupModel.js';
import userModel from '../models/UserModel.js';
import asyncHandler from 'express-async-handler';

// @desc    Create a new group
// @route   POST /api/groups
// @access  Private (admins or loan officers)
const createGroup = asyncHandler(async (req, res) => {
  const { name, meetingDay, meetingTime, loanOfficerId } = req.body;

  if (!name || !meetingDay || !meetingTime || !loanOfficerId) {
    res.status(400);
    throw new Error('All fields are required');
  }

  const loanOfficer = await userModel.findById(loanOfficerId);
  if (!loanOfficer || loanOfficer.role !== 'loan_officer') {
    res.status(400);
    throw new Error('Invalid loan officer');
  }

  const groupExists = await GroupModel.findOne({ name });
  if (groupExists) {
    res.status(400);
    throw new Error('Group name already exists');
  }

  const group = await GroupModel.create({
    name,
    meetingDay,
    meetingTime,
    loanOfficer: loanOfficerId,
    signatories: [],
    members: [],
    createdBy: req.user._id,
  });

  res.status(201).json(group);
});

// @desc    Update group
// @route   PUT /api/groups/:id
// @access  Private (super_admin)
const updateGroup = asyncHandler(async (req, res) => {
  const group = await GroupModel.findById(req.params.id);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  if (req.body.loanOfficerId) {
    const officer = await userModel.findById(req.body.loanOfficerId);
    if (!officer || officer.role !== 'loan_officer') {
      res.status(400);
      throw new Error('Invalid loan officer');
    }
    group.loanOfficer = req.body.loanOfficerId;
  }

  if (req.body.meetingDay) group.meetingDay = req.body.meetingDay;
  if (req.body.meetingTime) group.meetingTime = req.body.meetingTime;

  await group.save();
  res.json(group);
});

// @desc    Assign signatories to group
// @route   PUT /api/groups/:id/assign-signatories
// @access  Private (loan_officer or super_admin)
const assignSignatories = asyncHandler(async (req, res) => {
  const { signatoryAssignments } = req.body;

  if (!Array.isArray(signatoryAssignments) || signatoryAssignments.length !== 3) {
    res.status(400);
    throw new Error('Exactly 3 signatories are required');
  }

  const group = await GroupModel.findById(req.params.id).populate('members', 'nationalId');
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  const roles = new Set();
  const signatories = [];

  for (const { role, memberNationalId } of signatoryAssignments) {
    if (roles.has(role)) {
      res.status(400);
      throw new Error('Duplicate signatory role');
    }
    roles.add(role);

    const member = group.members.find(m => m.nationalId === memberNationalId);
    if (!member) {
      res.status(400);
      throw new Error(`Member ${memberNationalId} not in group`);
    }

    signatories.push({ role, clientId: member._id });
  }

  group.signatories = signatories;
  await group.save();

  res.json({ message: 'Signatories assigned', group });
});

// @desc    Get all groups
// @route   GET /api/groups
// @access  Private
const getGroups = asyncHandler(async (req, res) => {
  const groups = await GroupModel.find({})
    .populate('signatories.clientId', 'name phone')
    .populate('loanOfficer', 'username phone regions')
    .populate('members', 'name nationalId phone');

  res.json(groups);
});

export { createGroup, updateGroup, assignSignatories, getGroups };
