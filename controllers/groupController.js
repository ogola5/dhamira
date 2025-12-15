// controllers/groupController.js
import GroupModel from '../models/GroupModel.js';
import userModel from '../models/userModel.js';
import ClientModel from '../models/ClientModel.js'; // Import for nationalId lookup
import asyncHandler from 'express-async-handler';

// @desc    Create a new group (minimal: no signatories required initially)
// @route   POST /api/groups
// @access  Private (admins or loan officers)
const createGroup = asyncHandler(async (req, res) => {
  const { name, meetingDay, meetingTime, loanOfficerId } = req.body;

  if (!name || !meetingDay || !meetingTime || !loanOfficerId) {
    res.status(400);
    throw new Error('Please provide all required fields including loan officer ID');
  }

  // Check if loan officer exists and has correct role
  const loanOfficer = await userModel.findById(loanOfficerId);
  if (!loanOfficer || loanOfficer.role !== 'loan_officer') {
    res.status(400);
    throw new Error('Invalid loan officer ID');
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
    signatories: [], // Start empty
    loanOfficer: loanOfficerId,
    createdBy: req.user._id,
  });

  res.status(201).json(group);
});

// @desc    Update group (e.g., assign new loan officer)
// @route   PUT /api/groups/:id
// @access  Private (super_admin only)
const updateGroup = asyncHandler(async (req, res) => {
  const group = await GroupModel.findById(req.params.id);
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  const { loanOfficerId } = req.body;
  if (loanOfficerId) {
    const loanOfficer = await userModel.findById(loanOfficerId);
    if (!loanOfficer || loanOfficer.role !== 'loan_officer') {
      res.status(400);
      throw new Error('Invalid loan officer ID');
    }
    group.loanOfficer = loanOfficerId;
  }

  // Allow updating other fields if needed (e.g., meetingDay, etc.)
  if (req.body.meetingDay) group.meetingDay = req.body.meetingDay;
  if (req.body.meetingTime) group.meetingTime = req.body.meetingTime;

  await group.save();
  res.json(group);
});

// @desc    Assign signatories to group (from existing members, using national IDs)
// @route   PUT /api/groups/:id/assign-signatories
// @access  Private (loan_officer or super_admin)
const assignSignatories = asyncHandler(async (req, res) => {
  // Debug logs - remove after fixing
  console.log('Request method:', req.method);
  console.log('Content-Type header:', req.headers['content-type']);
  console.log('Raw req.body:', req.body);
  console.log('req.body type:', typeof req.body);

  if (!req.body) {
    res.status(400);
    throw new Error('Request body is missing or not parsed. Ensure Content-Type: application/json header is set and body is raw JSON.');
  }

  const group = await GroupModel.findById(req.params.id).populate('members', 'nationalId name phone');
  if (!group) {
    res.status(404);
    throw new Error('Group not found');
  }

  const { signatoryAssignments } = req.body;
  if (!signatoryAssignments || !Array.isArray(signatoryAssignments) || signatoryAssignments.length !== 3) {
    res.status(400);
    throw new Error('Must assign exactly 3 signatories');
  }

  // Validate roles and find members by nationalId
  const newSignatories = [];
  const roleSet = new Set();
  for (const assignment of signatoryAssignments) {
    if (!['chairperson', 'secretary', 'treasurer'].includes(assignment.role)) {
      res.status(400);
      throw new Error('Invalid role');
    }
    if (roleSet.has(assignment.role)) {
      res.status(400);
      throw new Error('Duplicate roles not allowed');
    }
    roleSet.add(assignment.role);

    const member = group.members.find(m => m.nationalId === assignment.memberNationalId);
    if (!member) {
      res.status(400);
      throw new Error(`Member with national ID ${assignment.memberNationalId} not found in group`);
    }
    newSignatories.push({ role: assignment.role, clientId: member._id });
  }

  group.signatories = newSignatories;
  await group.save();

  res.json({ message: 'Signatories assigned successfully', group });
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

export { createGroup, updateGroup, getGroups, assignSignatories };