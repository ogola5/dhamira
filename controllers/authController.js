// controllers/authController.js
import userModel from '../models/userModel.js';
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';

// Helper: sign JWT
const signToken = (user) => {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
      regions: user.regions || [],
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );
};

// @desc    Login user (loan officers / admins)
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400);
    throw new Error('Username and password are required');
  }

  const normalizedUsername = username.trim();

  const user = await userModel.findOne({ username: normalizedUsername });
  if (!user) {
    res.status(401);
    throw new Error('Invalid username or password');
  }

  const passwordMatch = await user.matchPassword(password);
  if (!passwordMatch) {
    res.status(401);
    throw new Error('Invalid username or password');
  }

  const token = signToken(user);

  res.json({
    _id: user._id,
    username: user.username,
    role: user.role,
    regions: user.regions,
    token,
  });
});

// @desc    Register new internal user (admins / loan officers)
// @route   POST /api/auth/register
// @access  Private (super_admin only)
const register = asyncHandler(async (req, res) => {
  const { username, password, nationalId, phone, role, regions } = req.body;

  if (!username || !password || !nationalId || !phone || !role) {
    res.status(400);
    throw new Error('All required fields must be provided');
  }

  // Enforce allowed internal roles explicitly
  const allowedRoles = [
    'super_admin',
    'initiator_admin',
    'approver_admin',
    'loan_officer',
  ];

  if (!allowedRoles.includes(role)) {
    res.status(400);
    throw new Error('Invalid role');
  }

  const normalizedUsername = username.trim();
  const normalizedNationalId = nationalId.trim();
  const normalizedPhone = phone.trim();

  const userExists = await userModel.findOne({ username: normalizedUsername });
  if (userExists) {
    res.status(409);
    throw new Error('Username already exists');
  }

  const idExists = await userModel.findOne({ nationalId: normalizedNationalId });
  if (idExists) {
    res.status(409);
    throw new Error('National ID already registered');
  }

  const user = await userModel.create({
    username: normalizedUsername,
    password, // hashed by model
    nationalId: normalizedNationalId,
    phone: normalizedPhone,
    role,
    regions: Array.isArray(regions) ? regions : [],
  });

  res.status(201).json({
    _id: user._id,
    username: user.username,
    role: user.role,
    regions: user.regions,
  });
});

export { login, register };
