import asyncHandler from 'express-async-handler';
import userModel from '../models/userModel.js';
import LoanOfficer from '../models/LoanOfficerModel.js';

// POST /api/loan-officers
// Body: { name, phone, email, nationalId }
// Access: super_admin only
const createLoanOfficer = asyncHandler(async (req, res) => {
  const { name, phone, email, nationalId } = req.body;

  if (!name || !phone || !email || !nationalId) {
    res.status(400);
    throw new Error('name, phone, email and nationalId are required');
  }

  // Prevent duplicates by nationalId or email/username
  const exists = await userModel.findOne({ $or: [{ nationalId: String(nationalId).trim() }, { username: String(nationalId).trim() }, { phone: String(phone).trim() }, { username: String(email).trim() }, { nationalId: String(email).trim() }] });
  if (exists) {
    res.status(409);
    throw new Error('User with provided identifier already exists');
  }

  // Create user account with default password
  const username = String(nationalId).trim();
  const defaultPassword = '12345678';

  const user = await userModel.create({
    username,
    password: defaultPassword,
    nationalId: String(nationalId).trim(),
    phone: String(phone).trim(),
    role: 'loan_officer',
    regions: [],
  });

  const profile = await LoanOfficer.create({
    userId: user._id,
    name: String(name).trim(),
    phone: String(phone).trim(),
    email: String(email).trim(),
    nationalId: String(nationalId).trim(),
    createdBy: req.user._id,
  });

  res.status(201).json({ message: 'Loan officer created', user: { _id: user._id, username: user.username, role: user.role }, profile });
});

// GET /api/loan-officers
// Access: super_admin only (list all officers)
const listLoanOfficers = asyncHandler(async (req, res) => {
  const officers = await LoanOfficer.find()
    .sort({ createdAt: -1 })
    .populate('userId', 'username role');

  res.json({ data: officers });
});

export { createLoanOfficer, listLoanOfficers };
