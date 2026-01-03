// controllers/authController.js
import userModel from '../models/userModel.js';
import Branch from '../models/BranchModel.js';
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';

const signToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      regions: user.regions || [],
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400);
    throw new Error('Username and password required');
  }

  const user = await userModel.findOne({
    username: username.trim(),
  });

  if (!user || user.status !== 'active') {
    res.status(401);
    throw new Error('Account inactive or invalid credentials');
  }

  const match = await user.matchPassword(password);
  if (!match) {
    res.status(401);
    throw new Error('Invalid credentials');
  }

  const token = signToken(user);

  // Set token as an HTTP-only cookie so frontend pages (including nested frames)
  // can reuse the session without needing to manually attach Authorization headers.
  // Frontend may still read the token from the JSON response when necessary.
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 1 day
  };

  res.cookie('token', token, cookieOptions);

  res.json({
    _id: user._id,
    username: user.username,
    role: user.role,
    regions: user.regions,
    token,
  });
});

// POST /api/auth/register (super_admin only)
const register = asyncHandler(async (req, res) => {
  const { username, password, nationalId, phone, role, regions, branchId } = req.body;

  const allowedRoles = [
    'admin',
    'loan_officer',
  ];

  if (!allowedRoles.includes(role)) {
    res.status(400);
    throw new Error('Invalid role assignment. Allowed roles: admin, loan_officer');
  }

  // Validate branchId is required for admin and loan_officer
  if ((role === 'admin' || role === 'loan_officer') && !branchId) {
    res.status(400);
    throw new Error('Branch ID is required for admin and loan_officer roles');
  }

  // Verify branch exists
  if (branchId) {
    const branch = await Branch.findById(branchId);
    if (!branch) {
      res.status(404);
      throw new Error('Branch not found');
    }
  }

  const exists = await userModel.findOne({
    $or: [{ username }, { nationalId }],
  });

  if (exists) {
    res.status(409);
    throw new Error('User already exists');
  }

  const user = await userModel.create({
    username: username.trim(),
    password,
    nationalId: nationalId.trim(),
    phone: phone.trim(),
    role,
    branchId: branchId || null,
    regions: Array.isArray(regions) ? regions : [],
  });

  res.status(201).json({
    _id: user._id,
    username: user.username,
    role: user.role,
    branchId: user.branchId,
  });
});

// PUT /api/auth/change-password
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || !newPassword || !confirmPassword) {
    res.status(400);
    throw new Error('currentPassword, newPassword and confirmPassword are required');
  }

  if (newPassword !== confirmPassword) {
    res.status(400);
    throw new Error('New password and confirmation do not match');
  }

  if (String(newPassword).length < 8) {
    res.status(400);
    throw new Error('Password must be at least 8 characters');
  }

  // req.user is attached by auth middleware
  const user = await userModel.findById(req.user._id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }

  const match = await user.matchPassword(currentPassword);
  if (!match) {
    res.status(401);
    throw new Error('Current password is incorrect');
  }

  user.password = newPassword;
  await user.save();

  // Issue a fresh token
  const token = signToken(user);

  res.json({ message: 'Password updated', token });
});

/**
 * ============================
 * CREATE BRANCH (SUPER ADMIN ONLY)
 * ============================
 */
const createBranch = asyncHandler(async (req, res) => {
  const { code, name } = req.body;

  if (!code || !name) {
    res.status(400);
    throw new Error('Branch code and name are required');
  }

  const exists = await Branch.findOne({
    $or: [{ code: code.trim() }, { name: name.trim() }]
  });

  if (exists) {
    res.status(409);
    throw new Error('Branch with this code or name already exists');
  }

  const branch = await Branch.create({
    code: code.trim(),
    name: name.trim()
  });

  res.status(201).json({
    message: 'Branch created successfully',
    branch
  });
});

/**
 * ============================
 * GET ALL BRANCHES
 * ============================
 */
const getBranches = asyncHandler(async (req, res) => {
  const branches = await Branch.find().sort({ name: 1 });
  res.json({ branches });
});

/**
 * ============================
 * ASSIGN/REASSIGN LOAN OFFICER TO GROUP
 * ============================
 */
const assignLoanOfficer = asyncHandler(async (req, res) => {
  const { entityType, entityId, loanOfficerId } = req.body;

  if (!entityType || !entityId || !loanOfficerId) {
    res.status(400);
    throw new Error('entityType, entityId, and loanOfficerId are required');
  }

  // Verify loan officer exists and has correct role
  const officer = await userModel.findById(loanOfficerId);
  if (!officer || officer.role !== 'loan_officer') {
    res.status(404);
    throw new Error('Loan officer not found');
  }

  let updated;
  if (entityType === 'group') {
    const Group = (await import('../models/GroupModel.js')).default;
    updated = await Group.findByIdAndUpdate(
      entityId,
      { $set: { loanOfficer: loanOfficerId } },
      { new: true }
    );
  } else if (entityType === 'client') {
    const Client = (await import('../models/ClientModel.js')).default;
    updated = await Client.findByIdAndUpdate(
      entityId,
      { $set: { loanOfficer: loanOfficerId } },
      { new: true }
    );
  } else {
    res.status(400);
    throw new Error('Invalid entityType. Must be "group" or "client"');
  }

  if (!updated) {
    res.status(404);
    throw new Error(`${entityType} not found`);
  }

  res.json({
    message: `Loan officer assigned to ${entityType}`,
    entity: updated
  });
});

/**
 * ============================
 * GET ALL USERS (SUPER ADMIN)
 * ============================
 */
const getUsers = asyncHandler(async (req, res) => {
  const users = await userModel
    .find()
    .select('-password')
    .populate('branchId', 'name code')
    .sort({ createdAt: -1 });

  res.json({ users });
});

export { 
  login, 
  register, 
  changePassword, 
  createBranch, 
  getBranches, 
  assignLoanOfficer,
  getUsers 
};
