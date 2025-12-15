// controllers/authController.js
import userModel from '../models/userModel.js';
import jwt from 'jsonwebtoken';
import asyncHandler from 'express-async-handler';

// @desc    Login user and get token
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    res.status(400);
    throw new Error('Please provide username and password');
  }

  const user = await userModel.findOne({ username });
  if (user && (await user.matchPassword(password))) {
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );
    res.json({
      _id: user._id,
      username: user.username,
      role: user.role,
      token,
    });
  } else {
    res.status(401);
    throw new Error('Invalid username or password');
  }
});

// @desc    Register new user (admin/officer) - Only super_admin
// @route   POST /api/auth/register
// @access  Private (super_admin only)
const register = asyncHandler(async (req, res) => {
  const { username, password, nationalId, phone, role, regions } = req.body;

  if (!username || !password || !nationalId || !phone || !role) {
    res.status(400);
    throw new Error('Please provide all required fields');
  }

  const userExists = await userModel.findOne({ username });
  if (userExists) {
    res.status(400);
    throw new Error('Username already taken');
  }

  const idExists = await userModel.findOne({ nationalId });
  if (idExists) {
    res.status(400);
    throw new Error('National ID already registered');
  }

  const user = await userModel.create({
    username,
    password, // Hashed automatically
    nationalId,
    phone,
    role,
    regions: regions || [],
  });

  if (user) {
    res.status(201).json({
      _id: user._id,
      username: user.username,
      role: user.role,
    });
  } else {
    res.status(400);
    throw new Error('Invalid user data');
  }
});

export { login, register };