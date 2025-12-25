// controllers/authController.js
import userModel from '../models/userModel.js';
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
  const { username, password, nationalId, phone, role, regions } = req.body;

  const allowedRoles = [
    'initiator_admin',
    'approver_admin',
    'loan_officer',
  ];

  if (!allowedRoles.includes(role)) {
    res.status(400);
    throw new Error('Invalid role assignment');
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
    regions: Array.isArray(regions) ? regions : [],
  });

  res.status(201).json({
    _id: user._id,
    username: user.username,
    role: user.role,
  });
});

export { login, register };
