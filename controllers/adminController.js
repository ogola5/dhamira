import asyncHandler from 'express-async-handler';
import userModel from '../models/userModel.js';
import Branch from '../models/BranchModel.js';

// POST /api/admins - Create a new admin
export const createAdmin = asyncHandler(async (req, res) => {
  const { name, username, idNumber, email, phone, password, branchId, role } = req.body;

  // Validate required fields
  if (!username || !password || !idNumber || !branchId) {
    res.status(400);
    throw new Error('username, password, idNumber (nationalId), and branchId are required');
  }

  // Verify branch exists
  const branch = await Branch.findById(branchId);
  if (!branch) {
    res.status(404);
    throw new Error('Branch not found');
  }

  // Check if user already exists
  const exists = await userModel.findOne({
    $or: [{ username }, { nationalId: idNumber }],
  });

  if (exists) {
    res.status(409);
    throw new Error('User with this username or ID number already exists');
  }

  // Create the admin user
  const user = await userModel.create({
    username: username.trim(),
    password,
    nationalId: idNumber.trim(),
    phone: phone?.trim() || '',
    role: 'admin',
    branchId: branchId,
    regions: [branchId],
    status: 'active',
  });

  res.status(201).json({
    _id: user._id,
    username: user.username,
    nationalId: user.nationalId,
    phone: user.phone,
    role: user.role,
    regions: user.regions,
    status: user.status,
    message: 'Admin created successfully',
  });
});

// GET /api/admins - Get all admins
export const getAdmins = asyncHandler(async (req, res) => {
  const admins = await userModel
    .find({ role: 'admin' })
    .select('-password')
    .populate('regions', 'name location');

  res.json({
    count: admins.length,
    admins,
  });
});

// GET /api/admins/:id - Get single admin
export const getAdminById = asyncHandler(async (req, res) => {
  const admin = await userModel
    .findById(req.params.id)
    .select('-password')
    .populate('regions', 'name location');

  if (!admin || admin.role !== 'admin') {
    res.status(404);
    throw new Error('Admin not found');
  }

  res.json(admin);
});

// PUT /api/admins/:id - Update admin
export const updateAdmin = asyncHandler(async (req, res) => {
  const { name, phone, email, branchId, status } = req.body;

  const admin = await userModel.findById(req.params.id);

  if (!admin || admin.role !== 'admin') {
    res.status(404);
    throw new Error('Admin not found');
  }

  // Verify branch if provided
  if (branchId) {
    const branch = await Branch.findById(branchId);
    if (!branch) {
      res.status(404);
      throw new Error('Branch not found');
    }
    admin.regions = [branchId];
  }

  if (phone) admin.phone = phone.trim();
  if (status) admin.status = status;

  await admin.save();

  res.json({
    _id: admin._id,
    username: admin.username,
    nationalId: admin.nationalId,
    phone: admin.phone,
    role: admin.role,
    regions: admin.regions,
    status: admin.status,
    message: 'Admin updated successfully',
  });
});

// DELETE /api/admins/:id - Deactivate admin
export const deactivateAdmin = asyncHandler(async (req, res) => {
  const admin = await userModel.findById(req.params.id);

  if (!admin || admin.role !== 'admin') {
    res.status(404);
    throw new Error('Admin not found');
  }

  admin.status = 'inactive';
  await admin.save();

  res.json({
    message: 'Admin deactivated successfully',
  });
});
